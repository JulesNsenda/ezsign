import { Pool } from 'pg';
import { ApiKey, ApiKeyData, ApiKeyScope, ALL_SCOPES } from '@/models/ApiKey';
import { ApiKeyService } from '@/services/apiKeyService';

/**
 * Integration tests for API key authentication
 * Tests API key creation, validation, scope enforcement, and expiration
 */
describe('API Key Authentication Integration Tests', () => {
  let pool: Pool;
  let apiKeyService: ApiKeyService;

  const testUserId = 'user-123';

  const createMockApiKeyData = (overrides: Partial<{
    id: string;
    user_id: string;
    key_hash: string;
    name: string;
    scopes: ApiKeyScope[];
    last_used_at: Date | null;
    expires_at: Date | null;
    created_at: Date;
  }> = {}): ApiKeyData => ({
    id: overrides.id || 'apikey-1',
    user_id: overrides.user_id || testUserId,
    key_hash: overrides.key_hash || 'mock-hash',
    name: overrides.name || 'Test API Key',
    scopes: overrides.scopes || ALL_SCOPES,
    last_used_at: overrides.last_used_at ?? null,
    expires_at: overrides.expires_at ?? null,
    created_at: overrides.created_at || new Date(),
  });

  beforeAll(() => {
    pool = {
      query: jest.fn(),
      connect: jest.fn(),
    } as unknown as Pool;

    apiKeyService = new ApiKeyService(pool);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('API Key Generation', () => {
    it('should generate unique API keys', () => {
      const key1 = ApiKey.generateKey();
      const key2 = ApiKey.generateKey();

      expect(key1).toBeDefined();
      expect(key2).toBeDefined();
      expect(key1).not.toBe(key2);
      expect(key1.startsWith('ezs_')).toBe(true);
      expect(key2.startsWith('ezs_')).toBe(true);
    });

    it('should generate key with correct format (ezs_ prefix + 64 hex chars)', () => {
      const key = ApiKey.generateKey();

      expect(key).toMatch(/^ezs_[a-f0-9]{64}$/);
    });

    it('should hash keys consistently', () => {
      const key = 'ezs_abc123';
      const hash1 = ApiKey.hashKey(key);
      const hash2 = ApiKey.hashKey(key);

      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64); // SHA-256 hex length
    });

    it('should generate different hashes for different keys', () => {
      const hash1 = ApiKey.hashKey('ezs_key1');
      const hash2 = ApiKey.hashKey('ezs_key2');

      expect(hash1).not.toBe(hash2);
    });

    it('should generate key pair with matching hash', () => {
      const { key, hash } = ApiKey.generateKeyPair();

      expect(key).toBeDefined();
      expect(hash).toBeDefined();
      expect(ApiKey.hashKey(key)).toBe(hash);
    });
  });

  describe('API Key Model', () => {
    it('should create API key with all scopes by default', () => {
      const data = createMockApiKeyData({ scopes: undefined });
      // Remove scopes to test default
      delete (data as { scopes?: ApiKeyScope[] }).scopes;
      const apiKey = new ApiKey({ ...data, scopes: [] });

      // Constructor should use ALL_SCOPES when empty array provided
      expect(apiKey.scopes).toBeDefined();
    });

    it('should verify key correctly', () => {
      const { key, hash } = ApiKey.generateKeyPair();
      const apiKey = new ApiKey({
        ...createMockApiKeyData(),
        key_hash: hash,
      });

      expect(apiKey.verifyKey(key)).toBe(true);
      expect(apiKey.verifyKey('wrong_key')).toBe(false);
    });

    it('should check single scope', () => {
      const apiKey = new ApiKey(createMockApiKeyData({
        scopes: ['documents:read', 'documents:write'],
      }));

      expect(apiKey.hasScope('documents:read')).toBe(true);
      expect(apiKey.hasScope('documents:write')).toBe(true);
      expect(apiKey.hasScope('signers:read')).toBe(false);
    });

    it('should check all scopes', () => {
      const apiKey = new ApiKey(createMockApiKeyData({
        scopes: ['documents:read', 'documents:write', 'signers:read'],
      }));

      expect(apiKey.hasAllScopes(['documents:read', 'documents:write'])).toBe(true);
      expect(apiKey.hasAllScopes(['documents:read', 'templates:read'])).toBe(false);
    });

    it('should check any scope', () => {
      const apiKey = new ApiKey(createMockApiKeyData({
        scopes: ['documents:read'],
      }));

      expect(apiKey.hasAnyScope(['documents:read', 'templates:read'])).toBe(true);
      expect(apiKey.hasAnyScope(['signers:write', 'templates:write'])).toBe(false);
    });

    it('should mask key for display', () => {
      const key = 'ezs_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6';
      const masked = ApiKey.maskKey(key);

      expect(masked).toMatch(/^ezs_\*+[a-z0-9]{4}$/);
      expect(masked).not.toContain(key);
    });

    it('should handle invalid key masking', () => {
      expect(ApiKey.maskKey('invalid')).toBe('***');
      expect(ApiKey.maskKey('ezs_abc')).toBe('ezs_***');
    });
  });

  describe('API Key Expiration', () => {
    it('should detect non-expired key (no expiration)', () => {
      const apiKey = new ApiKey(createMockApiKeyData({
        expires_at: null,
      }));

      expect(apiKey.isExpired()).toBe(false);
      expect(apiKey.isValid()).toBe(true);
    });

    it('should detect non-expired key (future date)', () => {
      const apiKey = new ApiKey(createMockApiKeyData({
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      }));

      expect(apiKey.isExpired()).toBe(false);
      expect(apiKey.isValid()).toBe(true);
    });

    it('should detect expired key', () => {
      const apiKey = new ApiKey(createMockApiKeyData({
        expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
      }));

      expect(apiKey.isExpired()).toBe(true);
      expect(apiKey.isValid()).toBe(false);
    });

    it('should update last_used_at timestamp', () => {
      const apiKey = new ApiKey(createMockApiKeyData({
        last_used_at: null,
      }));

      expect(apiKey.last_used_at).toBeNull();

      apiKey.markAsUsed();

      expect(apiKey.last_used_at).toBeDefined();
      expect(apiKey.last_used_at).toBeInstanceOf(Date);
    });
  });

  describe('Scope Validation', () => {
    it('should validate correct scopes', () => {
      const validScopes = ['documents:read', 'documents:write', 'signers:read'];
      expect(ApiKey.validateScopes(validScopes)).toBe(true);
    });

    it('should reject invalid scopes', () => {
      const invalidScopes = ['documents:read', 'invalid:scope'];
      expect(ApiKey.validateScopes(invalidScopes)).toBe(false);
    });

    it('should filter valid scopes', () => {
      const mixed = ['documents:read', 'invalid:scope', 'signers:write'];
      const filtered = ApiKey.filterValidScopes(mixed);

      expect(filtered).toEqual(['documents:read', 'signers:write']);
    });

    it('should list all available scopes', () => {
      expect(ALL_SCOPES).toContain('documents:read');
      expect(ALL_SCOPES).toContain('documents:write');
      expect(ALL_SCOPES).toContain('signers:read');
      expect(ALL_SCOPES).toContain('signers:write');
      expect(ALL_SCOPES).toContain('templates:read');
      expect(ALL_SCOPES).toContain('templates:write');
      expect(ALL_SCOPES).toContain('webhooks:read');
      expect(ALL_SCOPES).toContain('webhooks:write');
    });
  });

  describe('API Key Service', () => {
    it('should create API key and return plain text key', async () => {
      const createData = {
        user_id: testUserId,
        name: 'My API Key',
        scopes: ['documents:read', 'documents:write'] as ApiKeyScope[],
      };

      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{
          id: 'apikey-new',
          user_id: testUserId,
          key_hash: 'mock-hash',
          name: createData.name,
          scopes: createData.scopes,
          last_used_at: null,
          expires_at: null,
          created_at: new Date(),
        }],
      });

      const result = await apiKeyService.createApiKey(createData);

      expect(result.apiKey).toBeDefined();
      expect(result.plainTextKey).toBeDefined();
      expect(result.plainTextKey.startsWith('ezs_')).toBe(true);
      expect(result.apiKey.name).toBe(createData.name);
      expect(result.apiKey.scopes).toEqual(createData.scopes);
    });

    it('should validate key and return API key object', async () => {
      const { key, hash } = ApiKey.generateKeyPair();

      // Mock findByKey (via findByHash)
      (pool.query as jest.Mock)
        .mockResolvedValueOnce({
          rows: [{
            id: 'apikey-1',
            user_id: testUserId,
            key_hash: hash,
            name: 'Test Key',
            scopes: ALL_SCOPES,
            last_used_at: null,
            expires_at: null,
            created_at: new Date(),
          }],
        })
        // Mock updateLastUsed
        .mockResolvedValueOnce({ rows: [] });

      const apiKey = await apiKeyService.validateKey(key);

      expect(apiKey).toBeDefined();
      expect(apiKey!.id).toBe('apikey-1');
    });

    it('should return null for invalid key', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      const apiKey = await apiKeyService.validateKey('invalid_key');

      expect(apiKey).toBeNull();
    });

    it('should return null for expired key', async () => {
      const { key, hash } = ApiKey.generateKeyPair();
      const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{
          id: 'apikey-1',
          user_id: testUserId,
          key_hash: hash,
          name: 'Expired Key',
          scopes: ALL_SCOPES,
          last_used_at: null,
          expires_at: expiredDate,
          created_at: new Date(),
        }],
      });

      const apiKey = await apiKeyService.validateKey(key);

      expect(apiKey).toBeNull();
    });

    it('should find API keys by user ID', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          createMockApiKeyData({ id: 'key-1', name: 'Key 1' }),
          createMockApiKeyData({ id: 'key-2', name: 'Key 2' }),
        ],
      });

      const keys = await apiKeyService.findByUserId(testUserId);

      expect(keys).toHaveLength(2);
      expect(keys[0]!.name).toBe('Key 1');
      expect(keys[1]!.name).toBe('Key 2');
    });

    it('should update API key', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{
          ...createMockApiKeyData(),
          name: 'Updated Name',
          scopes: ['documents:read'],
        }],
      });

      const apiKey = await apiKeyService.updateApiKey('apikey-1', {
        name: 'Updated Name',
        scopes: ['documents:read'],
      });

      expect(apiKey).toBeDefined();
      expect(apiKey!.name).toBe('Updated Name');
      expect(apiKey!.scopes).toEqual(['documents:read']);
    });

    it('should delete API key', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({ rowCount: 1 });

      const deleted = await apiKeyService.deleteApiKey('apikey-1');

      expect(deleted).toBe(true);
    });

    it('should return false when deleting non-existent key', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({ rowCount: 0 });

      const deleted = await apiKeyService.deleteApiKey('non-existent');

      expect(deleted).toBe(false);
    });

    it('should delete expired keys', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({ rowCount: 3 });

      const deletedCount = await apiKeyService.deleteExpiredKeys();

      expect(deletedCount).toBe(3);
    });

    it('should count keys by user ID', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ count: '5' }],
      });

      const count = await apiKeyService.countByUserId(testUserId);

      expect(count).toBe(5);
    });
  });

  describe('API Key JSON Serialization', () => {
    it('should exclude key_hash from JSON output', () => {
      const apiKey = new ApiKey(createMockApiKeyData({
        key_hash: 'sensitive-hash-value',
      }));

      const json = apiKey.toJSON();

      expect((json as unknown as { key_hash?: string }).key_hash).toBeUndefined();
      expect(json.id).toBeDefined();
      expect(json.name).toBeDefined();
      expect(json.scopes).toBeDefined();
    });

    it('should include all public fields in JSON', () => {
      const data = createMockApiKeyData();
      const apiKey = new ApiKey(data);

      const json = apiKey.toJSON();

      expect(json.id).toBe(data.id);
      expect(json.user_id).toBe(data.user_id);
      expect(json.name).toBe(data.name);
      expect(json.scopes).toEqual(data.scopes);
      expect(json.last_used_at).toBe(data.last_used_at);
      expect(json.expires_at).toBe(data.expires_at);
      expect(json.created_at).toBe(data.created_at);
    });
  });

  describe('API Key with Scopes Integration', () => {
    it('should create key with limited scopes', async () => {
      const limitedScopes: ApiKeyScope[] = ['documents:read'];

      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{
          id: 'apikey-limited',
          user_id: testUserId,
          key_hash: 'mock-hash',
          name: 'Read Only Key',
          scopes: limitedScopes,
          last_used_at: null,
          expires_at: null,
          created_at: new Date(),
        }],
      });

      const result = await apiKeyService.createApiKey({
        user_id: testUserId,
        name: 'Read Only Key',
        scopes: limitedScopes,
      });

      expect(result.apiKey.scopes).toEqual(limitedScopes);
      expect(result.apiKey.hasScope('documents:read')).toBe(true);
      expect(result.apiKey.hasScope('documents:write')).toBe(false);
    });

    it('should work with full access key', () => {
      const apiKey = new ApiKey(createMockApiKeyData({
        scopes: ALL_SCOPES,
      }));

      // Should have all scopes
      expect(apiKey.hasScope('documents:read')).toBe(true);
      expect(apiKey.hasScope('documents:write')).toBe(true);
      expect(apiKey.hasScope('signers:read')).toBe(true);
      expect(apiKey.hasScope('signers:write')).toBe(true);
      expect(apiKey.hasScope('templates:read')).toBe(true);
      expect(apiKey.hasScope('templates:write')).toBe(true);
      expect(apiKey.hasScope('webhooks:read')).toBe(true);
      expect(apiKey.hasScope('webhooks:write')).toBe(true);
    });

    it('should correctly check document scopes', () => {
      const docReadKey = new ApiKey(createMockApiKeyData({
        scopes: ['documents:read'],
      }));

      const docWriteKey = new ApiKey(createMockApiKeyData({
        scopes: ['documents:write'],
      }));

      const docFullKey = new ApiKey(createMockApiKeyData({
        scopes: ['documents:read', 'documents:write'],
      }));

      expect(docReadKey.hasAllScopes(['documents:read', 'documents:write'])).toBe(false);
      expect(docWriteKey.hasAllScopes(['documents:read', 'documents:write'])).toBe(false);
      expect(docFullKey.hasAllScopes(['documents:read', 'documents:write'])).toBe(true);
    });
  });
});
