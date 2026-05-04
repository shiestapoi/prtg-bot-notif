import { makeKeyvAuthState } from '@rodrigogs/baileys-store';
import KeyvPostgres from '@keyv/postgres';
import Keyv from 'keyv';
import type { AuthenticationState } from 'baileys';

export type KeyvBaileysAuthState = {
  clearState: () => Promise<void>;
  saveCreds: () => Promise<void> | void;
  state: {
    creds: AuthenticationState['creds'];
    keys: unknown;
  };
};

let keyvInstance: Keyv | null = null;

function getKeyvStore() {
  if (keyvInstance) {
    return keyvInstance;
  }

  const postgresUrl =
    process.env.WHATSAPP_AUTH_POSTGRES_URL?.trim() || process.env.DATABASE_URL?.trim();

  if (!postgresUrl) {
    throw new Error(
      'WhatsApp auth storage requires WHATSAPP_AUTH_POSTGRES_URL or DATABASE_URL.',
    );
  }

  const store = new KeyvPostgres(postgresUrl);
  keyvInstance = new Keyv({ store, namespace: 'baileys' });
  return keyvInstance;
}

export async function createAuthState(sessionName: string): Promise<KeyvBaileysAuthState> {
  const store = getKeyvStore();
  const authState = (await makeKeyvAuthState(store as never, sessionName)) as KeyvBaileysAuthState;
  return authState;
}

export async function clearAuthState(sessionName: string) {
  const authState = await createAuthState(sessionName);
  await authState.clearState();
}
