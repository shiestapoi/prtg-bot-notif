import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { Curve, BufferJSON } from '@whiskeysockets/baileys';

const DUMP_DIR = path.join(process.cwd(), 'temp', 'baileys_auth_dump');

async function main() {
  console.log('Starting WhatsApp Web extraction bridge...');
  
  // Create output directory
  if (!fs.existsSync(DUMP_DIR)) {
    fs.mkdirSync(DUMP_DIR, { recursive: true });
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('Navigating to https://web.whatsapp.com...');
  await page.goto('https://web.whatsapp.com');

  console.log('Please scan the QR code or complete the Passkey login in the browser window.');
  console.log('Waiting for login to complete...');

  // Set timeout to 0 (infinite) so it won't crash after 30 seconds
  page.setDefaultTimeout(0);

  // Wait for a successful login indicator. 'last-wid-md' only appears AFTER a successful scan/login.
  await page.waitForFunction(() => {
    return localStorage.getItem('last-wid-md') !== null;
  });

  console.log('Login detected! Wait a few seconds for databases to sync...');
  await page.waitForTimeout(5000);

  console.log('Extracting and decrypting keys within the browser...');

  // Run the extraction logic inside the browser page
  const extractionResult = await page.evaluate(`(async () => {
    function b64(bytes) {
      const arr =
        bytes instanceof ArrayBuffer
          ? new Uint8Array(bytes)
          : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);

      let s = '';
      for (const b of arr) s += String.fromCharCode(b);
      return btoa(s);
    }

    function fromB64(value) {
      return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
    }

    function encode(value) {
      if (value == null) return value;
      if (value instanceof ArrayBuffer) return { __ab: b64(value) };
      if (ArrayBuffer.isView(value)) return { __ab: b64(value) };
      if (Array.isArray(value)) return value.map(encode);
      if (typeof value === 'object') {
        if (value.constructor?.name === 'CryptoKey') return { __cryptoKey: true };
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encode(v)]));
      }
      return value;
    }

    async function getRecord(dbName, storeName, key) {
      return await new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(storeName, 'readonly');
          const get = tx.objectStore(storeName).get(key);
          get.onsuccess = () => {
            db.close();
            resolve(get.result);
          };
          get.onerror = () => {
            db.close();
            reject(get.error);
          };
        };
      });
    }

    async function readAll(dbName, storeName) {
      return await new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(storeName, 'readonly');
          const cursor = tx.objectStore(storeName).openCursor();
          const rows = [];

          cursor.onsuccess = () => {
            const c = cursor.result;
            if (c) {
              rows.push({ key: encode(c.key), value: encode(c.value) });
              c.continue();
            }
          };

          tx.oncomplete = () => {
            db.close();
            resolve(rows);
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        };
      });
    }

    // 1. Decrypt WANoiseInfo
    const wawcDbEncKeys1 = await getRecord('wawc_db_enc', 'keys', 1);
    if (!wawcDbEncKeys1) throw new Error("Missing wawc_db_enc keys[1]");
    const dbKey = wawcDbEncKeys1.key;
    const salt = fromB64(JSON.parse(localStorage.getItem('WAWebEncKeySalt')));
    const ivs = JSON.parse(localStorage.getItem('WANoiseInfoIv')).map(fromB64);
    const noise = JSON.parse(localStorage.getItem('WANoiseInfo'));

    const noiseCiphertexts = {
      private: fromB64(noise.privKey),
      public: fromB64(noise.pubKey),
    };

    const noiseCandidates = [];
    for (let privIv = 0; privIv < ivs.length; privIv += 1) {
      for (let pubIv = 0; pubIv < ivs.length; pubIv += 1) {
        try {
          const key = await crypto.subtle.deriveKey(
            { name: 'HKDF', hash: 'SHA-256', salt, info: new Uint8Array([0]) },
            dbKey,
            { name: 'AES-CBC', length: 128 },
            false,
            ['decrypt'],
          );

          const privateKey = await crypto.subtle.decrypt(
            { name: 'AES-CBC', iv: ivs[privIv] },
            key,
            noiseCiphertexts.private,
          );
          const publicKey = await crypto.subtle.decrypt(
            { name: 'AES-CBC', iv: ivs[pubIv] },
            key,
            noiseCiphertexts.public,
          );

          if (privateKey.byteLength === 32 && publicKey.byteLength === 32) {
            noiseCandidates.push({
              privIv,
              pubIv,
              privateB64: b64(privateKey),
              publicB64: b64(publicKey),
            });
          }
        } catch {
          // Ignore
        }
      }
    }

    if (noiseCandidates.length === 0) {
      throw new Error("Failed to decrypt WANoiseInfo.");
    }
    const noiseCandidate = noiseCandidates[0]; // just use the first valid one

    // 2. Decrypt Signal Static Keys
    async function decryptSignalStaticRecord(name) {
      const rec = await getRecord('signal-storage', 'signal-meta-store', name);
      if (!rec) throw new Error(\`Missing \${name}\`);
      const encryptedValue = rec.value.value;
      const encKey = rec.value.encKey;

      const plaintext = await crypto.subtle.decrypt(
        {
          name: 'AES-CTR',
          counter: new Uint8Array(16),
          length: 64,
        },
        encKey,
        encryptedValue,
      );

      if (plaintext.byteLength !== 32) {
        throw new Error(\`\${name} decrypted to unexpected length: \${plaintext.byteLength}\`);
      }

      return b64(plaintext);
    }

    const signedIdentityPrivateB64 = await decryptSignalStaticRecord('signal_static_privkey');
    const signedIdentityPublicB64 = await decryptSignalStaticRecord('signal_static_pubkey');

    // 3. Read Signal Stores
    const signalMeta = Object.fromEntries(
      await Promise.all(
        [
          'signal_reg_id',
          'signal_next_pk_id',
          'signal_first_unupload_pk_id',
          'signal_last_spk_id',
          'adv_signed_identity',
        ].map(async (key) => [key, encode(await getRecord('signal-storage', 'signal-meta-store', key))]),
      ),
    );

    const preKeys = await readAll('signal-storage', 'prekey-store');
    const signedPreKeys = await readAll('signal-storage', 'signed-prekey-store');
    const identities = await readAll('signal-storage', 'identity-store');

    const meRaw = localStorage.getItem('last-wid-md');
    const meId = meRaw ? JSON.parse(meRaw) : '';
    const lidRaw = localStorage.getItem('WALid');
    const lidId = lidRaw ? JSON.parse(lidRaw) : '';
    
    return {
      noiseCandidate,
      signedIdentityPrivateB64,
      signedIdentityPublicB64,
      signalMeta,
      preKeys,
      signedPreKeys,
      identities,
      meId,
      lidId,
      noiseRecoveryToken: noise.recoveryToken
    };
  })();`);

  console.log('Extraction complete. Processing credentials...');
  
  function keyPairFromWeb(webKeyPair: any) {
    return {
      private: Buffer.from(webKeyPair.privKey.__ab, 'base64'),
      public: Buffer.from(webKeyPair.pubKey.__ab, 'base64'),
    };
  }

  function fromAb(value: any) {
    return Buffer.from(value.__ab, 'base64');
  }

  const {
    noiseCandidate,
    signedIdentityPrivateB64,
    signedIdentityPublicB64,
    signalMeta,
    preKeys,
    signedPreKeys,
    identities,
    meId,
    lidId,
    noiseRecoveryToken
  } = extractionResult;

  const adv = signalMeta.adv_signed_identity?.value;
  const account = adv ? {
    details: fromAb(adv.details),
    accountSignatureKey: fromAb(adv.accountSignatureKey),
    accountSignature: fromAb(adv.accountSignature),
    deviceSignature: fromAb(adv.deviceSignature),
  } : undefined;

  const lastSpkId = signalMeta.signal_last_spk_id?.value;
  let signedPreKeyRow = signedPreKeys.find(
    (row: any) => row.value.keyId === lastSpkId,
  );
  if (!signedPreKeyRow && signedPreKeys.length > 0) {
    // Fallback: pick the one with the highest keyId
    signedPreKeyRow = signedPreKeys.sort((a: any, b: any) => b.value.keyId - a.value.keyId)[0];
  }
  if (!signedPreKeyRow) {
    throw new Error("Could not find any signed pre-keys.");
  }

  const signedIdentityKey = {
    private: Buffer.from(signedIdentityPrivateB64, 'base64'),
    public: Buffer.from(signedIdentityPublicB64, 'base64'),
  };

  const signedPreKey = {
    keyPair: keyPairFromWeb(signedPreKeyRow.value.keyPair),
    keyId: signedPreKeyRow.value.keyId,
    signature: Curve.sign(
      signedIdentityKey.private,
      keyPairFromWeb(signedPreKeyRow.value.keyPair).public,
    ),
  };

  const creds = {
    noiseKey: {
      private: Buffer.from(noiseCandidate.privateB64, 'base64'),
      public: Buffer.from(noiseCandidate.publicB64, 'base64'),
    },
    pairingEphemeralKeyPair: Curve.generateKeyPair(),
    signedIdentityKey,
    signedPreKey,
    registrationId: signalMeta.signal_reg_id?.value || 0,
    advSecretKey: noiseRecoveryToken,
    me: {
      id: meId,
      lid: lidId,
      name: '~',
    },
    account,
    firstUnuploadedPreKeyId: signalMeta.signal_first_unupload_pk_id?.value || 0,
    nextPreKeyId: signalMeta.signal_next_pk_id?.value || 0,
    lastAccountSyncTimestamp: Math.floor(Date.now() / 1000),
    platform: 'android',
    processedHistoryMessages: [],
    accountSyncCounter: 1,
    accountSettings: { unarchiveChats: false },
    registered: true,
  };

  // Write files to temp/baileys_auth_dump
  fs.writeFileSync(
    path.join(DUMP_DIR, 'creds.json'),
    JSON.stringify(creds, BufferJSON.replacer, 2),
  );

  for (const row of preKeys) {
    const id = String(row.key);
    const keyPair = keyPairFromWeb(row.value.keyPair);
    fs.writeFileSync(
      path.join(DUMP_DIR, `pre-key-${id}.json`),
      JSON.stringify(keyPair, BufferJSON.replacer, 2),
    );
  }

  for (const row of identities) {
    const id = String(row.key).replace(/:/g, '.');
    const identityKey =
      typeof row.value.identityKey === 'string'
        ? Buffer.from(Array.from(row.value.identityKey, (ch: any) => ch.charCodeAt(0)))
        : Buffer.from(row.value.identityKey.__ab, 'base64');

    fs.writeFileSync(
      path.join(DUMP_DIR, `identity-key-${id}.json`),
      JSON.stringify(identityKey, BufferJSON.replacer, 2),
    );
  }

  for (const row of signedPreKeys) {
    const id = String(row.key);
    const keyPair = keyPairFromWeb(row.value.keyPair);
    // Write just in case we need app-state-sync-key format later
    fs.writeFileSync(
      path.join(DUMP_DIR, `app-state-sync-key-${id}.json`),
      JSON.stringify(keyPair, BufferJSON.replacer, 2),
    );
  }

  console.log(`Success! Extracted credentials saved to ${DUMP_DIR}`);
  console.log('You can now upload this folder to your VPS and run the import script.');
  
  await browser.close();
}

main().catch(err => {
  console.error("Extraction failed:", err);
  process.exit(1);
});
