import { encryptSecret, decryptSecret } from './secretsCrypto';

describe('secretsCrypto', () => {
  const originalSettingsKey = process.env.SETTINGS_ENCRYPTION_KEY;
  const originalJwtSecret = process.env.JWT_SECRET;

  afterEach(() => {
    if (originalSettingsKey === undefined) {
      delete process.env.SETTINGS_ENCRYPTION_KEY;
    } else {
      process.env.SETTINGS_ENCRYPTION_KEY = originalSettingsKey;
    }
    if (originalJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalJwtSecret;
    }
  });

  describe('roundtrip', () => {
    it('decrypts what it encrypted', () => {
      const plaintext = 'super-secret-smtp-password';
      const encrypted = encryptSecret(plaintext);
      expect(decryptSecret(encrypted)).toBe(plaintext);
    });

    // KNOWN BUG (found while writing this test pass, reported to the parent
    // agent - not fixed here per test-pass scope): encryptSecret('') produces
    // a zero-length ciphertext segment (AES-256-GCM ciphertext length equals
    // plaintext length); decryptSecret must accept it - the smtp.pass
    // tombstone written by settingsService.set() depends on this roundtrip.
    it('roundtrips an empty string (tombstone value)', () => {
      const encrypted = encryptSecret('');
      expect(decryptSecret(encrypted)).toBe('');
    });

    it('roundtrips using SETTINGS_ENCRYPTION_KEY when set (preferred over JWT_SECRET)', () => {
      process.env.SETTINGS_ENCRYPTION_KEY = 'a-dedicated-settings-key';
      const plaintext = 'value-encrypted-with-dedicated-key';
      const encrypted = encryptSecret(plaintext);
      expect(decryptSecret(encrypted)).toBe(plaintext);
    });
  });

  describe('unique IVs', () => {
    it('produces different ciphertext (different IV) across calls for the same plaintext', () => {
      const plaintext = 'same-plaintext-every-time';
      const first = encryptSecret(plaintext);
      const second = encryptSecret(plaintext);

      expect(first).not.toBe(second);

      const firstIv = first.split(':')[0];
      const secondIv = second.split(':')[0];
      expect(firstIv).not.toBe(secondIv);

      // Both still decrypt to the same plaintext.
      expect(decryptSecret(first)).toBe(plaintext);
      expect(decryptSecret(second)).toBe(plaintext);
    });
  });

  describe('tamper detection', () => {
    it('throws when the ciphertext has been altered', () => {
      const encrypted = encryptSecret('do-not-tamper-with-me');
      const [iv, authTag, ciphertext] = encrypted.split(':');
      const tamperedCiphertext = Buffer.from(ciphertext as string, 'base64');
      tamperedCiphertext[0] = (tamperedCiphertext[0] ?? 0) ^ 0xff;
      const tampered = `${iv}:${authTag}:${tamperedCiphertext.toString('base64')}`;

      expect(() => decryptSecret(tampered)).toThrow(/authentication failed/i);
    });

    it('throws when the auth tag has been altered', () => {
      const encrypted = encryptSecret('another-secret');
      const [iv, authTag, ciphertext] = encrypted.split(':');
      const tamperedTag = Buffer.from(authTag as string, 'base64');
      tamperedTag[0] = (tamperedTag[0] ?? 0) ^ 0xff;
      const tampered = `${iv}:${tamperedTag.toString('base64')}:${ciphertext}`;

      expect(() => decryptSecret(tampered)).toThrow(/authentication failed/i);
    });
  });

  describe('malformed input', () => {
    it('throws on input with the wrong number of segments', () => {
      expect(() => decryptSecret('not-the-right-format')).toThrow(/Malformed encrypted secret/i);
      expect(() => decryptSecret('a:b:c:d')).toThrow(/Malformed encrypted secret/i);
    });

    it('throws on invalid base64 segments', () => {
      expect(() => decryptSecret('not base64!!:not base64!!:not base64!!')).toThrow(
        /Malformed encrypted secret/i
      );
    });

    it('throws when the IV length is wrong', () => {
      const shortIv = Buffer.from('short').toString('base64');
      const authTag = Buffer.alloc(16, 1).toString('base64');
      const ciphertext = Buffer.from('data').toString('base64');
      expect(() => decryptSecret(`${shortIv}:${authTag}:${ciphertext}`)).toThrow(
        /Malformed encrypted secret/i
      );
    });
  });

  describe('missing key', () => {
    it('throws when neither SETTINGS_ENCRYPTION_KEY nor JWT_SECRET is set', () => {
      delete process.env.SETTINGS_ENCRYPTION_KEY;
      delete process.env.JWT_SECRET;

      expect(() => encryptSecret('anything')).toThrow(
        /Cannot encrypt\/decrypt instance settings secrets/i
      );
    });
  });
});
