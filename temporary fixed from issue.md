> Anyone with access to Mythos that can get this working?

Done :)

# Browser-authenticated WhatsApp Web -> Baileys auth bridge

I got a Baileys client working from a WhatsApp Web session that was authenticated in a real browser. This is useful for passkey/WebAuthn flows: let Chrome complete the login, then materialize a Baileys `useMultiFileAuthState()` directory from the browser profile.

Everything below is sanitized. Replace example JIDs with your own values and do not log real key material.

## High-level flow

1. Authenticate `https://web.whatsapp.com` in Chrome/Chromium.
2. Attach Puppeteer to that already-authenticated browser profile.
3. Read WhatsApp Web auth state from:
   - `localStorage`: `WANoiseInfo`, `WANoiseInfoIv`, `WAWebEncKeySalt`, `last-wid-md`, `WALid`
   - IndexedDB `wawc_db_enc`: non-extractable browser `CryptoKey`
   - IndexedDB `signal-storage`: identity, registration id, prekeys, signed prekey, ADV identity
4. Decrypt the wrapped Noise and Signal static identity values inside the browser.
5. Write a Baileys multi-file auth directory.
6. Start Baileys with `creds.me.id` set to the full companion-device JID, e.g.:

```ts
creds.me = {
  id: '<phone>:<device>@s.whatsapp.net',
  lid: '<lid>:<device>@lid',
  name: '~',
};
```

The `:<device>` suffix matters. For a linked WhatsApp Web companion, the bare phone JID is not the same identity as the companion-device JID.

## Browser extraction

Run this inside `page.evaluate()` on an authenticated `web.whatsapp.com` page. It serializes ArrayBuffers/Uint8Arrays safely without exporting non-extractable `CryptoKey`s.

```js
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
```

## Decrypting `WANoiseInfo`

`WANoiseInfo` contains encrypted Noise keys. The decryption key can be derived from the non-extractable browser `CryptoKey` in `wawc_db_enc.keys[1]`, using `WAWebEncKeySalt`.

This produces candidate private/public Noise key pairs. Pick the candidate that opens a Baileys socket.

```js
const dbKey = (await getRecord('wawc_db_enc', 'keys', 1)).key;
const salt = fromB64(JSON.parse(localStorage.getItem('WAWebEncKeySalt')));
const ivs = JSON.parse(localStorage.getItem('WANoiseInfoIv')).map(fromB64);
const noise = JSON.parse(localStorage.getItem('WANoiseInfo'));

const noiseCiphertexts = {
  private: fromB64(noise.privKey),
  public: fromB64(noise.pubKey),
};

const candidates = [];

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
        candidates.push({
          privIv,
          pubIv,
          privateB64: b64(privateKey),
          publicB64: b64(publicKey),
        });
      }
    } catch {
      // Ignore candidate combinations that do not decrypt cleanly.
    }
  }
}
```

## Decrypting Signal static identity keys

Important detail: `signal_static_privkey.value.value` and `signal_static_pubkey.value.value` are not the plaintext static identity keys. They are AES-CTR ciphertexts. Each record also has a non-extractable `encKey`.

Decrypt them in the browser with the record's own `encKey`.

```js
async function decryptSignalStaticRecord(name) {
  const rec = await getRecord('signal-storage', 'signal-meta-store', name);
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
    throw new Error(`${name} decrypted to unexpected length: ${plaintext.byteLength}`);
  }

  return b64(plaintext);
}

const signedIdentityPrivateB64 = await decryptSignalStaticRecord('signal_static_privkey');
const signedIdentityPublicB64 = await decryptSignalStaticRecord('signal_static_pubkey');
```

You can sanity-check the decrypted public key against the browser identity store. The identity store key for the linked device should contain the same public key with Signal's `0x05` prefix.

```js
const selfLid = JSON.parse(localStorage.getItem('WALid')); // '<lid>:<device>@lid'
const selfIdentity = await getRecord('signal-storage', 'identity-store', `${selfLid}.0`);

// selfIdentity.identityKey is 33 bytes and starts with 0x05.
// signedIdentityPublic is 32 bytes.
```

## Reading Signal stores

These map fairly directly to Baileys' auth files:

```js
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
```

Prekeys and signed prekeys are already usable as 32-byte X25519 key pairs:

```js
function keyPairFromWeb(webKeyPair) {
  return {
    private: Buffer.from(webKeyPair.privKey.__ab, 'base64'),
    public: Buffer.from(webKeyPair.pubKey.__ab, 'base64'),
  };
}
```

ADV signed identity fields need to be written as byte buffers, not base64 strings:

```js
function fromAb(value) {
  return Buffer.from(value.__ab, 'base64');
}

const adv = signalMeta.adv_signed_identity.value;

const account = {
  details: fromAb(adv.details),
  accountSignatureKey: fromAb(adv.accountSignatureKey),
  accountSignature: fromAb(adv.accountSignature),
  deviceSignature: fromAb(adv.deviceSignature),
};
```

## Constructing `creds.json`

Once Noise and Signal static identity are decrypted, create Baileys credentials.

The `signedPreKey.signature` should be recomputed with the decrypted Signal static private key, because it must verify against the decrypted Signal static public key.

```ts
import { Curve } from '@whiskeysockets/baileys';

const signedPreKeyRow = signedPreKeys.find(
  (row) => row.value.keyId === signalMeta.signal_last_spk_id.value,
);

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
  registrationId: signalMeta.signal_reg_id.value,
  advSecretKey: JSON.parse(localStorage.getItem('WANoiseInfo')).recoveryToken,
  me: {
    id: '<phone>:<device>@s.whatsapp.net',
    lid: '<lid>:<device>@lid',
    name: '~',
  },
  account,
  firstUnuploadedPreKeyId: signalMeta.signal_first_unupload_pk_id.value,
  nextPreKeyId: signalMeta.signal_next_pk_id.value,
  lastAccountSyncTimestamp: Math.floor(Date.now() / 1000),
  platform: 'android',
  processedHistoryMessages: [],
  accountSyncCounter: 1,
  accountSettings: { unarchiveChats: false },
  registered: true,
};
```

Write with Baileys' `BufferJSON.replacer`:

```ts
import { BufferJSON } from '@whiskeysockets/baileys';
import fs from 'node:fs';

fs.writeFileSync(
  `${authDir}/creds.json`,
  JSON.stringify(creds, BufferJSON.replacer, 2),
);
```

## Writing key-store files

Use the same naming convention as `useMultiFileAuthState()`.

```ts
for (const row of preKeys) {
  const id = String(row.key);
  const keyPair = keyPairFromWeb(row.value.keyPair);

  fs.writeFileSync(
    `${authDir}/pre-key-${id}.json`,
    JSON.stringify(keyPair, BufferJSON.replacer, 2),
  );
}

for (const row of identities) {
  const id = String(row.key).replace(/:/g, '.');
  const identityKey =
    typeof row.value.identityKey === 'string'
      ? Buffer.from(Array.from(row.value.identityKey, (ch) => ch.charCodeAt(0)))
      : Buffer.from(row.value.identityKey.__ab, 'base64');

  fs.writeFileSync(
    `${authDir}/identity-key-${id}.json`,
    JSON.stringify(identityKey, BufferJSON.replacer, 2),
  );
}
```

## Sanity checks

Before starting a real socket, validate key agreement and signatures locally.

```ts
const dh1 = Curve.sharedKey(
  creds.signedIdentityKey.private,
  creds.signedPreKey.keyPair.public,
);
const dh2 = Curve.sharedKey(
  creds.signedPreKey.keyPair.private,
  creds.signedIdentityKey.public,
);

if (!Buffer.from(dh1).equals(Buffer.from(dh2))) {
  throw new Error('Signal identity key agreement check failed');
}

if (
  !Curve.verify(
    creds.signedIdentityKey.public,
    creds.signedPreKey.keyPair.public,
    creds.signedPreKey.signature,
  )
) {
  throw new Error('signedPreKey signature check failed');
}
```

Then test a minimal Baileys login:

```ts
import makeWASocket, {
  Browsers,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import { pino } from 'pino';

const { state, saveCreds } = await useMultiFileAuthState(authDir);
const logger = pino({ level: 'silent' });

const sock = makeWASocket({
  version: [2, 3000, 1042401057],
  auth: {
    creds: state.creds,
    keys: makeCacheableSignalKeyStore(state.keys, logger),
  },
  browser: Browsers.macOS('Chrome'),
  printQRInTerminal: false,
  logger,
});

sock.ev.on('creds.update', saveCreds);
sock.ev.on('connection.update', (update) => {
  console.log({
    connection: update.connection,
    reason: update.lastDisconnect?.error?.output?.statusCode,
  });
});
```

## Main takeaways

- A real browser can complete the current WhatsApp Web passkey/WebAuthn login.
- The authenticated browser profile contains enough state to create a Baileys auth directory.
- `creds.me.id` should be the linked companion-device JID, not the bare phone JID.
- `WANoiseInfo` must be decrypted with the browser-side `CryptoKey` from `wawc_db_enc`.
- `signal_static_privkey` and `signal_static_pubkey` must also be decrypted in-browser with their own `encKey`.
- ADV signed identity byte fields must be written as bytes.
- Recompute `signedPreKey.signature` after setting the decrypted Signal static identity key.

