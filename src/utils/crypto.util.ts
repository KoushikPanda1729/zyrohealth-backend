import * as crypto from 'crypto';
import { env } from '../config/env';

// Symmetric encryption for secrets stored at rest (e.g. per-tenant WhatsApp
// provider credentials) — env vars are fine for the platform's own
// credentials, but tenant-supplied secrets live in the database and must
// not sit there in plaintext.
const ALGORITHM = 'aes-256-gcm';
const key = crypto
  .createHash('sha256')
  .update(env.SECRETS_ENCRYPTION_KEY)
  .digest();

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, encrypted].map((b) => b.toString('base64')).join('.');
}

export function decryptSecret(ciphertext: string): string {
  const [ivB64, tagB64, dataB64] = ciphertext.split('.');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Malformed encrypted secret');
  }
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivB64, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
