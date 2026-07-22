import { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { encryptSecret, decryptSecret } from '@/utils/secretsCrypto';
import { EmailConfig } from '@/services/emailService';
import logger from '@/services/loggerService';

/**
 * Error thrown for any user-input problem in `SettingsService.set()`
 * (unknown key, duplicate key, or a value that fails its per-key schema).
 * Callers (the admin settings controller) catch this specifically and map
 * it to a 400 response; anything else is an unexpected/server error.
 */
export class SettingsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SettingsValidationError';
  }
}

export type SettingValueType = 'string' | 'number' | 'boolean';
export type SettingSource = 'db' | 'env' | 'default';

export interface SettingDefinition {
  key: string;
  type: SettingValueType;
  isSecret: boolean;
  /** Env vars checked in order; the first one that is set (non-empty) wins. */
  envFallback: string[];
  defaultValue: string | number | boolean;
  /** Validates/normalizes the already-primitive-typed value. */
  schema: z.ZodTypeAny;
}

export interface EffectiveSetting {
  key: string;
  type: SettingValueType;
  isSecret: boolean;
  /** Secrets never expose their value here - always null. */
  value: string | number | boolean | null;
  /** For secrets: whether a usable (non-empty) value is currently configured. */
  isSet: boolean;
  source: SettingSource;
}

/**
 * `app.url` must be https:// unless the hostname is localhost/127.0.0.1 (in
 * which case http:// is allowed for local dev). Normalizes away a trailing
 * slash.
 */
const appUrlSchema = z
  .string()
  .trim()
  .min(1, 'app.url cannot be empty')
  .transform((value, ctx) => {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      ctx.addIssue({ code: 'custom', message: 'app.url must be a valid absolute URL' });
      return z.NEVER;
    }

    const isLocalHost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (parsed.protocol !== 'https:' && !(isLocalHost && parsed.protocol === 'http:')) {
      ctx.addIssue({
        code: 'custom',
        message: 'app.url must use https:// (http:// is only allowed for localhost/127.0.0.1)',
      });
      return z.NEVER;
    }

    // Normalize: strip trailing slash(es), but never return an empty string.
    return value.replace(/\/+$/, '') || value;
  });

/**
 * Registry of all known instance settings - the single source of truth for
 * type, secrecy, env fallback chain, default, and validation. Consumed by
 * both this service and `validators/settingsSchemas.ts`.
 */
export const SETTINGS_REGISTRY: Record<string, SettingDefinition> = {
  'smtp.host': {
    key: 'smtp.host',
    type: 'string',
    isSecret: false,
    envFallback: ['EMAIL_SMTP_HOST'],
    defaultValue: 'localhost',
    schema: z.string().trim().min(1, 'smtp.host cannot be empty').max(255, 'smtp.host is too long'),
  },
  'smtp.port': {
    key: 'smtp.port',
    type: 'number',
    isSecret: false,
    envFallback: ['EMAIL_SMTP_PORT'],
    defaultValue: 1025,
    schema: z
      .number()
      .int('smtp.port must be an integer')
      .min(1, 'smtp.port must be between 1 and 65535')
      .max(65535, 'smtp.port must be between 1 and 65535'),
  },
  'smtp.secure': {
    key: 'smtp.secure',
    type: 'boolean',
    isSecret: false,
    envFallback: ['EMAIL_SMTP_SECURE'],
    defaultValue: false,
    schema: z.boolean(),
  },
  'smtp.user': {
    key: 'smtp.user',
    type: 'string',
    isSecret: false,
    envFallback: ['EMAIL_SMTP_USER'],
    defaultValue: '',
    schema: z.string().max(255, 'smtp.user is too long'),
  },
  'smtp.pass': {
    key: 'smtp.pass',
    type: 'string',
    isSecret: true,
    envFallback: ['EMAIL_SMTP_PASS'],
    defaultValue: '',
    schema: z.string().max(500, 'smtp.pass is too long'),
  },
  'email.from': {
    key: 'email.from',
    type: 'string',
    isSecret: false,
    envFallback: ['EMAIL_FROM', 'EMAIL_FROM_ADDRESS', 'EMAIL_SMTP_FROM'],
    defaultValue: 'noreply@ezsign.local',
    schema: z.string().trim().min(1, 'email.from cannot be empty').max(255, 'email.from is too long'),
  },
  'app.url': {
    key: 'app.url',
    type: 'string',
    isSecret: false,
    envFallback: ['APP_URL', 'BASE_URL'],
    defaultValue: 'http://localhost:3002',
    schema: appUrlSchema,
  },
};

/** Keys whose change forces `smtp.pass` to be cleared (see `set()`). */
const SMTP_TRANSPORT_KEYS = ['smtp.host', 'smtp.port', 'smtp.secure'];

/**
 * Coerces a JSON-typed input value (string | number | boolean) to the
 * primitive type the registry expects, accepting the JSON-native type as-is
 * and numeric/boolean strings for convenience. Throws SettingsValidationError
 * on mismatch.
 */
function coercePrimitive(
  raw: string | number | boolean,
  type: SettingValueType,
  key: string
): string | number | boolean {
  switch (type) {
    case 'string':
      if (typeof raw !== 'string') {
        throw new SettingsValidationError(`${key} must be a string value`);
      }
      return raw;
    case 'number': {
      if (typeof raw === 'number' && !Number.isNaN(raw)) {
        return raw;
      }
      if (typeof raw === 'string' && raw.trim() !== '' && !Number.isNaN(Number(raw))) {
        return Number(raw);
      }
      throw new SettingsValidationError(`${key} must be a numeric value`);
    }
    case 'boolean': {
      if (typeof raw === 'boolean') return raw;
      if (raw === 'true') return true;
      if (raw === 'false') return false;
      throw new SettingsValidationError(`${key} must be a boolean value`);
    }
    default:
      throw new SettingsValidationError(`Unsupported setting type for ${key}`);
  }
}

/**
 * Stateless service for reading/writing instance-wide operational settings
 * (SMTP, from-address, app URL), resolved DB -> env -> default. Mirrors
 * `BrandingService`: no caching, a fresh query every call - a per-request DB
 * read is negligible next to the I/O it gates (sendMail, redirects), and a
 * cache would go stale across worker processes.
 */
export class SettingsService {
  constructor(private pool: Pool) {}

  /**
   * Returns every known setting with its currently effective value (secrets
   * redacted to `null`, with `isSet` reported instead) and where that value
   * came from.
   */
  async getAll(): Promise<EffectiveSetting[]> {
    const keys = Object.keys(SETTINGS_REGISTRY);

    const result = await this.pool.query<{ key: string; value: string; is_secret: boolean }>(
      'SELECT key, value, is_secret FROM instance_settings WHERE key = ANY($1::text[])',
      [keys]
    );
    const dbRows = new Map(result.rows.map((row) => [row.key, row]));

    return keys.map((key) => {
      const def = SETTINGS_REGISTRY[key] as SettingDefinition;
      const dbRow = dbRows.get(key);

      if (dbRow) {
        if (def.isSecret) {
          let isSet = false;
          try {
            isSet = decryptSecret(dbRow.value).length > 0;
          } catch (error) {
            // Corrupt/undecryptable row (e.g. after an encryption-key
            // rotation) - report as configured-but-unusable rather than
            // throwing, so GET /settings never 500s because of it.
            logger.warn('Failed to decrypt stored instance setting secret', {
              key,
              error: (error as Error).message,
            });
          }
          return { key, type: def.type, isSecret: true, value: null, isSet, source: 'db' as const };
        }

        return {
          key,
          type: def.type,
          isSecret: false,
          value: this.coerceFromStorage(dbRow.value, def.type),
          isSet: true,
          source: 'db' as const,
        };
      }

      const envValue = this.resolveFromEnv(def);
      if (envValue !== undefined) {
        if (def.isSecret) {
          return {
            key,
            type: def.type,
            isSecret: true,
            value: null,
            isSet: String(envValue).length > 0,
            source: 'env' as const,
          };
        }
        return { key, type: def.type, isSecret: false, value: envValue, isSet: true, source: 'env' as const };
      }

      if (def.isSecret) {
        return {
          key,
          type: def.type,
          isSecret: true,
          value: null,
          isSet: String(def.defaultValue).length > 0,
          source: 'default' as const,
        };
      }
      return { key, type: def.type, isSecret: false, value: def.defaultValue, isSet: true, source: 'default' as const };
    });
  }

  /**
   * Resolves a single setting's effective value: DB row -> env chain ->
   * default. DB-stored secrets are decrypted; env-sourced secrets are used
   * as-is (they're plaintext by nature of being an env var).
   */
  async getValue(key: string): Promise<string | number | boolean> {
    const def = SETTINGS_REGISTRY[key];
    if (!def) {
      throw new SettingsValidationError(`Unknown setting key: ${key}`);
    }

    const result = await this.pool.query<{ value: string; is_secret: boolean }>(
      'SELECT value, is_secret FROM instance_settings WHERE key = $1',
      [key]
    );
    const row = result.rows[0];

    if (row) {
      return def.isSecret ? decryptSecret(row.value) : this.coerceFromStorage(row.value, def.type);
    }

    const envValue = this.resolveFromEnv(def);
    if (envValue !== undefined) {
      return envValue;
    }

    return def.defaultValue;
  }

  /**
   * Validates and persists a batch of setting changes in a single
   * transaction. A `null` value deletes the stored row (reverting to
   * env/default). For secret keys, an empty-string value is a no-op ("leave
   * unchanged" - the UI's write-only password field sends this instead of
   * omitting the key); only an explicit `null` clears a secret.
   *
   * Special rule: if any of smtp.host/smtp.port/smtp.secure end up with an
   * effective value different from their current one, and the request does
   * NOT also explicitly set smtp.pass, the stored smtp.pass row is
   * overwritten in the same transaction with an encrypted empty-string
   * tombstone (not deleted). A plain DELETE would let `getValue`/
   * `getEmailConfig` fall through to the `EMAIL_SMTP_PASS` env var, silently
   * sending the *old* password to the *new* (possibly attacker-controlled)
   * host - the tombstone row always resolves to `''`, so a transport change
   * always requires re-entering the password. An explicit `null` for
   * smtp.pass itself still deletes the row (normal clear semantics).
   */
  async set(
    entries: Array<{ key: string; value: string | number | boolean | null }>,
    updatedBy: string,
    sourceIp?: string
  ): Promise<void> {
    if (entries.length === 0) {
      return;
    }

    const seenKeys = new Set<string>();
    const toWrite: Array<{ key: string; def: SettingDefinition; value: string | number | boolean | null }> = [];

    for (const entry of entries) {
      const def = SETTINGS_REGISTRY[entry.key];
      if (!def) {
        throw new SettingsValidationError(`Unknown setting key: ${entry.key}`);
      }
      if (seenKeys.has(entry.key)) {
        throw new SettingsValidationError(`Duplicate setting key in request: ${entry.key}`);
      }
      seenKeys.add(entry.key);

      if (entry.value === null) {
        toWrite.push({ key: entry.key, def, value: null });
        continue;
      }

      if (def.isSecret && entry.value === '') {
        // "leave unchanged" - see method doc.
        continue;
      }

      const coerced = coercePrimitive(entry.value, def.type, entry.key);
      const parsed = def.schema.safeParse(coerced);
      if (!parsed.success) {
        const message = parsed.error.issues[0]?.message || `Invalid value for ${entry.key}`;
        throw new SettingsValidationError(message);
      }

      toWrite.push({ key: entry.key, def, value: parsed.data as string | number | boolean });
    }

    if (toWrite.length === 0) {
      return;
    }

    const touchesTransport = toWrite.some((w) => SMTP_TRANSPORT_KEYS.includes(w.key));
    const passExplicitlyTouched = toWrite.some((w) => w.key === 'smtp.pass');
    let autoClearPass = false;

    if (touchesTransport && !passExplicitlyTouched) {
      for (const w of toWrite) {
        if (!SMTP_TRANSPORT_KEYS.includes(w.key)) continue;
        const currentEffective = await this.getValue(w.key);
        const newEffective = w.value === null ? this.resolveEffectiveWithoutDb(w.key) : w.value;
        if (currentEffective !== newEffective) {
          autoClearPass = true;
          break;
        }
      }
    }

    const client = await this.pool.connect();
    const changedKeys: string[] = [];

    try {
      await client.query('BEGIN');

      for (const w of toWrite) {
        changedKeys.push(w.key);

        if (w.value === null) {
          await client.query('DELETE FROM instance_settings WHERE key = $1', [w.key]);
          continue;
        }

        const storedValue = w.def.isSecret ? encryptSecret(String(w.value)) : String(w.value);
        await this.upsertSetting(client, w.key, storedValue, w.def.isSecret, updatedBy);
      }

      if (autoClearPass) {
        // Tombstone, not delete - see method doc. Resolves to '' on read,
        // so it never falls through to the EMAIL_SMTP_PASS env var.
        await this.upsertSetting(client, 'smtp.pass', encryptSecret(''), true, updatedBy);
        changedKeys.push('smtp.pass');
      }

      const uniqueChangedKeys = Array.from(new Set(changedKeys));

      // Audit trail, in the same transaction as the settings write. Never
      // logs secret values - only the changed key names.
      await client.query(
        `INSERT INTO audit_events (document_id, user_id, event_type, ip_address, metadata)
         VALUES (NULL, $1, 'settings.updated', $2, $3)`,
        [updatedBy, sourceIp || null, JSON.stringify({ keys: uniqueChangedKeys })]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    logger.info('Instance settings updated', {
      keys: Array.from(new Set(changedKeys)),
      updatedBy,
    });
  }

  /** Shared upsert used for both direct writes and the smtp.pass tombstone. */
  private async upsertSetting(
    client: PoolClient,
    key: string,
    storedValue: string,
    isSecret: boolean,
    updatedBy: string
  ): Promise<void> {
    await client.query(
      `INSERT INTO instance_settings (key, value, is_secret, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET
         value = EXCLUDED.value,
         is_secret = EXCLUDED.is_secret,
         updated_by = EXCLUDED.updated_by,
         updated_at = CURRENT_TIMESTAMP`,
      [key, storedValue, isSecret, updatedBy]
    );
  }

  /**
   * Assembles the config shape `EmailService`/nodemailer callers need,
   * resolved fresh per call. `auth` is included only when both user and pass
   * are non-empty. Fetches all six SMTP/from keys in a single query (same
   * `key = ANY($1::text[])` pattern as `getAll()`) instead of firing a
   * separate `getValue` round-trip per key.
   */
  async getEmailConfig(): Promise<EmailConfig & { baseUrl: string }> {
    const keys = ['smtp.host', 'smtp.port', 'smtp.secure', 'smtp.user', 'smtp.pass', 'email.from'];

    const result = await this.pool.query<{ key: string; value: string; is_secret: boolean }>(
      'SELECT key, value, is_secret FROM instance_settings WHERE key = ANY($1::text[])',
      [keys]
    );
    const dbRows = new Map(result.rows.map((row) => [row.key, row]));

    const resolve = (key: string): string | number | boolean => {
      const def = SETTINGS_REGISTRY[key] as SettingDefinition;
      const dbRow = dbRows.get(key);
      if (dbRow) {
        return def.isSecret ? decryptSecret(dbRow.value) : this.coerceFromStorage(dbRow.value, def.type);
      }
      const envValue = this.resolveFromEnv(def);
      return envValue !== undefined ? envValue : def.defaultValue;
    };

    const host = resolve('smtp.host');
    const port = resolve('smtp.port');
    const secure = resolve('smtp.secure');
    const userStr = String(resolve('smtp.user'));
    const passStr = String(resolve('smtp.pass'));
    const from = resolve('email.from');
    const baseUrl = await this.getAppUrl();

    return {
      host: String(host),
      port: Number(port),
      secure: Boolean(secure),
      ...(userStr !== '' && passStr !== '' ? { auth: { user: userStr, pass: passStr } } : {}),
      from: String(from),
      baseUrl,
    };
  }

  async getAppUrl(): Promise<string> {
    const value = String(await this.getValue('app.url'));
    return value.replace(/\/+$/, '') || value;
  }

  private coerceFromStorage(raw: string, type: SettingValueType): string | number | boolean {
    if (type === 'number') return Number(raw);
    if (type === 'boolean') return raw === 'true';
    return raw;
  }

  private resolveFromEnv(def: SettingDefinition): string | number | boolean | undefined {
    for (const envVar of def.envFallback) {
      const raw = process.env[envVar];
      if (raw !== undefined && raw !== '') {
        return this.coerceFromStorage(raw, def.type);
      }
    }
    return undefined;
  }

  /** Env-or-default resolution only, used to detect an effective-value change when a DB row is being deleted (null). */
  private resolveEffectiveWithoutDb(key: string): string | number | boolean {
    const def = SETTINGS_REGISTRY[key] as SettingDefinition;
    const envValue = this.resolveFromEnv(def);
    return envValue !== undefined ? envValue : def.defaultValue;
  }
}

const settingsServiceInstances = new WeakMap<Pool, SettingsService>();

/**
 * Returns the SettingsService singleton for the given pool, created on
 * first call for that pool. Keyed by pool (not module-global) so tests -
 * or any caller - using a different `Pool` instance get their own service
 * instead of silently reusing one bound to a different pool. The instance
 * itself is stateless (no cache) - this only avoids re-allocating the
 * object on every request.
 */
export function getSettingsService(pool: Pool): SettingsService {
  let instance = settingsServiceInstances.get(pool);
  if (!instance) {
    instance = new SettingsService(pool);
    settingsServiceInstances.set(pool, instance);
  }
  return instance;
}
