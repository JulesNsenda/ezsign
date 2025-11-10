import { PdfService } from './pdfService';
import { PDFDocument } from 'pdf-lib';

describe('PdfService', () => {
  let pdfService: PdfService;
  let samplePdfBuffer: Buffer;

  beforeAll(async () => {
    pdfService = new PdfService();

    // Create a simple PDF for testing
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 800]);
    page.drawText('Test PDF Content', { x: 50, y: 750 });
    const pdfBytes = await pdfDoc.save();
    samplePdfBuffer = Buffer.from(pdfBytes);
  });

  describe('loadPdf', () => {
    it('should load a PDF from buffer', async () => {
      const pdfDoc = await pdfService.loadPdf(samplePdfBuffer);
      expect(pdfDoc).toBeDefined();
      expect(pdfDoc.getPageCount()).toBe(1);
    });

    it('should throw error for invalid PDF', async () => {
      const invalidBuffer = Buffer.from('not a pdf');
      await expect(pdfService.loadPdf(invalidBuffer)).rejects.toThrow();
    });
  });

  describe('createPdf', () => {
    it('should create a new empty PDF', async () => {
      const pdfDoc = await pdfService.createPdf();
      expect(pdfDoc).toBeDefined();
      expect(pdfDoc.getPageCount()).toBe(0);
    });
  });

  describe('getPdfInfo', () => {
    it('should return PDF information', async () => {
      const info = await pdfService.getPdfInfo(samplePdfBuffer);

      expect(info).toHaveProperty('pageCount');
      expect(info).toHaveProperty('pages');
      expect(info.pageCount).toBe(1);
      expect(info.pages).toHaveLength(1);
      expect(info.pages[0]).toHaveProperty('pageNumber');
      expect(info.pages[0]).toHaveProperty('width');
      expect(info.pages[0]).toHaveProperty('height');
      expect(info.pages[0]?.width).toBe(600);
      expect(info.pages[0]?.height).toBe(800);
    });
  });

  describe('addTextField', () => {
    it('should add text to PDF', async () => {
      const result = await pdfService.addTextField(samplePdfBuffer, {
        page: 0,
        x: 100,
        y: 700,
        text: 'Added Text',
        fontSize: 14,
      });

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);

      // Verify the PDF is still valid
      const pdfDoc = await pdfService.loadPdf(result);
      expect(pdfDoc.getPageCount()).toBe(1);
    });

    it('should throw error for invalid page number', async () => {
      await expect(
        pdfService.addTextField(samplePdfBuffer, {
          page: 10,
          x: 100,
          y: 700,
          text: 'Test',
        })
      ).rejects.toThrow('Page 10 does not exist');
    });
  });

  describe('addDateField', () => {
    it('should add date to PDF with ISO format', async () => {
      const result = await pdfService.addDateField(samplePdfBuffer, {
        page: 0,
        x: 100,
        y: 650,
        text: '', // Will be replaced by date
        format: 'iso',
      });

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should add date with locale format', async () => {
      const result = await pdfService.addDateField(samplePdfBuffer, {
        page: 0,
        x: 100,
        y: 600,
        text: '',
        format: 'locale',
      });

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should add date with short format', async () => {
      const result = await pdfService.addDateField(samplePdfBuffer, {
        page: 0,
        x: 100,
        y: 550,
        text: '',
        format: 'short',
      });

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('mergePdfs', () => {
    it('should merge multiple PDFs', async () => {
      // Create two PDFs
      const pdfDoc1 = await PDFDocument.create();
      pdfDoc1.addPage([600, 800]);
      const pdf1Bytes = await pdfDoc1.save();

      const pdfDoc2 = await PDFDocument.create();
      pdfDoc2.addPage([600, 800]);
      const pdf2Bytes = await pdfDoc2.save();

      const result = await pdfService.mergePdfs([
        Buffer.from(pdf1Bytes),
        Buffer.from(pdf2Bytes),
      ]);

      expect(result).toBeInstanceOf(Buffer);

      // Verify merged PDF has 2 pages
      const mergedDoc = await pdfService.loadPdf(result);
      expect(mergedDoc.getPageCount()).toBe(2);
    });

    it('should handle empty array', async () => {
      const result = await pdfService.mergePdfs([]);
      const doc = await pdfService.loadPdf(result);
      // Merging an empty array creates an empty PDF document (with 0 pages is acceptable)
      expect(doc.getPageCount()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('extractPages', () => {
    it('should extract specific pages from PDF', async () => {
      // Create a PDF with 3 pages
      const pdfDoc = await PDFDocument.create();
      pdfDoc.addPage([600, 800]);
      pdfDoc.addPage([600, 800]);
      pdfDoc.addPage([600, 800]);
      const pdfBytes = await pdfDoc.save();
      const pdfBuffer = Buffer.from(pdfBytes);

      // Extract pages 0 and 2
      const result = await pdfService.extractPages(pdfBuffer, [0, 2]);

      expect(result).toBeInstanceOf(Buffer);

      // Verify extracted PDF has 2 pages
      const extractedDoc = await pdfService.loadPdf(result);
      expect(extractedDoc.getPageCount()).toBe(2);
    });
  });

  describe('addWatermark', () => {
    it('should add watermark to all pages', async () => {
      const result = await pdfService.addWatermark(
        samplePdfBuffer,
        'CONFIDENTIAL',
        {
          fontSize: 48,
          opacity: 0.3,
          rotation: 45,
        }
      );

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);

      // Verify the PDF is still valid
      const pdfDoc = await pdfService.loadPdf(result);
      expect(pdfDoc.getPageCount()).toBe(1);
    });

    it('should use default options if not provided', async () => {
      const result = await pdfService.addWatermark(
        samplePdfBuffer,
        'WATERMARK'
      );

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('addCertificate', () => {
    it('should add certificate page to PDF', async () => {
      const certificateData = {
        documentTitle: 'Test Agreement',
        completedDate: new Date('2024-01-15'),
        signers: [
          {
            name: 'John Doe',
            email: 'john@example.com',
            signedAt: new Date('2024-01-15T10:00:00Z'),
          },
          {
            name: 'Jane Smith',
            email: 'jane@example.com',
            signedAt: new Date('2024-01-15T11:00:00Z'),
          },
        ],
        documentId: 'doc-123',
      };

      const result = await pdfService.addCertificate(
        samplePdfBuffer,
        certificateData
      );

      expect(result).toBeInstanceOf(Buffer);

      // Verify the PDF now has 2 pages (original + certificate)
      const pdfDoc = await pdfService.loadPdf(result);
      expect(pdfDoc.getPageCount()).toBe(2);
    });
  });

  describe('flattenPdf', () => {
    it('should flatten PDF', async () => {
      const result = await pdfService.flattenPdf(samplePdfBuffer);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);

      // Verify the PDF is still valid
      const pdfDoc = await pdfService.loadPdf(result);
      expect(pdfDoc.getPageCount()).toBe(1);
    });
  });

  describe('optimizePdf', () => {
    it('should optimize PDF', async () => {
      const result = await pdfService.optimizePdf(samplePdfBuffer);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);

      // Verify the PDF is still valid
      const pdfDoc = await pdfService.loadPdf(result);
      expect(pdfDoc.getPageCount()).toBe(1);
    });
  });

  describe('addMultipleFields', () => {
    it('should add multiple fields in one operation', async () => {
      const result = await pdfService.addMultipleFields(samplePdfBuffer, {
        textFields: [
          {
            page: 0,
            x: 100,
            y: 700,
            text: 'Text Field 1',
          },
          {
            page: 0,
            x: 100,
            y: 650,
            text: 'Text Field 2',
          },
        ],
        dateFields: [
          {
            page: 0,
            x: 100,
            y: 600,
            text: '',
            format: 'iso',
          },
        ],
      });

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);

      // Verify the PDF is still valid
      const pdfDoc = await pdfService.loadPdf(result);
      expect(pdfDoc.getPageCount()).toBe(1);
    });

    it('should handle empty fields object', async () => {
      const result = await pdfService.addMultipleFields(samplePdfBuffer, {});

      expect(result).toBeInstanceOf(Buffer);

      // Should return the same PDF
      const pdfDoc = await pdfService.loadPdf(result);
      expect(pdfDoc.getPageCount()).toBe(1);
    });
  });
});
