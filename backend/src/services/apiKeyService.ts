import { Pool } from 'pg';
import { ApiKey, ApiKeyData, CreateApiKeyData, UpdateApiKeyData } from '@/models/ApiKey';

export class ApiKeyService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Create a new API key
   * Returns both the plain text key (only shown once) and the stored data
   */
  async createApiKey(data: CreateApiKeyData): Promise<{
    apiKey: ApiKey;
    plainTextKey: string;
  }> {
    const { key, hash } = ApiKey.generateKeyPair();

    const query = `
      INSERT INTO api_keys (user_id, key_hash, name, expires_at)
      VALUES ($1, $2, $3, $4)
      RETURNING id, user_id, key_hash, name, last_used_at, expires_at, created_at
    `;

    const values = [data.user_id, hash, data.name, data.expires_at || null];

    const result = await this.pool.query<ApiKeyData>(query, values);
    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to create API key');
    }
    const apiKey = new ApiKey(row);

    return {
      apiKey,
      plainTextKey: key,
    };
  }

  /**
   * Find an API key by its hash
   */
  async findByHash(hash: string): Promise<ApiKey | null> {
    const query = `
      SELECT id, user_id, key_hash, name, last_used_at, expires_at, created_at
      FROM api_keys
      WHERE key_hash = $1
    `;

    const result = await this.pool.query<ApiKeyData>(query, [hash]);

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return new ApiKey(row);
  }

  /**
   * Find an API key by plain text key
   */
  async findByKey(key: string): Promise<ApiKey | null> {
    const hash = ApiKey.hashKey(key);
    return this.findByHash(hash);
  }

  /**
   * Validate an API key and return the associated API key object
   */
  async validateKey(key: string): Promise<ApiKey | null> {
    const apiKey = await this.findByKey(key);

    if (!apiKey) {
      return null;
    }

    // Check if expired
    if (apiKey.isExpired()) {
      return null;
    }

    // Update last_used_at
    await this.updateLastUsed(apiKey.id);
    apiKey.markAsUsed();

    return apiKey;
  }

  /**
   * Find an API key by ID
   */
  async findById(id: string): Promise<ApiKey | null> {
    const query = `
      SELECT id, user_id, key_hash, name, last_used_at, expires_at, created_at
      FROM api_keys
      WHERE id = $1
    `;

    const result = await this.pool.query<ApiKeyData>(query, [id]);

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return new ApiKey(row);
  }

  /**
   * Find all API keys for a user
   */
  async findByUserId(userId: string): Promise<ApiKey[]> {
    const query = `
      SELECT id, user_id, key_hash, name, last_used_at, expires_at, created_at
      FROM api_keys
      WHERE user_id = $1
      ORDER BY created_at DESC
    `;

    const result = await this.pool.query<ApiKeyData>(query, [userId]);

    return result.rows.map((row) => new ApiKey(row));
  }

  /**
   * Update an API key
   */
  async updateApiKey(id: string, data: UpdateApiKeyData): Promise<ApiKey | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.name !== undefined) {
      fields.push(`name = $${paramCount++}`);
      values.push(data.name);
    }

    if (data.expires_at !== undefined) {
      fields.push(`expires_at = $${paramCount++}`);
      values.push(data.expires_at);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    values.push(id);

    const query = `
      UPDATE api_keys
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount}
      RETURNING id, user_id, key_hash, name, last_used_at, expires_at, created_at
    `;

    const result = await this.pool.query<ApiKeyData>(query, values);

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return new ApiKey(row);
  }

  /**
   * Update last_used_at timestamp
   */
  async updateLastUsed(id: string): Promise<void> {
    const query = `
      UPDATE api_keys
      SET last_used_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;

    await this.pool.query(query, [id]);
  }

  /**
   * Delete an API key
   */
  async deleteApiKey(id: string): Promise<boolean> {
    const query = `
      DELETE FROM api_keys
      WHERE id = $1
    `;

    const result = await this.pool.query(query, [id]);

    return result.rowCount !== null && result.rowCount > 0;
  }

  /**
   * Delete all API keys for a user
   */
  async deleteByUserId(userId: string): Promise<number> {
    const query = `
      DELETE FROM api_keys
      WHERE user_id = $1
    `;

    const result = await this.pool.query(query, [userId]);

    return result.rowCount || 0;
  }

  /**
   * Delete expired API keys
   */
  async deleteExpiredKeys(): Promise<number> {
    const query = `
      DELETE FROM api_keys
      WHERE expires_at IS NOT NULL
        AND expires_at < CURRENT_TIMESTAMP
    `;

    const result = await this.pool.query(query);

    return result.rowCount || 0;
  }

  /**
   * Count API keys for a user
   */
  async countByUserId(userId: string): Promise<number> {
    const query = `
      SELECT COUNT(*) as count
      FROM api_keys
      WHERE user_id = $1
    `;

    const result = await this.pool.query<{ count: string }>(query, [userId]);
    const row = result.rows[0];

    return parseInt(row?.count || '0', 10);
  }
}
