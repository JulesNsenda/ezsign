import { Request, Response, NextFunction } from 'express';
import { authenticate } from './auth';
import { tokenService } from '@/services/tokenService';
import { tokenBlacklistService } from '@/services/tokenBlacklistService';
import logger from '@/services/loggerService';

jest.mock('@/services/tokenService', () => ({
  tokenService: {
    extractTokenFromHeader: jest.fn(),
    verifyAccessToken: jest.fn(),
  },
}));

jest.mock('@/services/tokenBlacklistService', () => ({
  tokenBlacklistService: {
    isBlacklisted: jest.fn().mockResolvedValue(false),
    isUserSessionRevoked: jest.fn().mockResolvedValue(false),
  },
}));

jest.mock('@/services/loggerService', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('authenticate middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let responseJson: jest.Mock;
  let responseStatus: jest.Mock;

  const flaggedDecoded = {
    userId: 'user-1',
    email: 'admin@example.com',
    role: 'admin',
    mustChangePassword: true,
    // No jti - keeps the blacklist branch out of scope for these tests.
  };

  beforeEach(() => {
    responseJson = jest.fn();
    responseStatus = jest.fn().mockReturnValue({ json: responseJson });

    mockResponse = {
      status: responseStatus,
      json: responseJson,
    };
    mockNext = jest.fn();

    (tokenService.extractTokenFromHeader as jest.Mock).mockReturnValue('a-valid-token');
  });

  describe('forced password-change enforcement', () => {
    it('returns 403 PASSWORD_CHANGE_REQUIRED for an arbitrary path when the claim is set', async () => {
      (tokenService.verifyAccessToken as jest.Mock).mockReturnValue(flaggedDecoded);
      mockRequest = {
        headers: { authorization: 'Bearer a-valid-token' },
        query: {},
        baseUrl: '',
        path: '/api/documents',
      };

      await authenticate(mockRequest as Request, mockResponse as Response, mockNext);

      expect(responseStatus).toHaveBeenCalledWith(403);
      expect(responseJson).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: 'Password change required before accessing this resource',
        code: 'PASSWORD_CHANGE_REQUIRED',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('allows /api/auth/change-password when the claim is set', async () => {
      (tokenService.verifyAccessToken as jest.Mock).mockReturnValue(flaggedDecoded);
      mockRequest = {
        headers: { authorization: 'Bearer a-valid-token' },
        query: {},
        baseUrl: '',
        path: '/api/auth/change-password',
      };

      await authenticate(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(responseStatus).not.toHaveBeenCalled();
    });

    it('allows /api/auth/me when the claim is set', async () => {
      (tokenService.verifyAccessToken as jest.Mock).mockReturnValue(flaggedDecoded);
      mockRequest = {
        headers: { authorization: 'Bearer a-valid-token' },
        query: {},
        baseUrl: '',
        path: '/api/auth/me',
      };

      await authenticate(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(responseStatus).not.toHaveBeenCalled();
    });

    it('is an exact-path match: a path merely prefixed by the allow-listed path is still blocked', async () => {
      (tokenService.verifyAccessToken as jest.Mock).mockReturnValue(flaggedDecoded);
      mockRequest = {
        headers: { authorization: 'Bearer a-valid-token' },
        query: {},
        baseUrl: '',
        path: '/api/auth/change-password-extra',
      };

      await authenticate(mockRequest as Request, mockResponse as Response, mockNext);

      expect(responseStatus).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('does not block a normal path when the claim is absent', async () => {
      (tokenService.verifyAccessToken as jest.Mock).mockReturnValue({
        userId: 'user-2',
        email: 'user@example.com',
        role: 'creator',
      });
      mockRequest = {
        headers: { authorization: 'Bearer a-valid-token' },
        query: {},
        baseUrl: '',
        path: '/api/documents',
      };

      await authenticate(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(responseStatus).not.toHaveBeenCalled();
    });
  });

  describe('admin-path query-token guard', () => {
    it('ignores a ?token= query param on an admin path, even with mixed case', async () => {
      (tokenService.extractTokenFromHeader as jest.Mock).mockReturnValue(null);
      mockRequest = {
        headers: {},
        query: { token: 'sneaky-query-token' },
        baseUrl: '',
        path: '/API/Admin/settings',
      };

      await authenticate(mockRequest as Request, mockResponse as Response, mockNext);

      expect(tokenService.verifyAccessToken).not.toHaveBeenCalled();
      expect(responseStatus).toHaveBeenCalledWith(401);
      expect(responseJson).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'No authentication token provided',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('still accepts a ?token= query param on a non-admin path (control case)', async () => {
      (tokenService.extractTokenFromHeader as jest.Mock).mockReturnValue(null);
      (tokenService.verifyAccessToken as jest.Mock).mockReturnValue({
        userId: 'user-3',
        email: 'user3@example.com',
        role: 'creator',
      });
      mockRequest = {
        headers: {},
        query: { token: 'pdf-loading-token' },
        baseUrl: '',
        path: '/api/documents/123/file',
      };

      await authenticate(mockRequest as Request, mockResponse as Response, mockNext);

      expect(tokenService.verifyAccessToken).toHaveBeenCalledWith('pdf-loading-token');
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('revocation checks (fail-closed)', () => {
    const decodedWithJti = {
      userId: 'user-1',
      email: 'user@example.com',
      role: 'creator',
      jti: 'jti-1',
      iat: Math.floor(Date.now() / 1000),
    };

    beforeEach(() => {
      (tokenService.verifyAccessToken as jest.Mock).mockReturnValue(decodedWithJti);
      mockRequest = {
        headers: { authorization: 'Bearer a-valid-token' },
        query: {},
        baseUrl: '',
        path: '/api/documents',
      };
    });

    it('returns 401 when isBlacklisted resolves true (the service already fails closed on its own query errors)', async () => {
      (tokenBlacklistService.isBlacklisted as jest.Mock).mockResolvedValueOnce(true);

      await authenticate(mockRequest as Request, mockResponse as Response, mockNext);

      expect(responseStatus).toHaveBeenCalledWith(401);
      expect(responseJson).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Token has been revoked',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('returns 401 when isUserSessionRevoked resolves true', async () => {
      (tokenBlacklistService.isBlacklisted as jest.Mock).mockResolvedValueOnce(false);
      (tokenBlacklistService.isUserSessionRevoked as jest.Mock).mockResolvedValueOnce(true);

      await authenticate(mockRequest as Request, mockResponse as Response, mockNext);

      expect(responseStatus).toHaveBeenCalledWith(401);
      expect(responseJson).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Session has been revoked. Please log in again.',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('returns 401 (not 500/503) when the blacklist service throws unexpectedly (e.g. used before init)', async () => {
      (tokenBlacklistService.isBlacklisted as jest.Mock).mockRejectedValueOnce(
        new Error('TokenBlacklistService used before init(pool) was called')
      );

      await authenticate(mockRequest as Request, mockResponse as Response, mockNext);

      expect(responseStatus).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('allows the request through when neither check reports revocation', async () => {
      (tokenBlacklistService.isBlacklisted as jest.Mock).mockResolvedValueOnce(false);
      (tokenBlacklistService.isUserSessionRevoked as jest.Mock).mockResolvedValueOnce(false);

      await authenticate(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(responseStatus).not.toHaveBeenCalled();
    });
  });

  describe('outer catch: internal error messages must not leak to the client (Gate 2 fix 4)', () => {
    beforeEach(() => {
      mockRequest = {
        headers: { authorization: 'Bearer a-valid-token' },
        query: {},
        baseUrl: '',
        path: '/api/documents',
      };
    });

    it.each([['Access token has expired'], ['Invalid access token']])(
      'returns the verbatim message for the expected JWT error %j',
      async (message) => {
        (tokenService.verifyAccessToken as jest.Mock).mockImplementation(() => {
          throw new Error(message);
        });

        await authenticate(mockRequest as Request, mockResponse as Response, mockNext);

        expect(responseStatus).toHaveBeenCalledWith(401);
        expect(responseJson).toHaveBeenCalledWith({
          error: 'Unauthorized',
          message,
        });
        expect(mockNext).not.toHaveBeenCalled();
      }
    );

    it('does not leak an unexpected internal error message (e.g. a TokenBlacklistService wiring bug) - responds with a generic message and logs the real error server-side', async () => {
      const internalMessage = 'TokenBlacklistService used before init(pool) was called';
      (tokenService.verifyAccessToken as jest.Mock).mockReturnValue({
        userId: 'user-1',
        email: 'user@example.com',
        role: 'creator',
        jti: 'jti-1',
        iat: Math.floor(Date.now() / 1000),
      });
      (tokenBlacklistService.isBlacklisted as jest.Mock).mockRejectedValueOnce(
        new Error(internalMessage)
      );

      await authenticate(mockRequest as Request, mockResponse as Response, mockNext);

      expect(responseStatus).toHaveBeenCalledWith(401);
      expect(responseJson).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Authentication failed',
      });
      expect(responseJson).not.toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('TokenBlacklistService') })
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Authentication failed with an unexpected error',
        expect.objectContaining({ error: internalMessage })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('responds with the generic message for a non-Error throw', async () => {
      (tokenService.verifyAccessToken as jest.Mock).mockImplementation(() => {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        throw 'not an Error instance';
      });

      await authenticate(mockRequest as Request, mockResponse as Response, mockNext);

      expect(responseStatus).toHaveBeenCalledWith(401);
      expect(responseJson).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Authentication failed',
      });
    });
  });
});
