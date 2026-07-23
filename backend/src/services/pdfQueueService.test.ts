import { QueueName } from '@/config/queue';
import { pdfQueueService, PdfJobType } from './pdfQueueService';

jest.mock('@/config/queue', () => ({
  QueueName: { PDF_PROCESSING: 'pdf-processing' },
  enqueue: jest.fn(),
  findJob: jest.fn(),
  getQueueStats: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const queueModule = jest.requireMock('@/config/queue') as {
  enqueue: jest.Mock;
  findJob: jest.Mock;
  getQueueStats: jest.Mock;
};

describe('PdfQueueService', () => {
  describe('enqueue methods', () => {
    beforeEach(() => {
      queueModule.enqueue.mockResolvedValue('11111111-1111-1111-1111-111111111111');
    });

    it('addThumbnailJob enqueues on the PDF_PROCESSING queue with medium priority and retryLimit 1 (attempts:2 off-by-one)', async () => {
      const jobId = await pdfQueueService.addThumbnailJob({
        documentId: 'doc-1',
        filePath: '/tmp/doc-1.pdf',
        maxWidth: 200,
        maxHeight: 300,
      });

      expect(queueModule.enqueue).toHaveBeenCalledWith(
        QueueName.PDF_PROCESSING,
        {
          type: PdfJobType.GENERATE_THUMBNAIL,
          documentId: 'doc-1',
          filePath: '/tmp/doc-1.pdf',
          maxWidth: 200,
          maxHeight: 300,
        },
        { priority: 5, retryLimit: 1 }
      );
      expect(jobId).toBe('11111111-1111-1111-1111-111111111111');
    });

    it('addOptimizationJob uses lower priority (3) and retryLimit 1', async () => {
      await pdfQueueService.addOptimizationJob({ documentId: 'doc-1', filePath: '/tmp/doc-1.pdf' });

      expect(queueModule.enqueue).toHaveBeenCalledWith(
        QueueName.PDF_PROCESSING,
        { type: PdfJobType.OPTIMIZE_PDF, documentId: 'doc-1', filePath: '/tmp/doc-1.pdf' },
        { priority: 3, retryLimit: 1 }
      );
    });

    it('addFlattenJob uses priority 5 and retryLimit 1', async () => {
      await pdfQueueService.addFlattenJob({ documentId: 'doc-1', filePath: '/tmp/doc-1.pdf' });

      expect(queueModule.enqueue).toHaveBeenCalledWith(
        QueueName.PDF_PROCESSING,
        { type: PdfJobType.FLATTEN_PDF, documentId: 'doc-1', filePath: '/tmp/doc-1.pdf' },
        { priority: 5, retryLimit: 1 }
      );
    });

    it('addWatermarkJob uses priority 5, retryLimit 1, and passes through watermark options', async () => {
      await pdfQueueService.addWatermarkJob({
        documentId: 'doc-1',
        filePath: '/tmp/doc-1.pdf',
        watermarkText: 'DRAFT',
        options: { fontSize: 72, opacity: 0.3, rotation: 45 },
      });

      expect(queueModule.enqueue).toHaveBeenCalledWith(
        QueueName.PDF_PROCESSING,
        {
          type: PdfJobType.ADD_WATERMARK,
          documentId: 'doc-1',
          filePath: '/tmp/doc-1.pdf',
          watermarkText: 'DRAFT',
          options: { fontSize: 72, opacity: 0.3, rotation: 45 },
        },
        { priority: 5, retryLimit: 1 }
      );
    });

    it('addMergeJob uses the highest priority (7) and retryLimit 1', async () => {
      await pdfQueueService.addMergeJob({
        documentIds: ['doc-1', 'doc-2'],
        filePaths: ['/tmp/doc-1.pdf', '/tmp/doc-2.pdf'],
        outputPath: '/tmp/merged.pdf',
      });

      expect(queueModule.enqueue).toHaveBeenCalledWith(
        QueueName.PDF_PROCESSING,
        {
          type: PdfJobType.MERGE_PDFS,
          documentIds: ['doc-1', 'doc-2'],
          filePaths: ['/tmp/doc-1.pdf', '/tmp/doc-2.pdf'],
          outputPath: '/tmp/merged.pdf',
        },
        { priority: 7, retryLimit: 1 }
      );
    });

    it('propagates a null return from enqueue (singletonKey dedupe case)', async () => {
      queueModule.enqueue.mockResolvedValueOnce(null);

      const jobId = await pdfQueueService.addThumbnailJob({
        documentId: 'doc-1',
        filePath: '/tmp/doc-1.pdf',
      });

      expect(jobId).toBeNull();
    });
  });

  describe('getJobStatus', () => {
    it('returns null when the job does not exist', async () => {
      queueModule.findJob.mockResolvedValueOnce(null);

      await expect(pdfQueueService.getJobStatus('missing-job')).resolves.toBeNull();
      expect(queueModule.findJob).toHaveBeenCalledWith(QueueName.PDF_PROCESSING, 'missing-job');
    });

    const baseJob = {
      id: 'job-1',
      name: 'pdf-processing',
      priority: 5,
      retryLimit: 1,
      retryCount: 0,
      createdOn: new Date('2026-01-01T00:00:00.000Z'),
      startedOn: new Date('2026-01-01T00:00:01.000Z'),
      completedOn: new Date('2026-01-01T00:00:02.000Z'),
    };

    it.each([
      ['created', 'waiting'],
      ['retry', 'delayed'],
      ['active', 'active'],
      ['completed', 'completed'],
      ['failed', 'failed'],
      ['cancelled', 'failed'],
    ])('maps pg-boss state "%s" to legacy status "%s"', async (pgBossState, legacyStatus) => {
      queueModule.findJob.mockResolvedValueOnce({
        ...baseJob,
        state: pgBossState,
        output: null,
      });

      const status = await pdfQueueService.getJobStatus('job-1');

      expect(status?.status).toBe(legacyStatus);
    });

    it('always returns progress: null (no pg-boss analog for job.updateProgress)', async () => {
      queueModule.findJob.mockResolvedValueOnce({ ...baseJob, state: 'active', output: null });

      const status = await pdfQueueService.getJobStatus('job-1');

      expect(status?.progress).toBeNull();
    });

    it('returns the output as result on a completed job', async () => {
      queueModule.findJob.mockResolvedValueOnce({
        ...baseJob,
        state: 'completed',
        output: { thumbnailPath: '/tmp/x.png' },
      });

      const status = await pdfQueueService.getJobStatus('job-1');

      expect(status?.result).toEqual({ thumbnailPath: '/tmp/x.png' });
      expect(status?.error).toBeUndefined();
    });

    it('derives error from output.message on a failed job', async () => {
      queueModule.findJob.mockResolvedValueOnce({
        ...baseJob,
        state: 'failed',
        output: { name: 'Error', message: 'ENOENT: file not found' },
      });

      const status = await pdfQueueService.getJobStatus('job-1');

      expect(status?.error).toBe('ENOENT: file not found');
      expect(status?.result).toBeUndefined();
    });

    it('derives error from output on a cancelled job even without a message field', async () => {
      queueModule.findJob.mockResolvedValueOnce({
        ...baseJob,
        state: 'cancelled',
        output: { reason: 'cancelled by admin' },
      });

      const status = await pdfQueueService.getJobStatus('job-1');

      expect(status?.error).toBe(JSON.stringify({ reason: 'cancelled by admin' }));
    });

    it('maps createdOn/startedOn/completedOn to createdAt/processedAt/finishedAt', async () => {
      queueModule.findJob.mockResolvedValueOnce({ ...baseJob, state: 'completed', output: {} });

      const status = await pdfQueueService.getJobStatus('job-1');

      expect(status?.createdAt).toEqual(baseJob.createdOn);
      expect(status?.processedAt).toEqual(baseJob.startedOn);
      expect(status?.finishedAt).toEqual(baseJob.completedOn);
    });
  });

  describe('getMetrics', () => {
    it('maps pg-boss QueueStats to the legacy shape, without a completed count', async () => {
      queueModule.getQueueStats.mockResolvedValueOnce([
        {
          name: 'pdf-processing',
          deferredCount: 2,
          queuedCount: 5,
          readyCount: 3,
          activeCount: 1,
          failedCount: 4,
          totalCount: 8,
          capturedOn: new Date(),
        },
      ]);

      const metrics = await pdfQueueService.getMetrics();

      expect(metrics).toEqual({
        waiting: 3, // readyCount
        active: 1, // activeCount
        failed: 4, // failedCount
        delayed: 2, // deferredCount
      });
      expect(metrics).not.toHaveProperty('completed');
      expect(queueModule.getQueueStats).toHaveBeenCalledWith(QueueName.PDF_PROCESSING);
    });

    it('defaults every count to 0 when getQueueStats returns an empty array', async () => {
      queueModule.getQueueStats.mockResolvedValueOnce([]);

      await expect(pdfQueueService.getMetrics()).resolves.toEqual({
        waiting: 0,
        active: 0,
        failed: 0,
        delayed: 0,
      });
    });
  });
});
