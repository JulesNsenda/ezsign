import { Request, Response } from 'express';
import { Pool } from 'pg';
import { Document } from '@/models/Document';
import { Signer } from '@/models/Signer';
import { Signature } from '@/models/Signature';
import { Field } from '@/models/Field';
import { EmailService } from '@/services/emailService';
import { PdfService } from '@/services/pdfService';
import { StorageService } from '@/services/storageService';
import { socketService } from '@/services/socketService';
import logger from '@/services/loggerService';

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
    logger.debug('sendForSignature called', { documentId: req.params.id, correlationId: req.correlationId });
    try {
      const userId = (req as any).user?.userId; // Fixed: should be userId not id
      if (!userId) {
        logger.debug('No userId found, returning 401', { correlationId: req.correlationId });
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const documentId = req.params.id as string;
      const message = req.body?.message;
      logger.debug('Processing send for document', { documentId, userId, correlationId: req.correlationId });

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
      logger.debug('Document loaded', { documentId, status: document.status, correlationId: req.correlationId });

      // Check if user owns the document
      if (document.user_id !== userId) {
        logger.debug('Access denied - user does not own document', { documentId, userId, correlationId: req.correlationId });
        res.status(403).json({ success: false, error: 'Access denied' });
        return;
      }

      // Check if document can be sent
      if (!document.canSend()) {
        logger.debug('Document cannot be sent', { documentId, status: document.status, correlationId: req.correlationId });
        res.status(400).json({
          success: false,
          error: `Document cannot be sent in ${document.status} status`,
        });
        return;
      }
      logger.debug('Document can be sent', { documentId, correlationId: req.correlationId });

      // Validate all fields are assigned to signers
      const fieldsResult = await this.pool.query(
        'SELECT * FROM fields WHERE document_id = $1',
        [documentId]
      );
      logger.debug('Fields found', { documentId, count: fieldsResult.rows.length, correlationId: req.correlationId });

      if (fieldsResult.rows.length === 0) {
        logger.debug('No fields found', { documentId, correlationId: req.correlationId });
        res.status(400).json({
          success: false,
          error: 'Document must have at least one field',
        });
        return;
      }

      const unassignedFields = fieldsResult.rows.filter(
        (f) => !f.signer_email || f.signer_email.trim() === ''
      );
      logger.debug('Unassigned fields check', { documentId, unassignedCount: unassignedFields.length, correlationId: req.correlationId });

      if (unassignedFields.length > 0) {
        logger.debug('Some fields are unassigned', { documentId, correlationId: req.correlationId });
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
      logger.debug('Signers found', { documentId, count: signersResult.rows.length, correlationId: req.correlationId });

      if (signersResult.rows.length === 0) {
        logger.debug('No signers found', { documentId, correlationId: req.correlationId });
        res.status(400).json({
          success: false,
          error: 'Document must have at least one signer',
        });
        return;
      }
      logger.debug('All validations passed, proceeding to send', { documentId, correlationId: req.correlationId });

      // Update document status to pending
      await this.pool.query(
        'UPDATE documents SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['pending', documentId]
      );

      // Emit WebSocket event for document status change
      socketService.emitDocumentUpdate({
        documentId,
        status: 'pending',
        updatedAt: new Date().toISOString(),
        updatedBy: userId,
      });

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
      logger.error('Error sending document for signature', {
        error: (error as Error).message,
        stack: (error as Error).stack,
        documentId: req.params.id,
        correlationId: req.correlationId,
      });
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

        // Get document owner for WebSocket emission
        const ownerResult = await client.query(
          'SELECT user_id FROM documents WHERE id = $1',
          [signer.document_id]
        );
        const documentOwnerId = ownerResult.rows[0]?.user_id;

        // Emit WebSocket event for signer status change
        socketService.emitSignerUpdate({
          documentId: signer.document_id,
          signerId: signer.id,
          signerEmail: signer.email,
          status: 'signed',
          signedAt: new Date().toISOString(),
        });

        // Also emit document update to notify owner
        socketService.emitDocumentUpdate({
          documentId: signer.document_id,
          status: 'signing_progress',
          updatedAt: new Date().toISOString(),
          ownerId: documentOwnerId,
        });

        // Check if all signers have signed (document completion)
        const allSignersResult = await client.query(
          'SELECT * FROM signers WHERE document_id = $1',
          [signer.document_id]
        );

        const allSigned = allSignersResult.rows.every((s) => s.status === 'signed');

        if (allSigned) {
          // All signers have signed - complete the document
          logger.info('All signers have signed, applying signatures to PDF', { documentId: signer.document_id });

          // Get document for processing
          const docResult = await client.query(
            'SELECT * FROM documents WHERE id = $1',
            [signer.document_id]
          );
          const document = new Document(this.mapRowToDocumentData(docResult.rows[0]));

          // Get all signatures for this document with field type and properties
          const allSignaturesResult = await client.query(
            `SELECT s.*, f.page, f.x, f.y, f.width, f.height, f.type, f.properties
             FROM signatures s
             JOIN fields f ON s.field_id = f.id
             WHERE f.document_id = $1`,
            [signer.document_id]
          );

          logger.debug('Found signatures to apply', { documentId: signer.document_id, count: allSignaturesResult.rows.length });

          // Apply signatures to PDF
          try {
            // Load original PDF
            const originalPdfBuffer = await this._storageService.downloadFile(document.file_path);

            // Get page dimensions for coordinate transformation
            const pdfInfo = await this._pdfService.getPdfInfo(originalPdfBuffer);
            const pageHeights: Map<number, number> = new Map();
            for (const pageInfo of pdfInfo.pages) {
              pageHeights.set(pageInfo.pageNumber, pageInfo.height);
            }

            // Separate fields by type
            const signatureFields: any[] = [];
            const textFields: any[] = [];
            const dateFields: any[] = [];
            const checkboxFields: any[] = [];
            const radioFields: any[] = [];
            const dropdownFields: any[] = [];
            const textareaFields: any[] = [];

            for (const row of allSignaturesResult.rows) {
              const pageNumber = parseInt(row.page);
              const fieldHeight = parseFloat(row.height);
              const frontendY = parseFloat(row.y);

              // Get page height (default to 792 points for Letter size)
              const pageHeight = pageHeights.get(pageNumber) || 792;

              // Transform Y coordinate: frontend uses top-left origin, PDF uses bottom-left
              // Formula: pdfY = pageHeight - frontendY - fieldHeight
              const pdfY = pageHeight - frontendY - fieldHeight;

              const baseField = {
                page: pageNumber,
                x: parseFloat(row.x),
                y: pdfY,
                width: parseFloat(row.width),
                height: fieldHeight,
              };

              logger.debug('Coordinate transformation', {
                fieldId: row.field_id,
                frontendY,
                pdfY,
                pageHeight,
                fieldHeight
              });

              switch (row.type) {
                case 'radio': {
                  // Radio field - use text_value as selectedValue
                  const properties = row.properties || {};
                  radioFields.push({
                    ...baseField,
                    options: properties.options || [],
                    selectedValue: row.text_value,
                    orientation: properties.orientation || 'vertical',
                    fontSize: properties.fontSize || 12,
                    textColor: properties.textColor || '#000000',
                    optionSpacing: properties.optionSpacing || 20,
                  });
                  logger.debug('Processing radio field', { fieldId: row.field_id, selectedValue: row.text_value });
                  break;
                }

                case 'dropdown': {
                  // Dropdown field - use text_value as selectedValue
                  const properties = row.properties || {};
                  dropdownFields.push({
                    ...baseField,
                    options: properties.options || [],
                    selectedValue: row.text_value,
                    settings: {
                      placeholder: properties.placeholder || 'Select an option',
                      fontSize: properties.fontSize || 12,
                      textColor: properties.textColor || '#000000',
                      backgroundColor: properties.backgroundColor || '#FFFFFF',
                      borderColor: properties.borderColor || '#000000',
                    },
                  });
                  logger.debug('Processing dropdown field', { fieldId: row.field_id, selectedValue: row.text_value });
                  break;
                }

                case 'textarea': {
                  // Textarea field - use text_value as multi-line text
                  const properties = row.properties || {};
                  textareaFields.push({
                    ...baseField,
                    text: row.text_value || '',
                    settings: {
                      fontSize: properties.fontSize || 12,
                      textColor: properties.textColor || '#000000',
                      backgroundColor: properties.backgroundColor || '#FFFFFF',
                      borderColor: properties.borderColor || '#000000',
                      lineHeight: 1.2,
                    },
                  });
                  logger.debug('Processing textarea field', { fieldId: row.field_id, textLength: row.text_value?.length });
                  break;
                }

                case 'text': {
                  // Text field - use text_value
                  const properties = row.properties || {};
                  textFields.push({
                    ...baseField,
                    text: row.text_value || '',
                    fontSize: properties.fontSize || 12,
                    fontColor: properties.fontColor || '#000000',
                  });
                  logger.debug('Processing text field', { fieldId: row.field_id, text: row.text_value });
                  break;
                }

                case 'date': {
                  // Date field - use text_value (already formatted)
                  const properties = row.properties || {};
                  dateFields.push({
                    ...baseField,
                    date: row.text_value || '',
                    format: properties.dateFormat || 'MM/DD/YYYY',
                    fontSize: properties.fontSize || 12,
                    fontColor: properties.fontColor || '#000000',
                  });
                  logger.debug('Processing date field', { fieldId: row.field_id, date: row.text_value });
                  break;
                }

                case 'checkbox': {
                  // Checkbox field - use text_value to determine checked state
                  const properties = row.properties || {};
                  checkboxFields.push({
                    ...baseField,
                    checked: row.text_value === 'checked',
                    options: {
                      checkColor: properties.checkColor || '#000000',
                      borderColor: properties.borderColor || '#000000',
                      backgroundColor: properties.backgroundColor || '#FFFFFF',
                      borderWidth: properties.borderWidth || 1,
                      style: properties.style || 'checkmark',
                    },
                  });
                  logger.debug('Processing checkbox field', { fieldId: row.field_id, checked: row.text_value === 'checked' });
                  break;
                }

                case 'signature':
                case 'initials':
                default: {
                  // Signature/initials field - use imageData
                  signatureFields.push({
                    ...baseField,
                    imageData: row.signature_data,
                  });
                  logger.debug('Processing signature row', {
                    page: row.page,
                    x: row.x,
                    y: row.y,
                    width: row.width,
                    height: row.height,
                    signature_data_length: row.signature_data?.length
                  });
                  break;
                }
              }
            }

            logger.debug('Applying fields to PDF...', {
              documentId: signer.document_id,
              signatureCount: signatureFields.length,
              textCount: textFields.length,
              dateCount: dateFields.length,
              checkboxCount: checkboxFields.length,
              radioCount: radioFields.length,
              dropdownCount: dropdownFields.length,
              textareaCount: textareaFields.length,
            });

            // Apply all fields to the PDF
            const signedPdfBuffer = await this._pdfService.addMultipleFields(
              originalPdfBuffer,
              {
                signatures: signatureFields.length > 0 ? signatureFields : undefined,
                textFields: textFields.length > 0 ? textFields : undefined,
                dateFields: dateFields.length > 0 ? dateFields : undefined,
                checkboxFields: checkboxFields.length > 0 ? checkboxFields : undefined,
                radioFields: radioFields.length > 0 ? radioFields : undefined,
                dropdownFields: dropdownFields.length > 0 ? dropdownFields : undefined,
                textareaFields: textareaFields.length > 0 ? textareaFields : undefined,
              }
            );

            logger.debug('Signed PDF created', { documentId: signer.document_id, size: signedPdfBuffer.length });

            // Save the signed PDF (replace the original file)
            const storagePath = process.env.FILE_STORAGE_PATH || './storage';
            const fs = await import('fs/promises');
            const path = await import('path');
            const fullPath = path.join(storagePath, document.file_path);
            await fs.writeFile(fullPath, signedPdfBuffer);

            logger.info('Signed PDF saved', { documentId: signer.document_id, path: fullPath });
          } catch (error) {
            logger.error('Error applying signatures to PDF', { error: (error as Error).message, stack: (error as Error).stack, documentId: signer.document_id });
            // Continue with document completion even if PDF signing fails
            // This ensures the workflow completes
          }

          // Update document status to completed
          await client.query(
            'UPDATE documents SET status = $1, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            ['completed', signer.document_id]
          );

          // Emit WebSocket event for document completion
          socketService.emitDocumentUpdate({
            documentId: signer.document_id,
            status: 'completed',
            updatedAt: new Date().toISOString(),
            ownerId: document.user_id,
          });

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
      logger.debug('Download request for token', { tokenPrefix: token.substring(0, 8), correlationId: req.correlationId });

      // Find signer by access token
      const signerResult = await this.pool.query(
        'SELECT * FROM signers WHERE access_token = $1',
        [token]
      );

      if (signerResult.rows.length === 0) {
        logger.debug('No signer found for token', { correlationId: req.correlationId });
        res.status(404).json({ success: false, error: 'Invalid signing link' });
        return;
      }

      const signer = new Signer(this.mapRowToSignerData(signerResult.rows[0]));
      logger.debug('Signer found', { signerId: signer.id, documentId: signer.document_id, correlationId: req.correlationId });

      // Get document
      const docResult = await this.pool.query(
        'SELECT * FROM documents WHERE id = $1',
        [signer.document_id]
      );

      if (docResult.rows.length === 0) {
        logger.debug('No document found', { documentId: signer.document_id, correlationId: req.correlationId });
        res.status(404).json({ success: false, error: 'Document not found' });
        return;
      }

      const document = new Document(this.mapRowToDocumentData(docResult.rows[0]));
      logger.debug('Document found', { documentId: document.id, filePath: document.file_path, correlationId: req.correlationId });

      // Check if file exists
      const fileExists = await this._storageService.fileExists(document.file_path);
      if (!fileExists) {
        logger.warn('File not found on storage', { documentId: document.id, filePath: document.file_path, correlationId: req.correlationId });
        res.status(404).json({ error: 'Document file not found' });
        return;
      }

      // Download file buffer
      const fileBuffer = await this._storageService.downloadFile(document.file_path);
      logger.debug('File downloaded', { documentId: document.id, size: fileBuffer.length, correlationId: req.correlationId });

      // Set headers for file download (inline for PDF viewing in browser)
      res.setHeader('Content-Type', document.mime_type);
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${document.original_filename}"`
      );
      res.setHeader('Content-Length', fileBuffer.length.toString());

      // Send file buffer
      res.send(fileBuffer);
      logger.debug('File sent successfully', { documentId: document.id, correlationId: req.correlationId });
    } catch (error) {
      logger.error('Download error', { error: (error as Error).message, stack: (error as Error).stack, correlationId: req.correlationId });
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
