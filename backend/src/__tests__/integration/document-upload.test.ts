import { Pool } from 'pg';
import { DocumentService } from '@/services/documentService';
import { createStorageService } from '@/services/storageService';
import { LocalStorageAdapter } from '@/adapters/LocalStorageAdapter';
import { Document } from '@/models/Document';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PDFDocument } from 'pdf-lib';

describe('Document Upload and Retrieval Integration Tests', () => {
  let pool: Pool;
  let documentService: DocumentService;
  let testUserId: string;
  let testTeamId: string;
  let testPdfBuffer: Buffer;
  let cleanupDocuments: string[] = [];

  beforeAll(async () => {
    // Set up database connection
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    // Set up storage service
    const storagePath = path.join(process.cwd(), 'storage-test');
    const storageAdapter = new LocalStorageAdapter(storagePath);
    const storageService = createStorageService(storageAdapter);

    documentService = new DocumentService(pool, storageService);

    // Create test PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 800]);
    page.drawText('Test Document for Integration Tests', {
      x: 50,
      y: 750,
      size: 20,
    });
    testPdfBuffer = Buffer.from(await pdfDoc.save());

    // Create test user
    const userResult = await pool.query(
      `INSERT INTO users (email, password_hash, role, email_verified)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      ['test-upload@example.com', 'hashed_password', 'user', true]
    );
    testUserId = userResult.rows[0].id;

    // Create test team
    const teamResult = await pool.query(
      `INSERT INTO teams (name, owner_id)
       VALUES ($1, $2)
       RETURNING id`,
      ['Test Upload Team', testUserId]
    );
    testTeamId = teamResult.rows[0].id;

    // Add user to team
    await pool.query(
      `INSERT INTO team_members (team_id, user_id, role)
       VALUES ($1, $2, $3)`,
      [testTeamId, testUserId, 'admin']
    );
  });

  afterAll(async () => {
    // Clean up documents
    for (const docId of cleanupDocuments) {
      try {
        await documentService.deleteDocument(docId, testUserId);
      } catch (error) {
        // Ignore cleanup errors
      }
    }

    // Clean up test data
    await pool.query('DELETE FROM team_members WHERE user_id = $1', [testUserId]);
    await pool.query('DELETE FROM teams WHERE owner_id = $1', [testUserId]);
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);

    await pool.end();

    // Clean up test storage
    const storagePath = path.join(process.cwd(), 'storage-test');
    try {
      await fs.rm(storagePath, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Document Upload', () => {
    it('should upload a PDF document successfully', async () => {
      const document = await documentService.createDocument({
        userId: testUserId,
        title: 'Integration Test Document',
        fileBuffer: testPdfBuffer,
        originalFilename: 'test-document.pdf',
      });

      cleanupDocuments.push(document.id);

      expect(document).toBeDefined();
      expect(document.id).toBeDefined();
      expect(document.title).toBe('Integration Test Document');
      expect(document.original_filename).toBe('test-document.pdf');
      expect(document.status).toBe('draft');
      expect(document.user_id).toBe(testUserId);
      expect(document.page_count).toBe(1);
    });

    it('should upload a document with team assignment', async () => {
      const document = await documentService.createDocument({
        userId: testUserId,
        teamId: testTeamId,
        title: 'Team Document',
        fileBuffer: testPdfBuffer,
        originalFilename: 'team-document.pdf',
      });

      cleanupDocuments.push(document.id);

      expect(document).toBeDefined();
      expect(document.team_id).toBe(testTeamId);
    });

    it('should reject upload with invalid PDF', async () => {
      const invalidBuffer = Buffer.from('This is not a PDF');

      await expect(
        documentService.createDocument({
          userId: testUserId,
          title: 'Invalid Document',
          fileBuffer: invalidBuffer,
          originalFilename: 'invalid.pdf',
        })
      ).rejects.toThrow();
    });

    it('should reject upload with empty title', async () => {
      await expect(
        documentService.createDocument({
          userId: testUserId,
          title: '   ',
          fileBuffer: testPdfBuffer,
          originalFilename: 'test.pdf',
        })
      ).rejects.toThrow();
    });
  });

  describe('Document Retrieval', () => {
    let uploadedDocumentId: string;

    beforeAll(async () => {
      const document = await documentService.createDocument({
        userId: testUserId,
        title: 'Document for Retrieval Tests',
        fileBuffer: testPdfBuffer,
        originalFilename: 'retrieval-test.pdf',
      });
      uploadedDocumentId = document.id;
      cleanupDocuments.push(uploadedDocumentId);
    });

    it('should retrieve document by ID', async () => {
      const document = await documentService.findById(uploadedDocumentId, testUserId);

      expect(document).toBeDefined();
      expect(document?.id).toBe(uploadedDocumentId);
      expect(document?.title).toBe('Document for Retrieval Tests');
    });

    it('should retrieve document file content', async () => {
      const fileBuffer = await documentService.getDocumentFile(
        uploadedDocumentId,
        testUserId
      );

      expect(fileBuffer).toBeDefined();
      expect(Buffer.isBuffer(fileBuffer)).toBe(true);
      expect(fileBuffer!.length).toBeGreaterThan(0);
    });

    it('should return null for non-existent document', async () => {
      const document = await documentService.findById(
        '00000000-0000-0000-0000-000000000000',
        testUserId
      );

      expect(document).toBeNull();
    });

    it('should return null when user lacks access', async () => {
      // Create another user
      const otherUserResult = await pool.query(
        `INSERT INTO users (email, password_hash, role, email_verified)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        ['other-user@example.com', 'hashed_password', 'user', true]
      );
      const otherUserId = otherUserResult.rows[0].id;

      try {
        const document = await documentService.findById(uploadedDocumentId, otherUserId);
        expect(document).toBeNull();
      } finally {
        // Clean up other user
        await pool.query('DELETE FROM users WHERE id = $1', [otherUserId]);
      }
    });
  });

  describe('Document Listing', () => {
    beforeAll(async () => {
      // Upload multiple documents for listing tests
      for (let i = 1; i <= 5; i++) {
        const doc = await documentService.createDocument({
          userId: testUserId,
          title: `List Test Document ${i}`,
          fileBuffer: testPdfBuffer,
          originalFilename: `list-test-${i}.pdf`,
        });
        cleanupDocuments.push(doc.id);
      }
    });

    it('should list user documents with pagination', async () => {
      const result = await documentService.findDocuments({
        userId: testUserId,
        page: 1,
        limit: 3,
      });

      expect(result.documents).toBeDefined();
      expect(result.documents.length).toBeLessThanOrEqual(3);
      expect(result.total).toBeGreaterThanOrEqual(5);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(3);
      expect(result.totalPages).toBeGreaterThanOrEqual(2);
    });

    it('should filter documents by status', async () => {
      const result = await documentService.findDocuments({
        userId: testUserId,
        status: 'draft',
      });

      expect(result.documents).toBeDefined();
      result.documents.forEach((doc: Document) => {
        expect(doc.status).toBe('draft');
      });
    });

    it('should sort documents by creation date', async () => {
      const result = await documentService.findDocuments({
        userId: testUserId,
        sortBy: 'created_at',
        sortOrder: 'desc',
      });

      expect(result.documents).toBeDefined();
      if (result.documents.length > 1) {
        for (let i = 0; i < result.documents.length - 1; i++) {
          const currentDoc = result.documents[i];
          const nextDoc = result.documents[i + 1];
          if (currentDoc && nextDoc) {
            const current = new Date(currentDoc.created_at);
            const next = new Date(nextDoc.created_at);
            expect(current.getTime()).toBeGreaterThanOrEqual(next.getTime());
          }
        }
      }
    });
  });

  describe('Document Deletion', () => {
    it('should delete document successfully', async () => {
      // Create a document to delete
      const document = await documentService.createDocument({
        userId: testUserId,
        title: 'Document to Delete',
        fileBuffer: testPdfBuffer,
        originalFilename: 'delete-test.pdf',
      });

      // Delete the document
      const deleted = await documentService.deleteDocument(document.id, testUserId);
      expect(deleted).toBe(true);

      // Verify document is deleted
      const retrieved = await documentService.findById(document.id, testUserId);
      expect(retrieved).toBeNull();
    });

    it('should return false when deleting non-existent document', async () => {
      const deleted = await documentService.deleteDocument(
        '00000000-0000-0000-0000-000000000000',
        testUserId
      );
      expect(deleted).toBe(false);
    });
  });

  describe('Document Access Control', () => {
    let teamDocument: string;
    let teamMemberUserId: string;

    beforeAll(async () => {
      // Create team document
      const doc = await documentService.createDocument({
        userId: testUserId,
        teamId: testTeamId,
        title: 'Team Access Document',
        fileBuffer: testPdfBuffer,
        originalFilename: 'team-access.pdf',
      });
      teamDocument = doc.id;
      cleanupDocuments.push(teamDocument);

      // Create team member user
      const userResult = await pool.query(
        `INSERT INTO users (email, password_hash, role, email_verified)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        ['team-member@example.com', 'hashed_password', 'user', true]
      );
      teamMemberUserId = userResult.rows[0].id;

      // Add to team
      await pool.query(
        `INSERT INTO team_members (team_id, user_id, role)
         VALUES ($1, $2, $3)`,
        [testTeamId, teamMemberUserId, 'member']
      );
    });

    afterAll(async () => {
      // Clean up team member
      await pool.query('DELETE FROM team_members WHERE user_id = $1', [
        teamMemberUserId,
      ]);
      await pool.query('DELETE FROM users WHERE id = $1', [teamMemberUserId]);
    });

    it('should allow team member to access team document', async () => {
      const canAccess = await documentService.canAccessDocument(
        teamDocument,
        teamMemberUserId
      );
      expect(canAccess).toBe(true);
    });

    it('should allow owner to access document', async () => {
      const canAccess = await documentService.canAccessDocument(
        teamDocument,
        testUserId
      );
      expect(canAccess).toBe(true);
    });

    it('should deny access to non-team member', async () => {
      // Create non-team user
      const userResult = await pool.query(
        `INSERT INTO users (email, password_hash, role, email_verified)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        ['non-team@example.com', 'hashed_password', 'user', true]
      );
      const nonTeamUserId = userResult.rows[0].id;

      try {
        const canAccess = await documentService.canAccessDocument(
          teamDocument,
          nonTeamUserId
        );
        expect(canAccess).toBe(false);
      } finally {
        await pool.query('DELETE FROM users WHERE id = $1', [nonTeamUserId]);
      }
    });
  });
});
