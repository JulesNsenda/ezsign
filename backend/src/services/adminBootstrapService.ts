import { Pool } from 'pg';
import { randomBytes } from 'crypto';
import { User } from '@/models/User';
import logger from '@/services/loggerService';

/**
 * Fixed advisory lock key for the admin-bootstrap critical section. Arbitrary
 * but must stay constant across deploys/instances so concurrent boots
 * (multi-instance deploys racing on first boot) serialize on it.
 */
const ADMIN_BOOTSTRAP_LOCK_ID = 847213001;

const BOOTSTRAP_PASSWORD_LENGTH = 20;

// Unambiguous alphanumeric + symbol alphabet (excludes 0/O, 1/l/I and other
// easily-confused characters so the printed password can be typed reliably).
const BOOTSTRAP_PASSWORD_ALPHABET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*()-_=+';

/**
 * Postgres error codes that mean "the schema hasn't been migrated yet"
 * (undefined_table / undefined_column) - tolerated so old/unmigrated DBs
 * don't crash the boot.
 */
const UNDEFINED_SCHEMA_ERROR_CODES = new Set(['42P01', '42703']);

function isUndefinedSchemaError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string' &&
    UNDEFINED_SCHEMA_ERROR_CODES.has((error as { code: string }).code)
  );
}

/**
 * Generate a random password from an unambiguous alphanumeric+symbol alphabet.
 */
function generateBootstrapPassword(): string {
  const bytes = randomBytes(BOOTSTRAP_PASSWORD_LENGTH);
  let password = '';

  for (let i = 0; i < BOOTSTRAP_PASSWORD_LENGTH; i++) {
    const byte = bytes[i];
    if (byte !== undefined) {
      password += BOOTSTRAP_PASSWORD_ALPHABET[byte % BOOTSTRAP_PASSWORD_ALPHABET.length];
    }
  }

  return password;
}

/**
 * Print the one-time bootstrap credentials directly to stdout via
 * console.log, bypassing winston entirely so the password is never written
 * through a file transport. Only called when the password was generated
 * (never when ADMIN_PASSWORD was supplied).
 */
function printBootstrapCredentials(email: string, password: string): void {
  const lines = [
    'FIRST-RUN ADMIN CREATED',
    '',
    `Email:    ${email}`,
    `Password: ${password}`,
    '',
    'This password is shown ONCE. You must change it at first login.',
  ];
  const width = Math.max(...lines.map((line) => line.length)) + 4;
  const border = '='.repeat(width);
  const body = lines.map((line) => `= ${line.padEnd(width - 4)} =`).join('\n');

  // eslint-disable-next-line no-console -- deliberate: must bypass the winston logger
  // (file transports) so the one-time password is never persisted to disk.
  console.log(`\n${border}\n${body}\n${border}\n`);
}

/**
 * Ensure a super admin (role='admin') user exists. Safe to call on every
 * boot: an advisory lock + a live COUNT check make it idempotent and safe
 * under concurrent instances racing on first boot.
 */
export async function ensureAdminExists(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Serialize concurrent bootstrap attempts (e.g. multi-instance deploys).
    await client.query(`SELECT pg_advisory_xact_lock(${ADMIN_BOOTSTRAP_LOCK_ID})`);

    const countResult = await client.query<{ count: string }>(
      "SELECT COUNT(*) FROM users WHERE role = 'admin'"
    );
    const adminCount = parseInt(countResult.rows[0]?.count ?? '0', 10);

    if (adminCount > 0) {
      await client.query('COMMIT');
      return;
    }

    const targetEmail = process.env.ADMIN_EMAIL || 'admin@ezsign.local';

    const existingResult = await client.query<{ role: string }>(
      'SELECT role FROM users WHERE email = $1',
      [targetEmail]
    );
    const existingUser = existingResult.rows[0];

    if (existingUser && existingUser.role !== 'admin') {
      logger.error(
        `cannot bootstrap admin: email ${targetEmail} is taken by a non-admin user — set ADMIN_EMAIL to a free address`
      );
      await client.query('ROLLBACK');
      return;
    }

    const envPassword = process.env.ADMIN_PASSWORD;
    const password = envPassword || generateBootstrapPassword();
    const passwordHash = await User.hashPassword(password);

    await client.query(
      `INSERT INTO users (email, password_hash, role, email_verified, must_change_password)
       VALUES ($1, $2, 'admin', true, true)`,
      [targetEmail, passwordHash]
    );

    await client.query('COMMIT');

    if (!envPassword) {
      printBootstrapCredentials(targetEmail, password);
    }

    logger.info('Admin bootstrap: super admin user created', { email: targetEmail });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);

    if (isUndefinedSchemaError(error)) {
      logger.warn('admin bootstrap skipped: database schema not migrated yet — run npm run migrate');
      return;
    }

    throw error;
  } finally {
    client.release();
  }
}
