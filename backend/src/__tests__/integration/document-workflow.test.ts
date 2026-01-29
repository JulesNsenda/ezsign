import { Document, DocumentData, DocumentStatus } from '@/models/Document';
import { Signer, SignerData } from '@/models/Signer';
import { Field, FieldType } from '@/models/Field';

/**
 * Integration tests for document workflow
 * Tests the complete document lifecycle from creation to completion
 */
describe('Document Workflow Integration Tests', () => {
  const testUserId = 'user-123';
  const testDocumentId = 'doc-456';

  const createDocumentData = (status: DocumentStatus = 'draft'): DocumentData => ({
    id: testDocumentId,
    user_id: testUserId,
    team_id: null,
    title: 'Test Contract',
    original_filename: 'contract.pdf',
    file_path: 'documents/user-123/contract.pdf',
    file_size: 1024,
    mime_type: 'application/pdf',
    page_count: 5,
    status,
    workflow_type: 'parallel',
    completed_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    thumbnail_path: null,
    thumbnail_generated_at: null,
    is_optimized: false,
    original_file_size: null,
    optimized_at: null,
    expires_at: null,
    reminder_settings: { enabled: true, intervals: [1, 3, 7] },
  });

  const createSignerData = (
    index: number,
    status: 'pending' | 'signed' | 'declined' = 'pending'
  ): SignerData => ({
    id: `signer-${index}`,
    document_id: testDocumentId,
    email: `signer${index}@example.com`,
    name: `Test Signer ${index}`,
    signing_order: index,
    status,
    access_token: `token-${index}`,
    signed_at: status === 'signed' ? new Date() : null,
    ip_address: null,
    user_agent: null,
    last_reminder_sent_at: null,
    reminder_count: 0,
    created_at: new Date(),
    updated_at: new Date(),
  });

  describe('Document Creation', () => {
    it('should create a new document in draft status', () => {
      const document = new Document(createDocumentData('draft'));

      expect(document).toBeDefined();
      expect(document.status).toBe('draft');
      expect(document.title).toBe('Test Contract');
      expect(document.isDraft()).toBe(true);
    });

    it('should validate document is PDF', () => {
      const document = new Document(createDocumentData());

      expect(document.isPdf()).toBe(true);
      expect(document.mime_type).toBe('application/pdf');
    });

    it('should format file size correctly', () => {
      const document = new Document(createDocumentData());

      const formatted = document.getFormattedFileSize();
      expect(formatted).toBe('1 KB');
    });
  });

  describe('Document Status Transitions', () => {
    it('should validate draft can be sent', () => {
      const draftDoc = new Document(createDocumentData('draft'));

      expect(draftDoc.canSend()).toBe(true);
      expect(draftDoc.canEdit()).toBe(true);
    });

    it('should validate pending cannot be edited', () => {
      const pendingDoc = new Document(createDocumentData('pending'));

      expect(pendingDoc.canSend()).toBe(false);
      expect(pendingDoc.canEdit()).toBe(false);
      expect(pendingDoc.canCancel()).toBe(true);
    });

    it('should validate completed cannot be modified', () => {
      const completedData = createDocumentData('completed');
      completedData.completed_at = new Date();
      const completedDoc = new Document(completedData);

      expect(completedDoc.canSend()).toBe(false);
      expect(completedDoc.canEdit()).toBe(false);
      expect(completedDoc.canCancel()).toBe(false);
    });

    it('should mark document as pending', () => {
      const document = new Document(createDocumentData('draft'));

      document.markAsPending();

      expect(document.status).toBe('pending');
      expect(document.isPending()).toBe(true);
    });

    it('should mark document as completed', () => {
      const document = new Document(createDocumentData('pending'));

      document.markAsCompleted();

      expect(document.status).toBe('completed');
      expect(document.isCompleted()).toBe(true);
      expect(document.completed_at).toBeDefined();
    });

    it('should mark document as cancelled', () => {
      const document = new Document(createDocumentData('pending'));

      document.markAsCancelled();

      expect(document.status).toBe('cancelled');
      expect(document.isCancelled()).toBe(true);
    });

    it('should prevent invalid status transitions', () => {
      const completedDoc = new Document(createDocumentData('completed'));

      expect(() => completedDoc.markAsPending()).toThrow();
    });

    it('should validate status transition rules', () => {
      expect(Document.isValidStatusTransition('draft', 'pending')).toBe(true);
      expect(Document.isValidStatusTransition('pending', 'completed')).toBe(true);
      expect(Document.isValidStatusTransition('pending', 'cancelled')).toBe(true);
      expect(Document.isValidStatusTransition('completed', 'pending')).toBe(false);
      expect(Document.isValidStatusTransition('cancelled', 'draft')).toBe(false);
    });
  });

  describe('Workflow Types', () => {
    it('should validate workflow types', () => {
      expect(Document.isValidWorkflowType('single')).toBe(true);
      expect(Document.isValidWorkflowType('sequential')).toBe(true);
      expect(Document.isValidWorkflowType('parallel')).toBe(true);
      expect(Document.isValidWorkflowType('invalid')).toBe(false);
    });

    it('should describe workflow correctly', () => {
      const parallelDoc = new Document(createDocumentData());
      expect(parallelDoc.getWorkflowDescription()).toContain('Parallel');

      const sequentialData = createDocumentData();
      sequentialData.workflow_type = 'sequential';
      const sequentialDoc = new Document(sequentialData);
      expect(sequentialDoc.getWorkflowDescription()).toContain('Sequential');
    });
  });

  describe('Field Management', () => {
    it('should validate field types', () => {
      const validTypes: FieldType[] = [
        'signature',
        'initials',
        'date',
        'text',
        'checkbox',
        'radio',
        'dropdown',
        'textarea'
      ];

      validTypes.forEach(type => {
        expect(Field.isValidFieldType(type)).toBe(true);
      });

      expect(Field.isValidFieldType('invalid')).toBe(false);
    });

    it('should create signature field', () => {
      const field = new Field({
        id: 'field-1',
        document_id: testDocumentId,
        type: 'signature',
        page: 1,
        x: 100,
        y: 200,
        width: 200,
        height: 50,
        required: true,
        signer_email: 'signer@example.com',
        properties: null,
        visibility_rules: null,
        calculation: null,
        created_at: new Date(),
      });

      expect(field.isSignature()).toBe(true);
      expect(field.requiresSignature()).toBe(true);
      expect(field.hasAssignedSigner()).toBe(true);
    });

    it('should get minimum dimensions for field type', () => {
      const signatureDimensions = Field.getMinimumDimensions('signature');
      expect(signatureDimensions.width).toBeGreaterThan(0);
      expect(signatureDimensions.height).toBeGreaterThan(0);

      const checkboxDimensions = Field.getMinimumDimensions('checkbox');
      expect(checkboxDimensions.width).toBeLessThan(signatureDimensions.width);
    });

    it('should get default properties for field type', () => {
      const signatureProps = Field.getDefaultProperties('signature');
      expect(signatureProps.signatureColor).toBeDefined();

      const textProps = Field.getDefaultProperties('text');
      expect(textProps.fontSize).toBeDefined();
      expect(textProps.placeholder).toBeDefined();
    });
  });

  describe('Signer Management', () => {
    it('should create signer with pending status', () => {
      const signer = new Signer(createSignerData(1));

      expect(signer.email).toBe('signer1@example.com');
      expect(signer.isPending()).toBe(true);
      expect(signer.access_token).toBeDefined();
    });

    it('should validate signer email format', () => {
      expect(Signer.isValidEmail('valid@example.com')).toBe(true);
      expect(Signer.isValidEmail('invalid-email')).toBe(false);
      expect(Signer.isValidEmail('')).toBe(false);
    });

    it('should track signer status', () => {
      const signer = new Signer(createSignerData(1));

      expect(signer.isPending()).toBe(true);
      expect(signer.hasSigned()).toBe(false);
      expect(signer.hasDeclined()).toBe(false);

      signer.markAsSigned('192.168.1.1', 'Mozilla/5.0');

      expect(signer.isPending()).toBe(false);
      expect(signer.hasSigned()).toBe(true);
      expect(signer.signed_at).toBeDefined();
    });
  });

  describe('Signing Flow', () => {
    it('should validate signing order in sequential workflow', () => {
      const signers = [
        new Signer(createSignerData(0, 'signed')),
        new Signer(createSignerData(1, 'pending')),
        new Signer(createSignerData(2, 'pending')),
      ];

      // Second signer can sign (first is done)
      expect(Signer.canSignInSequence(signers[1]!, signers)).toBe(true);

      // Third signer cannot sign yet
      expect(Signer.canSignInSequence(signers[2]!, signers)).toBe(false);
    });

    it('should detect document completion', () => {
      const signers = [
        new Signer(createSignerData(0, 'signed')),
        new Signer(createSignerData(1, 'signed')),
      ];

      const allSigned = signers.every(s => s.hasSigned());
      expect(allSigned).toBe(true);
    });

    it('should detect incomplete signing', () => {
      const signers = [
        new Signer(createSignerData(0, 'signed')),
        new Signer(createSignerData(1, 'pending')),
      ];

      const allSigned = signers.every(s => s.hasSigned());
      expect(allSigned).toBe(false);

      const pendingSigners = signers.filter(s => s.isPending());
      expect(pendingSigners).toHaveLength(1);
    });
  });

  describe('Document Expiration', () => {
    it('should detect document with expiration', () => {
      const docData = createDocumentData();
      docData.expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      const document = new Document(docData);

      expect(document.hasExpiration()).toBe(true);
      expect(document.isExpired()).toBe(false);
    });

    it('should detect expired document', () => {
      const docData = createDocumentData();
      docData.expires_at = new Date(Date.now() - 24 * 60 * 60 * 1000); // Yesterday
      const document = new Document(docData);

      expect(document.isExpired()).toBe(true);
    });

    it('should calculate days until expiration', () => {
      const docData = createDocumentData();
      docData.expires_at = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days
      const document = new Document(docData);

      const days = document.getDaysUntilExpiration();
      expect(days).toBeGreaterThanOrEqual(2);
      expect(days).toBeLessThanOrEqual(4);
    });
  });

  describe('Reminder Settings', () => {
    it('should have default reminder settings', () => {
      const document = new Document(createDocumentData());

      expect(document.hasRemindersEnabled()).toBe(true);
      expect(document.reminder_settings.intervals).toEqual([1, 3, 7]);
    });

    it('should detect disabled reminders', () => {
      const docData = createDocumentData();
      docData.reminder_settings = { enabled: false, intervals: [] };
      const document = new Document(docData);

      expect(document.hasRemindersEnabled()).toBe(false);
    });
  });

  describe('Thumbnail and Optimization', () => {
    it('should track thumbnail status', () => {
      const document = new Document(createDocumentData());
      expect(document.hasThumbnail()).toBe(false);

      const withThumbnailData = createDocumentData();
      withThumbnailData.thumbnail_path = 'thumbnails/doc-456.png';
      withThumbnailData.thumbnail_generated_at = new Date();
      const withThumbnail = new Document(withThumbnailData);

      expect(withThumbnail.hasThumbnail()).toBe(true);
    });

    it('should calculate optimization savings', () => {
      const docData = createDocumentData();
      docData.is_optimized = true;
      docData.original_file_size = 2048;
      docData.file_size = 1024;
      const document = new Document(docData);

      expect(document.getOptimizationSavings()).toBe(1024);
      expect(document.getOptimizationPercentage()).toBe(50);
    });
  });

  describe('Document Serialization', () => {
    it('should convert to JSON', () => {
      const document = new Document(createDocumentData());
      const json = document.toJSON();

      expect(json.id).toBe(testDocumentId);
      expect(json.title).toBe('Test Contract');
      expect(json.status).toBe('draft');
    });

    it('should convert to public JSON without file paths', () => {
      const document = new Document(createDocumentData());
      const publicJson = document.toPublicJSON();

      expect(publicJson.id).toBe(testDocumentId);
      expect((publicJson as any).file_path).toBeUndefined();
      expect((publicJson as any).thumbnail_path).toBeUndefined();
      expect(publicJson.file_size_formatted).toBeDefined();
    });
  });
});
