import { Pool } from 'pg';
import { PdfController } from './pdfController';

// A real class (not a `jest.fn()`) whose `findById` field is a fresh
// jest.fn() created on every `new DocumentService(...)` call. Two reasons
// this shape, specifically:
//  - A bare automock (`jest.mock('@/services/documentService')` with no
//    factory) makes Jest load the REAL module to infer its shape, which
//    transitively pulls in `webhookService.ts` -> `@/config/queue` ->
//    `pg-boss` (ESM-only, not transformable under this project's ts-jest
//    config) - crashes the whole suite before any test runs.
//  - A `jest.fn().mockImplementation(() => ({ findById: jest.fn() }))`
//    factory does not survive this project's global `resetMocks: true`:
//    that implementation gets wiped before every test, so
//    `new DocumentService(...)` stops returning a usable instance.
// A plain class sidesteps both: nothing to require-and-inspect, and nothing
// for resetMocks to strip (class field initializers just run again on the
// next `new`).
jest.mock('@/services/documentService', () => {
  class DocumentService {
    findById = jest.fn();
  }
  return { DocumentService };
});

// Real getStorageConfig/createStorageAdapter/createStorageService run as-is
// (they read env vars and wrap an adapter - no I/O). Only the adapter's
// filesystem-touching implementation is mocked, matching
// documentController.test.ts's pattern.
jest.mock('@/adapters/LocalStorageAdapter');

jest.mock('@/services/pdfQueueService', () => ({
  pdfQueueService: {
    addThumbnailJob: jest.fn(),
    addOptimizationJob: jest.fn(),
    addFlattenJob: jest.fn(),
    addWatermarkJob: jest.fn(),
    addMergeJob: jest.fn(),
    getJobStatus: jest.fn(),
    getMetrics: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { pdfQueueService } = jest.requireMock('@/services/pdfQueueService') as {
  pdfQueueService: {
    addThumbnailJob: jest.Mock;
    addOptimizationJob: jest.Mock;
    addFlattenJob: jest.Mock;
    addWatermarkJob: jest.Mock;
    addMergeJob: jest.Mock;
    getJobStatus: jest.Mock;
    getMetrics: jest.Mock;
  };
};

describe('PdfController', () => {
  let controller: PdfController;
  let mockPool: Pool;
  let mockRequest: any;
  let mockResponse: any;

  beforeEach(() => {
    mockPool = { query: jest.fn().mockResolvedValue({ rows: [] }) } as unknown as Pool;
    controller = new PdfController(mockPool);

    mockRequest = {
      user: { userId: 'user-123', email: 'test@example.com', role: 'creator' },
      params: {},
      query: {},
      body: {},
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
  });

  describe('getJobStatus', () => {
    it('returns 401 when unauthenticated', async () => {
      mockRequest.user = undefined;
      mockRequest.params.jobId = 'job-1';

      await controller.getJobStatus(mockRequest, mockResponse, jest.fn());

      expect(mockResponse.status).toHaveBeenCalledWith(401);
    });

    it('returns 404 when the service reports no job found', async () => {
      mockRequest.params.jobId = 'missing-job';
      pdfQueueService.getJobStatus.mockResolvedValueOnce(null);

      await controller.getJobStatus(mockRequest, mockResponse, jest.fn());

      expect(mockResponse.status).toHaveBeenCalledWith(404);
    });

    it('passes through the adapted pg-boss status shape unchanged, including progress: null', async () => {
      mockRequest.params.jobId = 'job-1';
      const adaptedStatus = {
        id: 'job-1',
        status: 'delayed', // pg-boss "retry" mapped by the service
        progress: null,
        result: undefined,
        error: undefined,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        processedAt: undefined,
        finishedAt: undefined,
      };
      pdfQueueService.getJobStatus.mockResolvedValueOnce(adaptedStatus);

      await controller.getJobStatus(mockRequest, mockResponse, jest.fn());

      expect(pdfQueueService.getJobStatus).toHaveBeenCalledWith('job-1');
      expect(mockResponse.json).toHaveBeenCalledWith(adaptedStatus);
      expect(mockResponse.status).not.toHaveBeenCalledWith(404);
    });
  });

  describe('getQueueMetrics', () => {
    it('returns 401 when unauthenticated', async () => {
      mockRequest.user = undefined;

      await controller.getQueueMetrics(mockRequest, mockResponse, jest.fn());

      expect(mockResponse.status).toHaveBeenCalledWith(401);
    });

    it('returns the metrics shape as-is, with no completed field', async () => {
      const metrics = { waiting: 3, active: 1, failed: 4, delayed: 2 };
      pdfQueueService.getMetrics.mockResolvedValueOnce(metrics);

      await controller.getQueueMetrics(mockRequest, mockResponse, jest.fn());

      expect(mockResponse.json).toHaveBeenCalledWith(metrics);
      expect(mockResponse.json.mock.calls[0][0]).not.toHaveProperty('completed');
    });
  });

  describe('optimizePdf', () => {
    beforeEach(() => {
      mockRequest.params.id = 'doc-1';
      (controller as any).documentService.findById.mockResolvedValue({
        id: 'doc-1',
        status: 'draft',
        file_path: 'documents/doc-1.pdf',
        file_size: 1024,
      });
    });

    it('queues an optimization job and returns the pg-boss job UUID as jobId', async () => {
      pdfQueueService.addOptimizationJob.mockResolvedValueOnce('job-uuid-1');

      await controller.optimizePdf(mockRequest, mockResponse, jest.fn());

      expect(pdfQueueService.addOptimizationJob).toHaveBeenCalledWith(
        expect.objectContaining({ documentId: 'doc-1' })
      );
      expect(mockResponse.status).toHaveBeenCalledWith(202);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ jobId: 'job-uuid-1' })
      );
    });

    it('falls back to "unknown" when enqueue returns null (singletonKey dedupe)', async () => {
      pdfQueueService.addOptimizationJob.mockResolvedValueOnce(null);

      await controller.optimizePdf(mockRequest, mockResponse, jest.fn());

      expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'unknown' }));
    });
  });

  describe('getThumbnail', () => {
    it('queues thumbnail generation and returns the job UUID when no thumbnail exists yet', async () => {
      mockRequest.params.id = 'doc-1';
      (controller as any).documentService.findById.mockResolvedValue({
        id: 'doc-1',
        file_path: 'documents/doc-1.pdf',
      });
      (mockPool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ thumbnail_path: null }] });
      pdfQueueService.addThumbnailJob.mockResolvedValueOnce('thumb-job-1');

      await controller.getThumbnail(mockRequest, mockResponse, jest.fn());

      expect(pdfQueueService.addThumbnailJob).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(202);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ jobId: 'thumb-job-1' })
      );
    });
  });
});
