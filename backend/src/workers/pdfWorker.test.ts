import { Pool } from 'pg';
import { QueueName, NormalizedJob } from '@/config/queue';
import { PdfJobType } from '@/services/pdfQueueService';

jest.mock('@/config/queue', () => ({
  QueueName: { PDF_PROCESSING: 'pdf-processing' },
  registerWorker: jest.fn().mockResolvedValue('worker-id-1'),
}));

jest.mock('@/services/pdfService', () => ({
  pdfService: {
    generateThumbnail: jest.fn(),
    optimizePdf: jest.fn(),
    flattenPdf: jest.fn(),
    addWatermark: jest.fn(),
    mergePdfs: jest.fn(),
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

jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  mkdir: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const queueModule = jest.requireMock('@/config/queue') as { registerWorker: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { pdfService } = jest.requireMock('@/services/pdfService') as {
  pdfService: {
    generateThumbnail: jest.Mock;
    optimizePdf: jest.Mock;
    flattenPdf: jest.Mock;
    addWatermark: jest.Mock;
    mergePdfs: jest.Mock;
  };
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fsPromises = jest.requireMock('fs/promises') as {
  readFile: jest.Mock;
  writeFile: jest.Mock;
  mkdir: jest.Mock;
};

import { createPdfWorker } from './pdfWorker';

describe('pdfWorker', () => {
  let mockPool: { query: jest.Mock };
  let handler: (job: NormalizedJob) => Promise<unknown>;

  beforeEach(async () => {
    mockPool = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    fsPromises.readFile.mockResolvedValue(Buffer.from('pdf-bytes'));
    fsPromises.writeFile.mockResolvedValue(undefined);
    fsPromises.mkdir.mockResolvedValue(undefined);

    await createPdfWorker(mockPool as unknown as Pool);

    // Capture the handler registered against pg-boss.
    handler = queueModule.registerWorker.mock.calls[0][1];
  });

  it('registers the worker on the PDF_PROCESSING queue with localConcurrency 3', () => {
    expect(queueModule.registerWorker).toHaveBeenCalledWith(
      QueueName.PDF_PROCESSING,
      expect.any(Function),
      { localConcurrency: 3 }
    );
  });

  describe('GENERATE_THUMBNAIL', () => {
    it('generates a thumbnail, writes it, and updates the document row - no progress calls', async () => {
      pdfService.generateThumbnail.mockResolvedValueOnce(Buffer.from('png-bytes'));

      const job: NormalizedJob = {
        id: 'job-1',
        name: 'pdf-processing',
        retryCount: 0,
        retryLimit: 1,
        data: {
          type: PdfJobType.GENERATE_THUMBNAIL,
          documentId: 'doc-1',
          filePath: '/tmp/doc-1.pdf',
          maxWidth: 200,
          maxHeight: 300,
        },
      };

      const result = await handler(job);

      expect(pdfService.generateThumbnail).toHaveBeenCalledWith(Buffer.from('pdf-bytes'), {
        maxWidth: 200,
        maxHeight: 300,
      });
      expect(fsPromises.writeFile).toHaveBeenCalled();
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE documents'),
        expect.arrayContaining(['doc-1'])
      );
      expect(result).toEqual(
        expect.objectContaining({ relativePath: expect.stringContaining('doc-1') })
      );
    });

    it('does not throw when the DB update fails (thumbnail generation still succeeded)', async () => {
      pdfService.generateThumbnail.mockResolvedValueOnce(Buffer.from('png-bytes'));
      mockPool.query.mockRejectedValueOnce(new Error('connection refused'));

      const job: NormalizedJob = {
        id: 'job-1',
        name: 'pdf-processing',
        retryCount: 0,
        retryLimit: 1,
        data: {
          type: PdfJobType.GENERATE_THUMBNAIL,
          documentId: 'doc-1',
          filePath: '/tmp/doc-1.pdf',
        },
      };

      await expect(handler(job)).resolves.toEqual(
        expect.objectContaining({ relativePath: expect.any(String) })
      );
    });
  });

  describe('OPTIMIZE_PDF', () => {
    it('optimizes the PDF and updates size/optimization info', async () => {
      fsPromises.readFile.mockResolvedValueOnce(Buffer.from('original-bytes-longer'));
      pdfService.optimizePdf.mockResolvedValueOnce(Buffer.from('smaller'));

      const job: NormalizedJob = {
        id: 'job-2',
        name: 'pdf-processing',
        retryCount: 0,
        retryLimit: 1,
        data: { type: PdfJobType.OPTIMIZE_PDF, documentId: 'doc-2', filePath: '/tmp/doc-2.pdf' },
      };

      const result = await handler(job);

      expect(pdfService.optimizePdf).toHaveBeenCalledWith(Buffer.from('original-bytes-longer'));
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('is_optimized = true'),
        expect.any(Array)
      );
      expect(result).toEqual(
        expect.objectContaining({ optimizedPath: '/tmp/doc-2.pdf', sizeSaved: expect.any(Number) })
      );
    });
  });

  describe('FLATTEN_PDF', () => {
    it('flattens the PDF and writes a _flattened file without touching the DB', async () => {
      pdfService.flattenPdf.mockResolvedValueOnce(Buffer.from('flattened'));

      const job: NormalizedJob = {
        id: 'job-3',
        name: 'pdf-processing',
        retryCount: 0,
        retryLimit: 1,
        data: { type: PdfJobType.FLATTEN_PDF, documentId: 'doc-3', filePath: '/tmp/doc-3.pdf' },
      };

      const result = await handler(job);

      expect(result).toEqual({ flattenedPath: '/tmp/doc-3_flattened.pdf' });
      expect(mockPool.query).not.toHaveBeenCalled();
    });
  });

  describe('ADD_WATERMARK', () => {
    it('adds a watermark and writes a _watermarked file', async () => {
      pdfService.addWatermark.mockResolvedValueOnce(Buffer.from('watermarked'));

      const job: NormalizedJob = {
        id: 'job-4',
        name: 'pdf-processing',
        retryCount: 0,
        retryLimit: 1,
        data: {
          type: PdfJobType.ADD_WATERMARK,
          documentId: 'doc-4',
          filePath: '/tmp/doc-4.pdf',
          watermarkText: 'DRAFT',
        },
      };

      const result = await handler(job);

      expect(pdfService.addWatermark).toHaveBeenCalledWith(
        Buffer.from('pdf-bytes'),
        'DRAFT',
        undefined
      );
      expect(result).toEqual({ watermarkedPath: '/tmp/doc-4_watermarked.pdf' });
    });
  });

  describe('MERGE_PDFS', () => {
    it('merges all input PDFs and writes the output path', async () => {
      pdfService.mergePdfs.mockResolvedValueOnce(Buffer.from('merged'));

      const job: NormalizedJob = {
        id: 'job-5',
        name: 'pdf-processing',
        retryCount: 0,
        retryLimit: 1,
        data: {
          type: PdfJobType.MERGE_PDFS,
          documentIds: ['doc-a', 'doc-b'],
          filePaths: ['/tmp/a.pdf', '/tmp/b.pdf'],
          outputPath: '/tmp/merged.pdf',
        },
      };

      const result = await handler(job);

      expect(fsPromises.readFile).toHaveBeenCalledWith('/tmp/a.pdf');
      expect(fsPromises.readFile).toHaveBeenCalledWith('/tmp/b.pdf');
      expect(result).toEqual({ mergedPath: '/tmp/merged.pdf' });
    });
  });

  describe('error handling', () => {
    it('rethrows on an unknown job type instead of silently swallowing it', async () => {
      const job: NormalizedJob = {
        id: 'job-6',
        name: 'pdf-processing',
        retryCount: 0,
        retryLimit: 1,
        data: { type: 'not-a-real-type' } as never,
      };

      await expect(handler(job)).rejects.toThrow(/Unknown job type/);
    });

    it('rethrows a pdfService failure (DLQ write is registerWorker\'s responsibility, not this handler\'s)', async () => {
      pdfService.flattenPdf.mockRejectedValueOnce(new Error('corrupt pdf'));

      const job: NormalizedJob = {
        id: 'job-7',
        name: 'pdf-processing',
        retryCount: 1,
        retryLimit: 1,
        data: { type: PdfJobType.FLATTEN_PDF, documentId: 'doc-7', filePath: '/tmp/doc-7.pdf' },
      };

      await expect(handler(job)).rejects.toThrow('corrupt pdf');
    });
  });
});
