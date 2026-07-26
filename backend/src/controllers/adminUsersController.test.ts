import { Pool } from 'pg';
import { AdminUsersController } from './adminUsersController';
import { tokenBlacklistService } from '@/services/tokenBlacklistService';

jest.mock('@/services/tokenBlacklistService', () => ({
  tokenBlacklistService: {
    blacklistAllUserTokens: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('@/services/loggerService', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('AdminUsersController', () => {
  let controller: AdminUsersController;
  let mockUserService: { listAccountsForAudit: jest.Mock; findById: jest.Mock };
  let mockPoolQuery: jest.Mock;
  let mockRequest: any;
  let mockResponse: any;
  let mockNext: jest.Mock;
  let responseJson: jest.Mock;
  let responseStatus: jest.Mock;

  beforeEach(() => {
    mockPoolQuery = jest.fn().mockResolvedValue({ rows: [] });
    const mockPool = { query: mockPoolQuery } as unknown as Pool;
    controller = new AdminUsersController(mockPool);

    mockUserService = {
      listAccountsForAudit: jest.fn(),
      findById: jest.fn(),
    };
    (controller as any).userService = mockUserService;

    responseJson = jest.fn();
    responseStatus = jest.fn().mockReturnValue({ json: responseJson });
    mockNext = jest.fn();

    mockRequest = {
      params: {},
      query: {},
      user: { userId: 'admin-1', email: 'admin@example.com', role: 'admin' },
    };
    mockResponse = { status: responseStatus, json: responseJson };

    jest.clearAllMocks();
    mockPoolQuery.mockResolvedValue({ rows: [] });
    (tokenBlacklistService.blacklistAllUserTokens as jest.Mock).mockResolvedValue(true);
  });

  describe('listAccountsForAudit', () => {
    it('returns a paginated page of accounts from the service', async () => {
      const accounts = [
        { id: '1', email: 'a@example.com', role: 'creator', created_at: new Date('2026-01-01') },
        { id: '2', email: 'b@example.com', role: 'signer', created_at: new Date('2026-01-02') },
      ];
      mockUserService.listAccountsForAudit.mockResolvedValue({ accounts, total: 2 });

      await controller.listAccountsForAudit(mockRequest, mockResponse, mockNext);

      expect(mockUserService.listAccountsForAudit).toHaveBeenCalledWith({ limit: 20, offset: 0 });
      expect(responseJson).toHaveBeenCalledWith({
        success: true,
        data: { users: accounts, total: 2, page: 1, pageSize: 20, totalPages: 1 },
      });
    });

    it('caps an oversized pageSize and computes the offset for later pages', async () => {
      mockRequest.query = { page: '3', pageSize: '9999' };
      mockUserService.listAccountsForAudit.mockResolvedValue({ accounts: [], total: 250 });

      await controller.listAccountsForAudit(mockRequest, mockResponse, mockNext);

      expect(mockUserService.listAccountsForAudit).toHaveBeenCalledWith({ limit: 100, offset: 200 });
      expect(responseJson).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ page: 3, pageSize: 100, totalPages: 3 }) })
      );
    });

    it('forwards a service error to next() rather than handling it inline', async () => {
      const error = new Error('db down');
      mockUserService.listAccountsForAudit.mockRejectedValue(error);

      await controller.listAccountsForAudit(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
      expect(responseStatus).not.toHaveBeenCalled();
    });
  });

  describe('revokeSessions', () => {
    it('rejects a malformed userId without querying the database', async () => {
      mockRequest.params = { userId: 'not-a-uuid' };

      await controller.revokeSessions(mockRequest, mockResponse, mockNext);

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(mockUserService.findById).not.toHaveBeenCalled();
      expect(tokenBlacklistService.blacklistAllUserTokens).not.toHaveBeenCalled();
    });

    it('returns 404 when the target user does not exist', async () => {
      mockRequest.params = { userId: '11111111-1111-4111-8111-111111111111' };
      mockUserService.findById.mockResolvedValue(null);

      await controller.revokeSessions(mockRequest, mockResponse, mockNext);

      expect(responseStatus).toHaveBeenCalledWith(404);
      expect(tokenBlacklistService.blacklistAllUserTokens).not.toHaveBeenCalled();
    });

    it('revokes all sessions for the target user via tokenBlacklistService and writes an audit event', async () => {
      mockRequest.params = { userId: '11111111-1111-4111-8111-111111111111' };
      mockUserService.findById.mockResolvedValue({
        id: '11111111-1111-4111-8111-111111111111',
        email: 'target@example.com',
      });

      await controller.revokeSessions(mockRequest, mockResponse, mockNext);

      expect(tokenBlacklistService.blacklistAllUserTokens).toHaveBeenCalledWith(
        '11111111-1111-4111-8111-111111111111'
      );
      expect(responseJson).toHaveBeenCalledWith({
        success: true,
        data: { message: 'All sessions revoked for target@example.com' },
      });

      const auditCall = mockPoolQuery.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('INSERT INTO audit_events')
      );
      expect(auditCall).toBeDefined();
      expect(auditCall![0]).toEqual(expect.stringContaining("'user.sessions_revoked'"));
      expect(auditCall![1][0]).toBe('admin-1');
      const metadata = JSON.parse(auditCall![1][2]);
      expect(metadata).toEqual({
        targetUserId: '11111111-1111-4111-8111-111111111111',
        targetEmail: 'target@example.com',
      });
    });

    it('returns 500 REVOCATION_FAILED (not a false success) when the revocation write fails', async () => {
      mockRequest.params = { userId: '11111111-1111-4111-8111-111111111111' };
      mockUserService.findById.mockResolvedValue({
        id: '11111111-1111-4111-8111-111111111111',
        email: 'target@example.com',
      });
      (tokenBlacklistService.blacklistAllUserTokens as jest.Mock).mockResolvedValue(false);

      await controller.revokeSessions(mockRequest, mockResponse, mockNext);

      expect(responseStatus).toHaveBeenCalledWith(500);
      expect(responseJson).toHaveBeenCalledWith({
        success: false,
        error: { code: 'REVOCATION_FAILED', message: 'Failed to revoke sessions - please retry' },
      });
      // No audit event for a revocation that didn't actually happen.
      const auditCall = mockPoolQuery.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('INSERT INTO audit_events')
      );
      expect(auditCall).toBeUndefined();
    });

    it('still responds success when the best-effort audit write fails', async () => {
      mockRequest.params = { userId: '11111111-1111-4111-8111-111111111111' };
      mockUserService.findById.mockResolvedValue({
        id: '11111111-1111-4111-8111-111111111111',
        email: 'target@example.com',
      });
      mockPoolQuery.mockRejectedValueOnce(new Error('audit insert failed'));

      await controller.revokeSessions(mockRequest, mockResponse, mockNext);

      expect(responseJson).toHaveBeenCalledWith({
        success: true,
        data: { message: 'All sessions revoked for target@example.com' },
      });
    });

    it('forwards an unexpected error (e.g. findById throwing) to next() rather than handling it inline', async () => {
      mockRequest.params = { userId: '11111111-1111-4111-8111-111111111111' };
      const error = new Error('db down');
      mockUserService.findById.mockRejectedValue(error);

      await controller.revokeSessions(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
      expect(tokenBlacklistService.blacklistAllUserTokens).not.toHaveBeenCalled();
    });
  });
});
