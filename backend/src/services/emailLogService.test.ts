import { Pool } from 'pg';
import { createEmailLogService } from './emailLogService';

jest.mock('@/services/loggerService', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('emailLogService', () => {
  let mockQuery: jest.Mock;
  let service: ReturnType<typeof createEmailLogService>;

  const row = {
    id: 'log-1',
    document_id: 'doc-1',
    signer_id: null,
    user_id: null,
    recipient_email: 'signer@example.com',
    email_type: 'signing_request',
    subject: 'Please sign',
    status: 'failed',
    error_message: 'connect ECONNREFUSED',
    message_id: 'msg-1',
    metadata: { context: { some: 'template-data' } },
    sent_at: null,
    delivered_at: null,
    opened_at: null,
    created_at: new Date('2026-08-01T00:00:00.000Z'),
  };

  beforeEach(() => {
    mockQuery = jest.fn();
    const mockPool = { query: mockQuery } as unknown as Pool;
    service = createEmailLogService(mockPool);
  });

  describe('deleteOlderThan', () => {
    it('parameterizes the retention window instead of string-interpolating it into the query', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: '1' }, { id: '2' }], rowCount: 2 });

      const deleted = await service.deleteOlderThan(30);

      expect(deleted).toBe(2);
      const [query, params] = mockQuery.mock.calls[0];
      expect(query).not.toContain('30 days');
      expect(query).toContain('$1::int');
      expect(params).toEqual([30]);
    });

    it('passes a string injection attempt through as a bound parameter rather than interpolating it into the query text', async () => {
      // Parameterized queries pass the value as a bound parameter, so even a
      // string like "30; DROP TABLE email_logs;--" can never break out of
      // the query text the way interpolation could. Deliberately calling
      // deleteOlderThan with a non-numeric value here (bypassing its `number`
      // type via a cast) proves the value still only ever reaches the query
      // as `params[0]`, never concatenated into `query`.
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      const maliciousDays = '30; DROP TABLE email_logs;--' as unknown as number;

      await service.deleteOlderThan(maliciousDays);

      const [query, params] = mockQuery.mock.calls[0];
      expect(query).toContain("INTERVAL '1 day'");
      expect(query).not.toContain('DROP TABLE');
      expect(params).toEqual([maliciousDays]);
    });
  });

  describe('queryLogs vs queryPublicLogs - metadata projection', () => {
    it('queryLogs (admin) includes the full metadata JSONB', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // count query
        .mockResolvedValueOnce({ rows: [row] }); // data query

      const result = await service.queryLogs({ documentId: 'doc-1' }, 1, 20);

      expect(result.logs).toHaveLength(1);
      expect(result.logs[0]).toHaveProperty('metadata', { context: { some: 'template-data' } });
    });

    it('queryPublicLogs (per-document endpoint) omits metadata entirely', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [row] });

      const result = await service.queryPublicLogs({ documentId: 'doc-1' }, 1, 20);

      expect(result.logs).toHaveLength(1);
      const [publicLog] = result.logs;
      expect(publicLog).not.toHaveProperty('metadata');
      // The raw error_message is still present - the categorized/raw split
      // is applied by the controller based on caller identity, not here.
      expect(publicLog?.errorMessage).toBe('connect ECONNREFUSED');
    });

    it('getByDocumentId routes through the public (no-metadata) mapper', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [row] });

      const result = await service.getByDocumentId('doc-1', 1, 20);

      expect(result.logs[0]).not.toHaveProperty('metadata');
    });

    it('neither query uses SELECT * against email_logs', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      await service.queryPublicLogs({ documentId: 'doc-1' }, 1, 20);

      const dataQuery = mockQuery.mock.calls[1][0] as string;
      expect(dataQuery).not.toMatch(/SELECT \*/);
      expect(dataQuery).toContain('error_message');
    });
  });
});
