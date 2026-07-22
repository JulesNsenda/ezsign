import crypto from 'crypto';

/**
 * AES-256-GCM helpers for encrypting instance-settings secrets (e.g. `smtp.pass`)
 * at rest in the `instance_settings` table.
 *
 * The encryption key is derived via HKDF-SHA256 over `SETTINGS_ENCRYPTION_KEY`
 * (preferred) or `JWT_SECRET` (fallback - the coupling is documented in the
 * plan; production deployments should set SETTINGS_ENCRYPTION_KEY explicitly).
 * The key is re-derived on every call rather than cached, so a changed env
 * var takes effect immediately without a process restart being required for
 * the *reading* half of this module to notice (encrypting with a new key is
 * always immediate; decrypting old ciphertext after rotation will fail loudly,
 * which is the intended behavior - see plan "Risks" section).
 */

const HKDF_SALT = 'ezsign-instance-settings';
const HKDF_INFO = 'settings-encryption-v1';
const KEY_LENGTH_BYTES = 32; // AES-256
const IV_LENGTH_BYTES = 12; // recommended IV length for GCM
const ALGORITHM = 'aes-256-gcm';

/**
 * Derives the AES-256 key used to encrypt/decrypt instance settings secrets.
 * Throws immediately (at call time, not import time) if neither source env
 * var is configured.
 */
function getEncryptionKey(): Buffer {
  const keySource = process.env.SETTINGS_ENCRYPTION_KEY || process.env.JWT_SECRET;

  if (!keySource) {
    throw new Error(
      'Cannot encrypt/decrypt instance settings secrets: set SETTINGS_ENCRYPTION_KEY ' +
        '(preferred) or JWT_SECRET (fallback) in the environment.'
    );
  }

  const derived = crypto.hkdfSync('sha256', keySource, HKDF_SALT, HKDF_INFO, KEY_LENGTH_BYTES);
  return Buffer.from(derived);
}

/**
 * Encrypts a plaintext secret for storage.
 * Output format: `${iv}:${authTag}:${ciphertext}`, each base64-encoded, with
 * a fresh random 12-byte IV generated per call.
 */
export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`;
}

/**
 * Decrypts a value previously produced by {@link encryptSecret}.
 * Throws on malformed input (wrong format/lengths) or authentication failure
 * (tampered data or a key that no longer matches, e.g. after key rotation).
 */
export function decryptSecret(stored: string): string {
  const parts = stored.split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted secret: expected "iv:authTag:ciphertext" format.');
  }

  const [ivPart, authTagPart, ciphertextPart] = parts as [string, string, string];

  let iv: Buffer;
  let authTag: Buffer;
  let ciphertext: Buffer;
  try {
    iv = Buffer.from(ivPart, 'base64');
    authTag = Buffer.from(authTagPart, 'base64');
    ciphertext = Buffer.from(ciphertextPart, 'base64');
  } catch {
    throw new Error('Malformed encrypted secret: invalid base64 encoding.');
  }

  // Zero-length ciphertext is valid GCM output: encrypting '' produces it,
  // and the smtp.pass tombstone relies on that round-tripping.
  if (iv.length !== IV_LENGTH_BYTES || authTag.length === 0) {
    throw new Error('Malformed encrypted secret: unexpected component length.');
  }

  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  try {
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  } catch {
    throw new Error('Failed to decrypt secret: authentication failed (tampered data or wrong key).');
  }
}
