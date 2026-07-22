import { Request, Response, NextFunction } from 'express';
import { authenticate } from './auth';
import { tokenService } from '@/services/tokenService';

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
});
