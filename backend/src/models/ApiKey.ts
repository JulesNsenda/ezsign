import * as crypto from 'crypto';

/**
 * Available API key scopes
 */
export const API_KEY_SCOPES = [
  'documents:read',
  'documents:write',
  'signers:read',
  'signers:write',
  'templates:read',
  'templates:write',
  'webhooks:read',
  'webhooks:write',
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

/**
 * All scopes - for full access keys
 */
export const ALL_SCOPES: ApiKeyScope[] = [...API_KEY_SCOPES];

export interface ApiKeyData {
  id: string;
  user_id: string;
  key_hash: string;
  name: string;
  scopes: ApiKeyScope[];
  last_used_at: Date | null;
  expires_at: Date | null;
  created_at: Date;
}

export interface CreateApiKeyData {
  user_id: string;
  name: string;
  scopes?: ApiKeyScope[];
  expires_at?: Date | null;
}

export interface UpdateApiKeyData {
  name?: string;
  scopes?: ApiKeyScope[];
  expires_at?: Date | null;
}

export class ApiKey {
  id: string;
  user_id: string;
  key_hash: string;
  name: string;
  scopes: ApiKeyScope[];
  last_used_at: Date | null;
  expires_at: Date | null;
  created_at: Date;

  constructor(data: ApiKeyData) {
    this.id = data.id;
    this.user_id = data.user_id;
    this.key_hash = data.key_hash;
    this.name = data.name;
    this.scopes = data.scopes || ALL_SCOPES;
    this.last_used_at = data.last_used_at;
    this.expires_at = data.expires_at;
    this.created_at = data.created_at;
  }

  /**
   * Check if the API key has a specific scope
   */
  hasScope(scope: ApiKeyScope): boolean {
    return this.scopes.includes(scope);
  }

  /**
   * Check if the API key has all of the specified scopes
   */
  hasAllScopes(scopes: ApiKeyScope[]): boolean {
    return scopes.every((scope) => this.hasScope(scope));
  }

  /**
   * Check if the API key has any of the specified scopes
   */
  hasAnyScope(scopes: ApiKeyScope[]): boolean {
    return scopes.some((scope) => this.hasScope(scope));
  }

  /**
   * Validate that all provided scopes are valid
   */
  static validateScopes(scopes: string[]): scopes is ApiKeyScope[] {
    return scopes.every((scope) =>
      API_KEY_SCOPES.includes(scope as ApiKeyScope)
    );
  }

  /**
   * Filter invalid scopes and return only valid ones
   */
  static filterValidScopes(scopes: string[]): ApiKeyScope[] {
    return scopes.filter((scope) =>
      API_KEY_SCOPES.includes(scope as ApiKeyScope)
    ) as ApiKeyScope[];
  }

  /**
   * Generate a new API key (plain text)
   * Format: ezs_<32_bytes_hex>
   */
  static generateKey(): string {
    const randomBytes = crypto.randomBytes(32);
    return `ezs_${randomBytes.toString('hex')}`;
  }

  /**
   * Hash an API key using SHA-256
   */
  static hashKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  /**
   * Generate a new API key and return both the plain text and hash
   */
  static generateKeyPair(): {
    key: string;
    hash: string;
  } {
    const key = ApiKey.generateKey();
    const hash = ApiKey.hashKey(key);
    return { key, hash };
  }

  /**
   * Verify a plain text API key against this hash
   */
  verifyKey(key: string): boolean {
    const hash = ApiKey.hashKey(key);
    return crypto.timingSafeEqual(
      Buffer.from(this.key_hash, 'hex'),
      Buffer.from(hash, 'hex')
    );
  }

  /**
   * Check if the API key has expired
   */
  isExpired(): boolean {
    if (!this.expires_at) {
      return false;
    }
    return new Date() > this.expires_at;
  }

  /**
   * Check if the API key is valid (not expired)
   */
  isValid(): boolean {
    return !this.isExpired();
  }

  /**
   * Update the last_used_at timestamp
   */
  markAsUsed(): void {
    this.last_used_at = new Date();
  }

  /**
   * Convert to JSON (exclude sensitive hash)
   */
  toJSON(): Omit<ApiKeyData, 'key_hash'> {
    return {
      id: this.id,
      user_id: this.user_id,
      name: this.name,
      scopes: this.scopes,
      last_used_at: this.last_used_at,
      expires_at: this.expires_at,
      created_at: this.created_at,
    };
  }

  /**
   * Get a masked version of the API key for display
   * Shows only the prefix and last 4 characters
   */
  static maskKey(key: string): string {
    if (!key.startsWith('ezs_')) {
      return '***';
    }
    const keyPart = key.substring(4); // Remove 'ezs_' prefix
    if (keyPart.length < 8) {
      return 'ezs_***';
    }
    const last4 = keyPart.slice(-4);
    return `ezs_${'*'.repeat(keyPart.length - 4)}${last4}`;
  }
}
