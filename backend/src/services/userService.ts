import { Pool } from 'pg';
import { User, UserData, CreateUserData, UpdateUserData } from '@/models/User';

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

    const query = `
      INSERT INTO users (email, password_hash, role)
      VALUES ($1, $2, $3)
      RETURNING id, email, password_hash, role, email_verified,
                email_verification_token, email_verification_expires,
                password_reset_token, password_reset_expires,
                created_at, updated_at
    `;

    const values = [data.email, passwordHash, role];
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
             created_at, updated_at
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
   * Find a user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    const query = `
      SELECT id, email, password_hash, role, email_verified,
             email_verification_token, email_verification_expires,
             password_reset_token, password_reset_expires,
             created_at, updated_at
      FROM users
      WHERE email = $1
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
                created_at, updated_at
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
  async updateEmailVerificationToken(id: string, token: string, expires: Date): Promise<void> {
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
  async updatePasswordResetToken(id: string, token: string, expires: Date): Promise<void> {
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
