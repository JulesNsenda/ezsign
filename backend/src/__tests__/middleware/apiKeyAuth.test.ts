import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { createApiKeyAuth, createDualAuth } from '@/middleware/apiKeyAuth';
import { ApiKey } from '@/models/ApiKey';

/**
 * Unit tests for API Key Authentication Middleware
 * Tests verify that:
 * - API key authentication fetches actual user data from database
 * - Deleted users cannot use existing API keys
 * - User email and role are correctly populated
 */

describe('API Key Authentication Middleware', () => {
  let pool: Pool;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  // Test data
  const validApiKeyHash = ApiKey.hashKey('test-api-key-123');
  const testUser = {
    id: 'user-123',
    email: 'test@example.com',
    password_hash: 'hashed',
    role: 'admin',
    email_verified: true,
    email_verification_token: null,
    email_verification_expires: null,
    password_reset_token: null,
    password_reset_expires: null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const testApiKey = {
    id: 'apikey-123',
    user_id: 'user-123',
    key_hash: validApiKeyHash,
    name: 'Test API Key',
    last_used_at: null,
    expires_at: null,
    created_at: new Date(),
  };

  beforeEach(() => {
    // Setup mock pool
    pool = {
      query: jest.fn(),
      connect: jest.fn(),
    } as unknown as Pool;

    // Setup request mock
    mockRequest = {
      headers: {},
      correlationId: 'test-correlation-id',
    };

    // Setup response mock
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    // Setup next mock
    mockNext = jest.fn();

    jest.clearAllMocks();
  });

  describe('createApiKeyAuth', () => {
    it('should return 401 when no API key is provided', async () => {
      const middleware = createApiKeyAuth(pool);

      await middleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'No API key provided',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 when API key is invalid', async () => {
      mockRequest.headers = { 'x-api-key': 'invalid-key' };

      // Mock: API key not found
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      const middleware = createApiKeyAuth(pool);

      await middleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Invalid or expired API key',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 when user no longer exists (deleted user)', async () => {
      mockRequest.headers = { 'x-api-key': 'test-api-key-123' };

      // Mock: API key found
      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [testApiKey] }) // findByHash
        .mockResolvedValueOnce({ rows: [] }) // updateLastUsed (returns nothing)
        .mockResolvedValueOnce({ rows: [] }); // findById user - user not found

      const middleware = createApiKeyAuth(pool);

      await middleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'User account no longer exists',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should authenticate and populate actual user data', async () => {
      mockRequest.headers = { 'x-api-key': 'test-api-key-123' };

      // Mock: API key found and user found
      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [testApiKey] }) // findByHash
        .mockResolvedValueOnce({ rows: [] }) // updateLastUsed
        .mockResolvedValueOnce({ rows: [testUser] }); // findById user

      const middleware = createApiKeyAuth(pool);

      await middleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      expect(mockRequest.user).toEqual({
        userId: testUser.id,
        email: testUser.email,
        role: testUser.role,
      });
      expect(mockRequest.apiKey).toEqual({
        id: testApiKey.id,
        userId: testApiKey.user_id,
        name: testApiKey.name,
      });
    });

    it('should correctly set admin role from user data', async () => {
      mockRequest.headers = { 'x-api-key': 'test-api-key-123' };

      const adminUser = { ...testUser, role: 'admin' };

      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [testApiKey] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [adminUser] });

      const middleware = createApiKeyAuth(pool);

      await middleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      expect(mockRequest.user?.role).toBe('admin');
    });

    it('should correctly set creator role from user data', async () => {
      mockRequest.headers = { 'x-api-key': 'test-api-key-123' };

      const creatorUser = { ...testUser, role: 'creator' };

      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [testApiKey] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [creatorUser] });

      const middleware = createApiKeyAuth(pool);

      await middleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      expect(mockRequest.user?.role).toBe('creator');
    });

    it('should correctly set viewer role from user data', async () => {
      mockRequest.headers = { 'x-api-key': 'test-api-key-123' };

      const viewerUser = { ...testUser, role: 'viewer' };

      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [testApiKey] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [viewerUser] });

      const middleware = createApiKeyAuth(pool);

      await middleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      expect(mockRequest.user?.role).toBe('viewer');
    });
  });

  describe('createDualAuth', () => {
    it('should pass through when JWT Bearer token is present', async () => {
      mockRequest.headers = { authorization: 'Bearer some-jwt-token' };

      const middleware = createDualAuth(pool);

      await middleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      // No database queries should be made for JWT path
      expect(pool.query).not.toHaveBeenCalled();
    });

    it('should return 401 when no credentials provided', async () => {
      const middleware = createDualAuth(pool);

      await middleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'No authentication credentials provided',
      });
    });

    it('should authenticate via API key and populate user data', async () => {
      mockRequest.headers = { 'x-api-key': 'test-api-key-123' };

      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [testApiKey] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [testUser] });

      const middleware = createDualAuth(pool);

      await middleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      expect(mockRequest.user).toEqual({
        userId: testUser.id,
        email: testUser.email,
        role: testUser.role,
      });
    });

    it('should return 401 for deleted user with API key', async () => {
      mockRequest.headers = { 'x-api-key': 'test-api-key-123' };

      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [testApiKey] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }); // User not found

      const middleware = createDualAuth(pool);

      await middleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'User account no longer exists',
      });
    });
  });
});
