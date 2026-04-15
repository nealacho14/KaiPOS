import { webcrypto } from 'node:crypto';

// Polyfill globalThis.crypto for jose and crypto.randomUUID in Node 18/20 test environments
if (!globalThis.crypto) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).crypto = webcrypto;
}
