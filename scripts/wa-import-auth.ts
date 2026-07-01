import * as fs from 'fs';
import * as path from 'path';
import { BufferJSON } from '@whiskeysockets/baileys';
import { createAuthState, clearAuthState } from '../src/whatsapp/auth/whatsapp-auth';

const DUMP_DIR = path.join(process.cwd(), 'temp', 'baileys_auth_dump');
const SESSION_NAME = 'haruyaki';

async function main() {
  console.log(`Starting WhatsApp Web import bridge...`);
  
  if (!fs.existsSync(DUMP_DIR)) {
    throw new Error(`Dump directory not found: ${DUMP_DIR}`);
  }

  const credsPath = path.join(DUMP_DIR, 'creds.json');
  if (!fs.existsSync(credsPath)) {
    throw new Error(`creds.json not found in ${DUMP_DIR}`);
  }

  console.log(`Clearing existing auth state for session: ${SESSION_NAME}...`);
  await clearAuthState(SESSION_NAME);

  console.log('Initializing fresh auth state store...');
  const authState = await createAuthState(SESSION_NAME);

  // Load creds
  const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'), BufferJSON.reviver);
  Object.assign(authState.state.creds, creds);
  
  await authState.saveCreds();
  console.log('creds.json loaded and saved.');

  const files = fs.readdirSync(DUMP_DIR);
  
  // Create an object to hold all keys to set at once
  const dataToSet: Record<string, Record<string, any>> = {};

  for (const file of files) {
    if (file === 'creds.json') continue;
    
    // files are like pre-key-1.json, identity-key-abc.json, app-state-sync-key-123.json
    const match = file.match(/^(.*?)-([^]+)\.json$/);
    if (!match) continue;

    const category = match[1]; // e.g. 'pre-key', 'identity-key'
    const id = match[2];

    const fileData = JSON.parse(fs.readFileSync(path.join(DUMP_DIR, file), 'utf8'), BufferJSON.reviver);
    
    if (!dataToSet[category]) {
       dataToSet[category] = {};
    }
    dataToSet[category][id] = fileData;
  }

  console.log('Saving keys to database...');
  const types = Object.keys(dataToSet);
  for (const type of types) {
    console.log(` - Saving ${Object.keys(dataToSet[type]).length} items for type: ${type}`);
  }

  // Set all keys in the store
  // @ts-ignore - The 'set' signature in Baileys takes { [type: string]: { [id: string]: any } }
  await authState.state.keys.set(dataToSet);

  console.log('Success! Auth state has been imported to the database.');
  console.log('You can now restart your WhatsApp bot service.');
}

main().catch(err => {
  console.error("Import failed:", err);
  process.exit(1);
});
