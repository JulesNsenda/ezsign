import { Request, Response } from 'express';
import { Pool } from 'pg';
import { Document } from '@/models/Document';
import { Signer } from '@/models/Signer';
import { Signature } from '@/models/Signature';
import { Field } from '@/models/Field';
import { EmailService } from '@/services/emailService';
import { PdfService } from '@/services/pdfService';
import { StorageService } from '@/services/storageService';

export class SigningController {
  private pool: Pool;
  private emailService: EmailService;
  private _pdfService: PdfService;
  private _storageService: StorageService;

  constructor(
    pool: Pool,
    emailService: EmailService,
    pdfService: PdfService,
    storageService: StorageService
  ) {
    this.pool = pool;
    this.emailService = emailService;
    this._pdfService = pdfService;
    this._storageService = storageService;
  }

  /**
   * Send document for signature
   * POST /api/documents/:id/send
   */
  sendForSignature = async (req: Request, res: Response): Promise<void> => {
    console.log('sendForSignature called for document:', req.params.id);
    console.log('Request body:', req.body);
    try {
      const userId = (req as any).user?.userId; // Fixed: should be userId not id
      if (!userId) {
        console.log('No userId found, returning 401');
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const documentId = req.params.id as string;
      const message = req.body?.message;
      console.log('Processing send for document:', documentId, 'by user:', userId);

      // Get document
      const docResult = await this.pool.query(
        'SELECT * FROM documents WHERE id = $1',
        [documentId]
      );

      if (docResult.rows.length === 0) {
        res.status(404).json({ success: false, error: 'Document not found' });
        return;
      }

      const document = new Document(this.mapRowToDocumentData(docResult.rows[0]));
      console.log('Document loaded, status:', document.status);

      // Check if user owns the document
      if (document.user_id !== userId) {
        console.log('Access denied - user does not own document');
        res.status(403).json({ success: false, error: 'Access denied' });
        return;
      }

      // Check if document can be sent
      if (!document.canSend()) {
        console.log('Document cannot be sent, status:', document.status);
        res.status(400).json({
          success: false,
          error: `Document cannot be sent in ${document.status} status`,
        });
        return;
      }
      console.log('Document can be sent');

      // Validate all fields are assigned to signers
      const fieldsResult = await this.pool.query(
        'SELECT * FROM fields WHERE document_id = $1',
        [documentId]
      );
      console.log('Fields found:', fieldsResult.rows.length);

      if (fieldsResult.rows.length === 0) {
        console.log('No fields found');
        res.status(400).json({
          success: false,
          error: 'Document must have at least one field',
        });
        return;
      }

      const unassignedFields = fieldsResult.rows.filter(
        (f) => !f.signer_email || f.signer_email.trim() === ''
      );
      console.log('Unassigned fields:', unassignedFields.length);

      if (unassignedFields.length > 0) {
        console.log('Some fields are unassigned');
        res.status(400).json({
          success: false,
          error: 'All fields must be assigned to signers',
        });
        return;
      }

      // Get all signers
      const signersResult = await this.pool.query(
        'SELECT * FROM signers WHERE document_id = $1',
        [documentId]
      );
      console.log('Signers found:', signersResult.rows.length);

      if (signersResult.rows.length === 0) {
        console.log('No signers found');
        res.status(400).json({
          success: false,
          error: 'Document must have at least one signer',
        });
        return;
      }
      console.log('All validations passed, proceeding to send');

      // Update document status to pending
      await this.pool.query(
        'UPDATE documents SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['pending', documentId]
      );

      // Get user info for sender name
      const userResult = await this.pool.query(
        'SELECT email FROM users WHERE id = $1',
        [userId]
      );
      const senderName = userResult.rows[0]?.email || 'Someone';

      // Send signing requests to all signers (or first signer if sequential)
      const signers = signersResult.rows.map((row) => new Signer(this.mapRowToSignerData(row)));

      if (document.workflow_type === 'sequential') {
        // For sequential workflow, only send to first signer
        const firstSigner = signers.find((s) => s.signing_order === 0);
        if (firstSigner) {
          await this.emailService.sendSigningRequest({
            recipientEmail: firstSigner.email,
            recipientName: firstSigner.name,
            documentTitle: document.title,
            senderName,
            signingUrl: this.emailService.generateSigningUrl(firstSigner.access_token),
            message,
          });
        }
      } else {
        // For parallel or single workflow, send to all signers
        for (const signer of signers) {
          await this.emailService.sendSigningRequest({
            recipientEmail: signer.email,
            recipientName: signer.name,
            documentTitle: document.title,
            senderName,
            signingUrl: this.emailService.generateSigningUrl(signer.access_token),
            message,
          });
        }
      }

      res.status(200).json({
        success: true,
        message: 'Document sent for signature',
        data: {
          document_id: documentId,
          status: 'pending',
          signers_notified: document.workflow_type === 'sequential' ? 1 : signers.length,
        },
      });
    } catch (error) {
      console.error('Error sending document for signature:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({ success: false, error: message });
    }
  };

  /**
   * Get document for signing (by access token)
   * GET /api/signing/:token
   */
  getDocumentBySigningToken = async (req: Request, res: Response): Promise<void> => {
    try {
      const token = req.params.token as string;

      // Find signer by access token
      const signerResult = await this.pool.query(
        'SELECT * FROM signers WHERE access_token = $1',
        [token]
      );

      if (signerResult.rows.length === 0) {
        res.status(404).json({ success: false, error: 'Invalid signing link' });
        return;
      }

      const signer = new Signer(this.mapRowToSignerData(signerResult.rows[0]));

      // Check if signer already signed
      if (signer.status === 'signed') {
        res.status(400).json({
          success: false,
          error: 'Document already signed by this signer',
        });
        return;
      }

      // Get document
      const docResult = await this.pool.query(
        'SELECT * FROM documents WHERE id = $1',
        [signer.document_id]
      );

      if (docResult.rows.length === 0) {
        res.status(404).json({ success: false, error: 'Document not found' });
        return;
      }

      const document = new Document(this.mapRowToDocumentData(docResult.rows[0]));

      // Check if document is in pending status
      if (document.status !== 'pending') {
        res.status(400).json({
          success: false,
          error: `Document is ${document.status} and cannot be signed`,
        });
        return;
      }

      // For sequential workflow, check if it's this signer's turn
      if (document.workflow_type === 'sequential') {
        const allSigners = await this.pool.query(
          'SELECT * FROM signers WHERE document_id = $1 ORDER BY signing_order',
          [signer.document_id]
        );

        const signersList = allSigners.rows.map((row) => new Signer(this.mapRowToSignerData(row)));
        const canSign = Signer.canSignInSequence(signer, signersList);

        if (!canSign) {
          res.status(400).json({
            success: false,
            error: 'It is not your turn to sign yet (sequential workflow)',
          });
          return;
        }
      }

      // Get fields assigned to this signer
      const fieldsResult = await this.pool.query(
        'SELECT * FROM fields WHERE document_id = $1 AND signer_email = $2',
        [signer.document_id, signer.email]
      );

      const fields = fieldsResult.rows.map((row) => new Field(this.mapRowToFieldData(row)));

      // Get existing signatures for this signer
      const signaturesResult = await this.pool.query(
        'SELECT * FROM signatures WHERE signer_id = $1',
        [signer.id]
      );

      res.status(200).json({
        document: document.toPublicJSON(),
        signer: signer.toPublicJSON(),
        fields: fields.map((f) => f.toPublicJSON()),
        signatures: signaturesResult.rows,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({ success: false, error: message });
    }
  };

  /**
   * Submit signature
   * POST /api/signing/:token/sign
   */
  submitSignature = async (req: Request, res: Response): Promise<void> => {
    try {
      const token = req.params.token as string;
      const { signatures } = req.body; // Array of { field_id, signature_type, signature_data, text_value?, font_family? }

      if (!signatures || !Array.isArray(signatures) || signatures.length === 0) {
        res.status(400).json({
          success: false,
          error: 'Signatures array is required',
        });
        return;
      }

      // Find signer by access token
      const signerResult = await this.pool.query(
        'SELECT * FROM signers WHERE access_token = $1',
        [token]
      );

      if (signerResult.rows.length === 0) {
        res.status(404).json({ success: false, error: 'Invalid signing link' });
        return;
      }

      const signer = new Signer(this.mapRowToSignerData(signerResult.rows[0]));

      // Check if signer can sign
      if (signer.status !== 'pending') {
        res.status(400).json({
          success: false,
          error: `Signer is already ${signer.status}`,
        });
        return;
      }

      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');

        // Validate and insert signatures
        for (const sigData of signatures) {
          const signature = new Signature({
            id: '',
            signer_id: signer.id,
            field_id: sigData.field_id,
            signature_type: sigData.signature_type,
            signature_data: sigData.signature_data,
            text_value: sigData.text_value || null,
            font_family: sigData.font_family || null,
            ip_address: req.ip || null,
            user_agent: req.get('user-agent') || null,
            signed_at: new Date(),
            created_at: new Date(),
          });

          // Validate signature
          const validation = signature.validateSignatureData();
          if (!validation.valid) {
            throw new Error(`Invalid signature: ${validation.errors.join(', ')}`);
          }

          // Insert signature
          await client.query(
            `INSERT INTO signatures (signer_id, field_id, signature_type, signature_data, text_value, font_family, ip_address, user_agent)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              signer.id,
              sigData.field_id,
              sigData.signature_type,
              sigData.signature_data,
              sigData.text_value || null,
              sigData.font_family || null,
              req.ip || null,
              req.get('user-agent') || null,
            ]
          );
        }

        // Update signer status to signed
        await client.query(
          `UPDATE signers SET status = 'signed', signed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [signer.id]
        );

        // Check if all signers have signed (document completion)
        const allSignersResult = await client.query(
          'SELECT * FROM signers WHERE document_id = $1',
          [signer.document_id]
        );

        const allSigned = allSignersResult.rows.every((s) => s.status === 'signed');

        if (allSigned) {
          // All signers have signed - complete the document
          console.log('All signers have signed, applying signatures to PDF');

          // Get document for processing
          const docResult = await client.query(
            'SELECT * FROM documents WHERE id = $1',
            [signer.document_id]
          );
          const document = new Document(this.mapRowToDocumentData(docResult.rows[0]));

          // Get all signatures for this document
          const allSignaturesResult = await client.query(
            `SELECT s.*, f.page, f.x, f.y, f.width, f.height
             FROM signatures s
             JOIN fields f ON s.field_id = f.id
             WHERE f.document_id = $1`,
            [signer.document_id]
          );

          console.log('Found signatures to apply:', allSignaturesResult.rows.length);

          // Apply signatures to PDF
          try {
            // Load original PDF
            const originalPdfBuffer = await this._storageService.downloadFile(document.file_path);

            // Prepare signature fields for PDF service
            const signatureFields = allSignaturesResult.rows.map((row) => {
              console.log('Signature row:', {
                page: row.page,
                x: row.x,
                y: row.y,
                width: row.width,
                height: row.height,
                signature_data_length: row.signature_data?.length
              });

              // Database stores pages as 0-indexed (same as pdf-lib), no conversion needed
              const pageNumber = parseInt(row.page);
              console.log('Page number:', pageNumber);

              return {
                page: pageNumber,
                x: parseFloat(row.x),
                y: parseFloat(row.y),
                width: parseFloat(row.width),
                height: parseFloat(row.height),
                imageData: row.signature_data, // Base64 string from database
              };
            });

            console.log('Applying signatures to PDF...');
            // Apply all signatures to the PDF
            const signedPdfBuffer = await this._pdfService.addMultipleFields(
              originalPdfBuffer,
              { signatures: signatureFields }
            );

            console.log('Signed PDF created, size:', signedPdfBuffer.length);

            // Save the signed PDF (replace the original file)
            const storagePath = process.env.FILE_STORAGE_PATH || './storage';
            const fs = await import('fs/promises');
            const path = await import('path');
            const fullPath = path.join(storagePath, document.file_path);
            await fs.writeFile(fullPath, signedPdfBuffer);

            console.log('Signed PDF saved to:', fullPath);
          } catch (error) {
            console.error('Error applying signatures to PDF:', error);
            // Continue with document completion even if PDF signing fails
            // This ensures the workflow completes
          }

          // Update document status to completed
          await client.query(
            'UPDATE documents SET status = $1, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            ['completed', signer.document_id]
          );

          // Send completion notification to document owner
          const ownerResult = await client.query(
            'SELECT email FROM users WHERE id = $1',
            [document.user_id]
          );

          if (ownerResult.rows.length > 0) {
            const owner = ownerResult.rows[0];
            await this.emailService.sendCompletionNotification({
              recipientEmail: owner.email,
              recipientName: owner.email,
              documentTitle: document.title,
              completedAt: new Date(),
              downloadUrl: this.emailService.generateDownloadUrl(document.id),
            });
          }
        } else {
          // Check if next signer should be notified (sequential workflow)
          const docResult = await client.query(
            'SELECT * FROM documents WHERE id = $1',
            [signer.document_id]
          );
          const document = new Document(this.mapRowToDocumentData(docResult.rows[0]));

          if (document.workflow_type === 'sequential' && signer.signing_order !== null) {
            // Find next signer
            const nextSignerResult = await client.query(
              'SELECT * FROM signers WHERE document_id = $1 AND signing_order = $2',
              [signer.document_id, signer.signing_order + 1]
            );

            if (nextSignerResult.rows.length > 0) {
              const nextSigner = new Signer(this.mapRowToSignerData(nextSignerResult.rows[0]));

              // Get sender info
              const userResult = await client.query(
                'SELECT email FROM users WHERE id = $1',
                [document.user_id]
              );
              const senderName = userResult.rows[0]?.email || 'Someone';

              await this.emailService.sendSigningRequest({
                recipientEmail: nextSigner.email,
                recipientName: nextSigner.name,
                documentTitle: document.title,
                senderName,
                signingUrl: this.emailService.generateSigningUrl(nextSigner.access_token),
              });
            }
          }
        }

        await client.query('COMMIT');

        res.status(200).json({
          success: true,
          message: 'Signature submitted successfully',
          data: {
            document_completed: allSigned,
          },
        });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({ success: false, error: message });
    }
  };

  /**
   * Download document for signing (by access token)
   * GET /api/signing/:token/download
   */
  downloadDocumentByToken = async (req: Request, res: Response): Promise<void> => {
    try {
      const token = req.params.token as string;
      console.log('Download request for token:', token);

      // Find signer by access token
      const signerResult = await this.pool.query(
        'SELECT * FROM signers WHERE access_token = $1',
        [token]
      );

      if (signerResult.rows.length === 0) {
        console.log('No signer found for token');
        res.status(404).json({ success: false, error: 'Invalid signing link' });
        return;
      }

      const signer = new Signer(this.mapRowToSignerData(signerResult.rows[0]));
      console.log('Signer found:', signer.id, 'Document ID:', signer.document_id);

      // Get document
      const docResult = await this.pool.query(
        'SELECT * FROM documents WHERE id = $1',
        [signer.document_id]
      );

      if (docResult.rows.length === 0) {
        console.log('No document found for ID:', signer.document_id);
        res.status(404).json({ success: false, error: 'Document not found' });
        return;
      }

      const document = new Document(this.mapRowToDocumentData(docResult.rows[0]));
      console.log('Document found:', document.id, 'File path:', document.file_path);

      // Check if file exists
      const fileExists = await this._storageService.fileExists(document.file_path);
      if (!fileExists) {
        console.log('File not found on storage:', document.file_path);
        res.status(404).json({ error: 'Document file not found' });
        return;
      }

      // Download file buffer
      const fileBuffer = await this._storageService.downloadFile(document.file_path);
      console.log('File downloaded, size:', fileBuffer.length);

      // Set headers for file download (inline for PDF viewing in browser)
      res.setHeader('Content-Type', document.mime_type);
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${document.original_filename}"`
      );
      res.setHeader('Content-Length', fileBuffer.length.toString());

      // Send file buffer
      res.send(fileBuffer);
      console.log('File sent successfully');
    } catch (error) {
      console.error('Download error:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({ success: false, error: message });
    }
  };

  /**
   * Get signing status for a document
   * GET /api/documents/:id/status
   */
  getSigningStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId; // Fixed: should be userId not id
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const documentId = req.params.id as string;

      // Get document
      const docResult = await this.pool.query(
        'SELECT * FROM documents WHERE id = $1',
        [documentId]
      );

      if (docResult.rows.length === 0) {
        res.status(404).json({ success: false, error: 'Document not found' });
        return;
      }

      const document = new Document(this.mapRowToDocumentData(docResult.rows[0]));

      // Check access
      if (document.user_id !== userId) {
        res.status(403).json({ success: false, error: 'Access denied' });
        return;
      }

      // Get signers
      const signersResult = await this.pool.query(
        'SELECT * FROM signers WHERE document_id = $1 ORDER BY signing_order NULLS LAST, email',
        [documentId]
      );

      const signers = signersResult.rows.map((row) => {
        const signer = new Signer(this.mapRowToSignerData(row));
        return signer.toPublicJSON();
      });

      res.status(200).json({
        success: true,
        data: {
          document_status: document.status,
          workflow_type: document.workflow_type,
          signers,
          total_signers: signers.length,
          signed_count: signers.filter((s) => s.status === 'signed').length,
          pending_count: signers.filter((s) => s.status === 'pending').length,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({ success: false, error: message });
    }
  };

  // Helper methods to map database rows to model data
  private mapRowToDocumentData(row: any): any {
    return {
      id: row.id,
      user_id: row.user_id,
      team_id: row.team_id,
      title: row.title,
      original_filename: row.original_filename,
      file_path: row.file_path,
      file_size: parseInt(row.file_size),
      mime_type: row.mime_type,
      page_count: row.page_count,
      status: row.status,
      workflow_type: row.workflow_type,
      completed_at: row.completed_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private mapRowToSignerData(row: any): any {
    return {
      id: row.id,
      document_id: row.document_id,
      email: row.email,
      name: row.name,
      signing_order: row.signing_order,
      status: row.status,
      access_token: row.access_token,
      signed_at: row.signed_at,
      declined_at: row.declined_at,
      ip_address: row.ip_address,
      user_agent: row.user_agent,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private mapRowToFieldData(row: any): any {
    return {
      id: row.id,
      document_id: row.document_id,
      type: row.type,
      page: row.page,
      x: parseFloat(row.x),
      y: parseFloat(row.y),
      width: parseFloat(row.width),
      height: parseFloat(row.height),
      required: row.required,
      signer_email: row.signer_email,
      value: row.value,
      properties: row.properties,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
