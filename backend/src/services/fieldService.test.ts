import { FieldService } from './fieldService';
import { Field } from '@/models/Field';

// Mock PdfService
jest.mock('./pdfService');

describe('FieldService', () => {
  let fieldService: FieldService;
  let mockPool: any;
  let mockPdfService: any;
  let mockClient: any;

  const mockDocumentId = 'doc-123';
  const mockFieldId = 'field-456';

  const mockDocument = {
    file_path: '/storage/documents/test.pdf',
    page_count: 3,
  };

  const mockPageDimensions = {
    width: 612,
    height: 792,
  };

  const mockFieldRow = {
    id: mockFieldId,
    document_id: mockDocumentId,
    type: 'text',
    page: 0,
    x: 100,
    y: 200,
    width: 150,
    height: 30,
    required: true,
    signer_email: 'signer@example.com',
    properties: { placeholder: 'Enter name' },
    visibility_rules: null,
    calculation: null,
    created_at: new Date(),
  };

  beforeEach(() => {
    // Mock pool client for transactions
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    // Mock pool
    mockPool = {
      query: jest.fn(),
      connect: jest.fn().mockResolvedValue(mockClient),
    };

    // Mock PdfService
    mockPdfService = {
      getPageDimensions: jest.fn().mockResolvedValue(mockPageDimensions),
    };

    fieldService = new FieldService(mockPdfService, mockPool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createField', () => {
    it('should create a field successfully', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [mockDocument] }) // Document lookup
        .mockResolvedValueOnce({ rows: [mockFieldRow] }); // Insert

      const result = await fieldService.createField({
        document_id: mockDocumentId,
        type: 'text',
        page: 0,
        x: 100,
        y: 200,
        width: 150,
        height: 30,
        required: true,
        signer_email: 'signer@example.com',
      });

      expect(result).toBeInstanceOf(Field);
      expect(result.id).toBe(mockFieldId);
      expect(result.type).toBe('text');
      expect(mockPdfService.getPageDimensions).toHaveBeenCalledWith(
        mockDocument.file_path,
        0
      );
    });

    it('should throw error for invalid field type', async () => {
      await expect(
        fieldService.createField({
          document_id: mockDocumentId,
          type: 'invalid' as any,
          page: 0,
          x: 100,
          y: 200,
          width: 150,
          height: 30,
        })
      ).rejects.toThrow('Invalid field type');
    });

    it('should throw error for non-existent document', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        fieldService.createField({
          document_id: 'non-existent',
          type: 'text',
          page: 0,
          x: 100,
          y: 200,
          width: 150,
          height: 30,
        })
      ).rejects.toThrow('Document not found');
    });

    it('should throw error for invalid page number', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockDocument] });

      await expect(
        fieldService.createField({
          document_id: mockDocumentId,
          type: 'text',
          page: 5, // Document only has 3 pages (0-indexed)
          x: 100,
          y: 200,
          width: 150,
          height: 30,
        })
      ).rejects.toThrow('Invalid page number');
    });

    it('should throw error for field outside page bounds', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockDocument] });

      await expect(
        fieldService.createField({
          document_id: mockDocumentId,
          type: 'text',
          page: 0,
          x: 1000, // Outside page width
          y: 200,
          width: 150,
          height: 30,
        })
      ).rejects.toThrow('Field validation failed');
    });

    it('should throw error for field below minimum size', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockDocument] });

      await expect(
        fieldService.createField({
          document_id: mockDocumentId,
          type: 'signature',
          page: 0,
          x: 100,
          y: 200,
          width: 10, // Too small for signature
          height: 10,
        })
      ).rejects.toThrow('minimum size requirements');
    });

    it('should create field with calculation config', async () => {
      const calculationConfig = {
        formula: 'sum' as const,
        fields: ['field-1', 'field-2'],
        precision: 2,
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockDocument] })
        .mockResolvedValueOnce({
          rows: [{
            ...mockFieldRow,
            calculation: calculationConfig,
          }],
        });

      const result = await fieldService.createField({
        document_id: mockDocumentId,
        type: 'text',
        page: 0,
        x: 100,
        y: 200,
        width: 150,
        height: 30,
        calculation: calculationConfig,
      });

      expect(result.calculation).toEqual(calculationConfig);
    });

    it('should create field with visibility rules', async () => {
      const visibilityRules = {
        operator: 'and' as const,
        conditions: [{
          fieldId: 'other-field',
          comparison: 'not_empty' as const,
        }],
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockDocument] })
        .mockResolvedValueOnce({
          rows: [{
            ...mockFieldRow,
            visibility_rules: visibilityRules,
          }],
        });

      const result = await fieldService.createField({
        document_id: mockDocumentId,
        type: 'text',
        page: 0,
        x: 100,
        y: 200,
        width: 150,
        height: 30,
        visibility_rules: visibilityRules,
      });

      expect(result.visibility_rules).toEqual(visibilityRules);
    });
  });

  describe('getFieldsByDocumentId', () => {
    it('should return all fields for a document', async () => {
      const mockFields = [
        { ...mockFieldRow, id: 'field-1' },
        { ...mockFieldRow, id: 'field-2', y: 300 },
        { ...mockFieldRow, id: 'field-3', y: 400 },
      ];

      mockPool.query.mockResolvedValueOnce({ rows: mockFields });

      const results = await fieldService.getFieldsByDocumentId(mockDocumentId);

      expect(results).toHaveLength(3);
      expect(results[0]).toBeInstanceOf(Field);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM fields WHERE document_id'),
        [mockDocumentId]
      );
    });

    it('should return empty array for document with no fields', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const results = await fieldService.getFieldsByDocumentId(mockDocumentId);

      expect(results).toHaveLength(0);
    });
  });

  describe('getFieldById', () => {
    it('should return field by ID', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockFieldRow] });

      const result = await fieldService.getFieldById(mockFieldId);

      expect(result).toBeInstanceOf(Field);
      expect(result?.id).toBe(mockFieldId);
    });

    it('should return null for non-existent field', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await fieldService.getFieldById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('updateField', () => {
    it('should update field position', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [mockFieldRow] }) // Get existing field
        .mockResolvedValueOnce({ rows: [mockDocument] }) // Get document
        .mockResolvedValueOnce({
          rows: [{ ...mockFieldRow, x: 150, y: 250 }],
        }); // Update

      const result = await fieldService.updateField(mockFieldId, {
        x: 150,
        y: 250,
      });

      expect(result.x).toBe(150);
      expect(result.y).toBe(250);
    });

    it('should update field required property', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [mockFieldRow] })
        .mockResolvedValueOnce({
          rows: [{ ...mockFieldRow, required: false }],
        });

      const result = await fieldService.updateField(mockFieldId, {
        required: false,
      });

      expect(result.required).toBe(false);
    });

    it('should throw error for non-existent field', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        fieldService.updateField('non-existent', { required: true })
      ).rejects.toThrow('Field not found');
    });

    it('should update calculation config', async () => {
      const newCalculation = {
        formula: 'average' as const,
        fields: ['f1', 'f2', 'f3'],
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockFieldRow] })
        .mockResolvedValueOnce({
          rows: [{ ...mockFieldRow, calculation: newCalculation }],
        });

      const result = await fieldService.updateField(mockFieldId, {
        calculation: newCalculation,
      });

      expect(result.calculation).toEqual(newCalculation);
    });

    it('should clear calculation when set to null', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            ...mockFieldRow,
            calculation: { formula: 'sum', fields: ['f1'] },
          }],
        })
        .mockResolvedValueOnce({
          rows: [{ ...mockFieldRow, calculation: null }],
        });

      const result = await fieldService.updateField(mockFieldId, {
        calculation: null,
      });

      expect(result.calculation).toBeNull();
    });

    it('should return existing field if no updates provided', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockFieldRow] });

      const result = await fieldService.updateField(mockFieldId, {});

      expect(result.id).toBe(mockFieldId);
      // Should not have made an UPDATE query
      expect(mockPool.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('deleteField', () => {
    it('should delete field and return true', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });

      const result = await fieldService.deleteField(mockFieldId);

      expect(result).toBe(true);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM fields'),
        [mockFieldId]
      );
    });

    it('should return false for non-existent field', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 0 });

      const result = await fieldService.deleteField('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('getFieldsBySignerEmail', () => {
    it('should return fields assigned to signer', async () => {
      const signerEmail = 'signer@example.com';
      const mockSignerFields = [
        { ...mockFieldRow, id: 'field-1' },
        { ...mockFieldRow, id: 'field-2', y: 300 },
      ];

      mockPool.query.mockResolvedValueOnce({ rows: mockSignerFields });

      const results = await fieldService.getFieldsBySignerEmail(
        mockDocumentId,
        signerEmail
      );

      expect(results).toHaveLength(2);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('signer_email'),
        [mockDocumentId, signerEmail]
      );
    });
  });

  describe('validateAllFieldsForDocument', () => {
    it('should pass validation for valid fields with signers', async () => {
      const validFields = [
        { ...mockFieldRow, id: 'field-1', signer_email: 'signer1@example.com' },
        { ...mockFieldRow, id: 'field-2', signer_email: 'signer2@example.com', y: 300 },
      ];

      mockPool.query
        .mockResolvedValueOnce({ rows: validFields }) // getFieldsByDocumentId
        .mockResolvedValueOnce({ rows: [mockDocument] }); // Get document

      const result = await fieldService.validateAllFieldsForDocument(mockDocumentId);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation for document with no fields', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await fieldService.validateAllFieldsForDocument(mockDocumentId);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Document must have at least one field');
    });

    it('should fail validation for fields without signers', async () => {
      const fieldsWithoutSigners = [
        { ...mockFieldRow, id: 'field-1', signer_email: null },
        { ...mockFieldRow, id: 'field-2', signer_email: null, y: 300 },
      ];

      mockPool.query
        .mockResolvedValueOnce({ rows: fieldsWithoutSigners })
        .mockResolvedValueOnce({ rows: [mockDocument] });

      const result = await fieldService.validateAllFieldsForDocument(mockDocumentId);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('do not have assigned signers'))).toBe(true);
    });

    it('should fail validation for non-existent document', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [mockFieldRow] }) // Some fields exist
        .mockResolvedValueOnce({ rows: [] }); // Document not found

      const result = await fieldService.validateAllFieldsForDocument(mockDocumentId);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Document not found');
    });
  });

  describe('bulkUpsertFields', () => {
    it('should create new fields in transaction', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // COMMIT

      // Mock the actual createField calls (through pool.query in FieldService)
      mockPool.query
        .mockResolvedValueOnce({ rows: [mockDocument] })
        .mockResolvedValueOnce({ rows: [{ ...mockFieldRow, id: 'new-field-1' }] })
        .mockResolvedValueOnce({ rows: [mockDocument] })
        .mockResolvedValueOnce({ rows: [{ ...mockFieldRow, id: 'new-field-2' }] });

      const fieldsToCreate = [
        {
          document_id: mockDocumentId,
          type: 'text' as const,
          page: 0,
          x: 100,
          y: 200,
          width: 150,
          height: 30,
        },
        {
          document_id: mockDocumentId,
          type: 'text' as const,
          page: 0,
          x: 100,
          y: 300,
          width: 150,
          height: 30,
        },
      ];

      const results = await fieldService.bulkUpsertFields(mockDocumentId, fieldsToCreate);

      expect(results).toHaveLength(2);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should rollback transaction on error', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}); // ROLLBACK

      // First field creation succeeds, second fails
      mockPool.query
        .mockResolvedValueOnce({ rows: [mockDocument] })
        .mockResolvedValueOnce({ rows: [{ ...mockFieldRow, id: 'new-field-1' }] })
        .mockResolvedValueOnce({ rows: [] }); // Document not found for second field

      const fieldsToCreate = [
        {
          document_id: mockDocumentId,
          type: 'text' as const,
          page: 0,
          x: 100,
          y: 200,
          width: 150,
          height: 30,
        },
        {
          document_id: 'non-existent',
          type: 'text' as const,
          page: 0,
          x: 100,
          y: 300,
          width: 150,
          height: 30,
        },
      ];

      await expect(
        fieldService.bulkUpsertFields(mockDocumentId, fieldsToCreate)
      ).rejects.toThrow('Document not found');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });
});
