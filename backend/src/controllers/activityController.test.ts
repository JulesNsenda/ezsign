import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { ActivityController } from './activityController';
import { allowAdmin } from '@/middleware/authorize';
import { AuditService } from '@/services/auditService';
import { createActivityService } from '@/services/activityService';

jest.mock('@/services/activityService', () => ({
  createActivityService: jest.fn(),
}));

jest.mock('@/services/loggerService', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockCreateActivityService = createActivityService as jest.Mock;

function makeItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'row-1',
    kind: 'email',
    createdAt: new Date('2026-08-01T10:00:00Z'),
    type: 'signing_request',
    status: 'failed',
    errorMessage: null,
    subject: 'Please sign',
    recipientEmail: 'signer@example.com',
    actorEmail: 'owner@example.com',
    signerEmail: 'signer@example.com',
    signerName: 'Signer One',
    metadata: null,
    ...overrides,
  };
}

describe('ActivityController', () => {
  let controller: ActivityController;
  let getByDocumentId: jest.Mock;
  let mockAuditService: { recordEvent: jest.Mock };
  let req: any;
  let res: any;
  let next: NextFunction;

  beforeEach(() => {
    getByDocumentId = jest.fn().mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
    });
    mockCreateActivityService.mockReturnValue({ getByDocumentId });
    mockAuditService = { recordEvent: jest.fn().mockResolvedValue(true) };
    controller = new ActivityController({} as Pool, mockAuditService as unknown as AuditService);

    req = {
      // A real uuid: the handler validates the shape now, because the admin
      // bypass skips the middleware that used to reject a malformed id.
      params: { id: '11111111-1111-4111-8111-111111111111' },
      query: {},
      user: { userId: 'user-1', email: 'owner@example.com', role: 'creator' },
      ip: '203.0.113.5',
      get: jest.fn().mockReturnValue('jest-agent'),
    };
    res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    next = jest.fn();
  });

  describe('raw SMTP errors are instance-admin only', () => {
    // Mirrors EmailLogController.canSeeRawError deliberately: error_message
    // describes the *instance's* SMTP transport (host, port, auth username),
    // which owning a document does not earn you. Without this, any user on a
    // multi-user instance could add a signer at a nonexistent domain, send,
    // and read the SMTP host back out of the timeline.
    const rawError = 'connect ECONNREFUSED smtp.internal.example:587';

    it('categorizes the error for a document owner', async () => {
      getByDocumentId.mockResolvedValue({
        items: [makeItem({ errorMessage: rawError })],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      await controller.getDocumentActivity(req as Request, res as Response, next);

      const body = res.json.mock.calls[0][0];
      expect(body.items[0].errorMessage).not.toContain('smtp.internal.example');
      expect(body.items[0].errorMessage).toBe('SMTP connection failed');
    });

    it('passes the raw error through for an instance admin', async () => {
      req.user.role = 'admin';
      getByDocumentId.mockResolvedValue({
        items: [makeItem({ errorMessage: rawError })],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      await controller.getDocumentActivity(req as Request, res as Response, next);

      expect(res.json.mock.calls[0][0].items[0].errorMessage).toBe(rawError);
    });

    it('leaves rows without an error untouched', async () => {
      getByDocumentId.mockResolvedValue({
        items: [makeItem({ status: 'sent', errorMessage: null })],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      await controller.getDocumentActivity(req as Request, res as Response, next);

      expect(res.json.mock.calls[0][0].items[0].errorMessage).toBeNull();
    });
  });

  describe('pagination params', () => {
    it('clamps an unbounded pageSize', async () => {
      // Unclamped, `?pageSize=10000000` pulls the whole timeline into memory.
      req.query = { pageSize: '10000000' };

      await controller.getDocumentActivity(req as Request, res as Response, next);

      expect(getByDocumentId).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', 1, 100);
    });

    it('floors page at 1', async () => {
      // `page=0` would produce OFFSET -20, which Postgres rejects outright as
      // an unhandled 500.
      req.query = { page: '0' };

      await controller.getDocumentActivity(req as Request, res as Response, next);

      expect(getByDocumentId).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', 1, 20);
    });

    it('defaults a missing pageSize rather than passing NaN', async () => {
      await controller.getDocumentActivity(req as Request, res as Response, next);

      expect(getByDocumentId).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', 1, 20);
    });
  });

  it('rejects a malformed document id with 400 rather than reaching the query', async () => {
    // `checkDocumentAccess` used to reject this as a side effect of looking
    // the document up, but the admin bypass skips that middleware - so
    // without this check an admin's request reaches the UNION and surfaces a
    // raw Postgres type error as a 500.
    req.params.id = 'not-a-uuid';

    await controller.getDocumentActivity(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getByDocumentId).not.toHaveBeenCalled();
  });

  it('caps a deep page so an absurd offset cannot force a full scan', async () => {
    req.query = { page: '99999999' };

    await controller.getDocumentActivity(req as Request, res as Response, next);

    expect(getByDocumentId).toHaveBeenCalledWith(expect.any(String), 10_000, 20);
  });

  it('returns the nested pagination envelope, echoing the requested page', async () => {
    // `page`/`limit` in the envelope come from the request, not from whatever
    // the service echoes back - the controller owns the wire shape.
    req.query = { page: '2' };
    getByDocumentId.mockResolvedValue({
      items: [makeItem()],
      total: 42,
      page: 2,
      limit: 20,
      totalPages: 3,
    });

    await controller.getDocumentActivity(req as Request, res as Response, next);

    expect(res.json.mock.calls[0][0].pagination).toEqual({
      total: 42,
      page: 2,
      limit: 20,
      total_pages: 3,
    });
  });

  describe('permissions.canResend', () => {
    it('is true for a caller who reached the document normally', async () => {
      await controller.getDocumentActivity(req as Request, res as Response, next);

      expect(res.json.mock.calls[0][0].permissions).toEqual({ canResend: true });
    });

    it('is false for an admin who came through the bypass', async () => {
      // The resend endpoint is `checkDocumentAccess`-only, so offering the
      // action here would 403 for exactly the user the bypass exists for.
      req.user.role = 'admin';
      req.usedAdminBypass = true;

      await controller.getDocumentActivity(req as Request, res as Response, next);

      expect(res.json.mock.calls[0][0].permissions).toEqual({ canResend: false });
    });
  });

  describe('admin bypass is itself recorded', () => {
    it('records the privileged read when an admin used the bypass', async () => {
      // A compromised admin enumerating tenants is otherwise
      // indistinguishable from normal operation after the fact - and in a
      // signing product the audit trail is the thing being read.
      req.user.role = 'admin';
      req.usedAdminBypass = true;

      await controller.getDocumentActivity(req as Request, res as Response, next);

      expect(mockAuditService.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'admin.activity_viewed',
          user_id: 'user-1',
          metadata: expect.objectContaining({ actor_email: 'owner@example.com' }),
        })
      );
    });

    it('records nothing when the caller reached the document normally', async () => {
      // An owner, or an admin who owns the document, did not use the bypass -
      // recording every read would bury the timeline in its own noise.
      await controller.getDocumentActivity(req as Request, res as Response, next);

      expect(mockAuditService.recordEvent).not.toHaveBeenCalled();
    });
  });

  it('forwards service failures to the error handler', async () => {
    const boom = new Error('union exploded');
    getByDocumentId.mockRejectedValue(boom);

    await controller.getDocumentActivity(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith(boom);
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe('allowAdmin', () => {
  // `createDocumentAccessMiddleware` answers 403 itself and never calls
  // next(), so a controller cannot add an admin path after the fact - it
  // never runs. The bypass has to sit in the middleware chain, and these
  // assertions are the whole reason it exists.
  let checkDocumentAccess: jest.Mock;
  let res: any;
  let next: jest.Mock;

  beforeEach(() => {
    checkDocumentAccess = jest.fn();
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    next = jest.fn();
  });

  it('lets an instance admin through without consulting document access', async () => {
    const req = { user: { userId: 'admin-1', role: 'admin' }, params: { id: 'someone-elses-doc' } };

    allowAdmin(checkDocumentAccess)(req as any, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(checkDocumentAccess).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('defers to document access for a non-admin', async () => {
    const req = { user: { userId: 'user-1', role: 'creator' }, params: { id: 'doc-1' } };

    allowAdmin(checkDocumentAccess)(req as any, res as Response, next);

    expect(checkDocumentAccess).toHaveBeenCalledWith(req, res, next);
    expect(next).not.toHaveBeenCalled();
  });

  it('defers to document access when there is no authenticated user', async () => {
    // The bypass must never be the thing that lets an unauthenticated request
    // past - `authenticate` runs first, but this should fail closed anyway.
    const req = { params: { id: 'doc-1' } };

    allowAdmin(checkDocumentAccess)(req as any, res as Response, next);

    expect(checkDocumentAccess).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});
