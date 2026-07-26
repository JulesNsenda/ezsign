import { Pool } from 'pg';
import { User, UserData, CreateUserData, UpdateUserData, UserRole } from '@/models/User';

export interface AccountAuditSummary {
  id: string;
  email: string;
  role: UserRole;
  created_at: Date;
}

export interface AccountAuditPage {
  accounts: AccountAuditSummary[];
  total: number;
}

export class UserService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Create a new user
   */
  async createUser(data: CreateUserData): Promise<User> {
    const passwordHash = await User.hashPassword(data.password);
    const role = data.role || 'creator';
    const mustChangePassword = data.mustChangePassword ?? false;

    const query = `
      INSERT INTO users (email, password_hash, role, must_change_password)
      VALUES ($1, $2, $3, $4)
      RETURNING id, email, password_hash, role, email_verified,
                email_verification_token, email_verification_expires,
                password_reset_token, password_reset_expires,
                must_change_password, created_at, updated_at
    `;

    const values = [data.email, passwordHash, role, mustChangePassword];
    const result = await this.pool.query<UserData>(query, values);

    if (!result.rows[0]) {
      throw new Error('Failed to create user');
    }

    return new User(result.rows[0]);
  }

  /**
   * Find a user by ID
   */
  async findById(id: string): Promise<User | null> {
    const query = `
      SELECT id, email, password_hash, role, email_verified,
             email_verification_token, email_verification_expires,
             password_reset_token, password_reset_expires,
             must_change_password, created_at, updated_at
      FROM users
      WHERE id = $1
    `;

    const result = await this.pool.query<UserData>(query, [id]);

    if (result.rows.length === 0 || !result.rows[0]) {
      return null;
    }

    return new User(result.rows[0]);
  }

  /**
   * Find a user by email.
   *
   * Matched case-insensitively. `register` normalizes to lowercase on write,
   * but rows created before that change may hold mixed case, and users type
   * their address with whatever casing they like at login. A case-sensitive
   * `email = $1` would therefore (a) lock a user out of an account they had
   * just created with capitals, and (b) let the registration duplicate check
   * miss, so `Foo@bar.com` and `foo@bar.com` became two accounts -- which is
   * what let one invitation token authorize an unbounded number of them.
   *
   * `LOWER(email)` does not use the plain `users_email_unique` index. The
   * durable fix is a `UNIQUE INDEX ON users (LOWER(email))` migration, which
   * also makes the duplicate check enforceable at the DB level; that needs a
   * data audit first (rows differing only by case would block the index), so
   * it is deliberately left out of this change. `ORDER BY created_at` keeps
   * the result deterministic if such rows already exist.
   */
  async findByEmail(email: string): Promise<User | null> {
    const query = `
      SELECT id, email, password_hash, role, email_verified,
             email_verification_token, email_verification_expires,
             password_reset_token, password_reset_expires,
             must_change_password, created_at, updated_at
      FROM users
      WHERE LOWER(email) = LOWER($1)
      ORDER BY created_at
      LIMIT 1
    `;

    const result = await this.pool.query<UserData>(query, [email]);

    if (result.rows.length === 0 || !result.rows[0]) {
      return null;
    }

    return new User(result.rows[0]);
  }

  /**
   * Update a user
   */
  async updateUser(id: string, data: UpdateUserData): Promise<User | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.email !== undefined) {
      fields.push(`email = $${paramCount++}`);
      values.push(data.email);
    }

    if (data.role !== undefined) {
      fields.push(`role = $${paramCount++}`);
      values.push(data.role);
    }

    if (data.email_verified !== undefined) {
      fields.push(`email_verified = $${paramCount++}`);
      values.push(data.email_verified);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    values.push(id);

    const query = `
      UPDATE users
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, email, password_hash, role, email_verified,
                email_verification_token, email_verification_expires,
                password_reset_token, password_reset_expires,
                must_change_password, created_at, updated_at
    `;

    const result = await this.pool.query<UserData>(query, values);

    if (result.rows.length === 0 || !result.rows[0]) {
      return null;
    }

    return new User(result.rows[0]);
  }

  /**
   * Update user's email verification token
   */
  async updateEmailVerificationToken(
    id: string,
    token: string,
    expires: Date
  ): Promise<void> {
    const query = `
      UPDATE users
      SET email_verification_token = $1,
          email_verification_expires = $2
      WHERE id = $3
    `;

    await this.pool.query(query, [token, expires, id]);
  }

  /**
   * Mark user's email as verified
   */
  async markEmailVerified(id: string): Promise<void> {
    const query = `
      UPDATE users
      SET email_verified = true,
          email_verification_token = NULL,
          email_verification_expires = NULL
      WHERE id = $1
    `;

    await this.pool.query(query, [id]);
  }

  /**
   * Update user's password reset token
   */
  async updatePasswordResetToken(
    id: string,
    token: string,
    expires: Date
  ): Promise<void> {
    const query = `
      UPDATE users
      SET password_reset_token = $1,
          password_reset_expires = $2
      WHERE id = $3
    `;

    await this.pool.query(query, [token, expires, id]);
  }

  /**
   * Update user's password
   */
  async updatePassword(id: string, password: string): Promise<void> {
    const passwordHash = await User.hashPassword(password);

    const query = `
      UPDATE users
      SET password_hash = $1,
          password_reset_token = NULL,
          password_reset_expires = NULL
      WHERE id = $2
    `;

    await this.pool.query(query, [passwordHash, id]);
  }

  /**
   * Clear the must-change-password flag (e.g. after a forced password change)
   */
  async clearMustChangePassword(userId: string): Promise<void> {
    const query = `
      UPDATE users
      SET must_change_password = false,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;

    await this.pool.query(query, [userId]);
  }

  /**
   * Delete a user
   */
  async deleteUser(id: string): Promise<boolean> {
    const query = `
      DELETE FROM users
      WHERE id = $1
    `;

    const result = await this.pool.query(query, [id]);

    return result.rowCount !== null && result.rowCount > 0;
  }

  /**
   * Lists accounts (id, email, role, created_at only - no password hash or
   * tokens), paginated. Backs the admin account-audit endpoint (see
   * registration-gate plan item 2.5): closing registration is prospective
   * only, so an operator needs a way to find anyone who registered during
   * an open window and revoke their sessions.
   *
   * Deliberately includes admin accounts (no `role != 'admin'` filter): an
   * account created during the open window and later promoted to admin is
   * the highest-value case to catch, and excluding it would make it
   * invisible to the one audit meant to find it. `role` is returned so the
   * caller can render/filter it instead.
   */
  async listAccountsForAudit(options: { limit: number; offset: number }): Promise<AccountAuditPage> {
    const countResult = await this.pool.query<{ count: string }>('SELECT COUNT(*) FROM users');
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    const query = `
      SELECT id, email, role, created_at
      FROM users
      ORDER BY created_at
      LIMIT $1 OFFSET $2
    `;

    const result = await this.pool.query<AccountAuditSummary>(query, [options.limit, options.offset]);
    return { accounts: result.rows, total };
  }

  /**
   * Check if email exists
   */
  async emailExists(email: string): Promise<boolean> {
    const query = `
      SELECT 1
      FROM users
      WHERE email = $1
    `;

    const result = await this.pool.query(query, [email]);

    return result.rows.length > 0;
  }
}
