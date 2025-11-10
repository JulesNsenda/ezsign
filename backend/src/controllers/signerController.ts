import { Request, Response } from 'express';
import { Pool } from 'pg';
import { SignerService } from '../services/signerService.js';
import { DocumentService } from '../services/documentService.js';
import { EmailService } from '../services/emailService.js';
import { CreateSignerData, UpdateSignerData } from '../models/Signer.js';

export class SignerController {
  private signerService: SignerService;
  // private documentService: DocumentService | null;  // Reserved for future use
  private emailService: EmailService | null;
  private pool: Pool;

  constructor(
    signerService: SignerService,
    pool?: Pool,
    _documentService?: DocumentService,
    emailService?: EmailService
  ) {
    this.signerService = signerService;
    this.pool = pool || (signerService as any).pool;
    // this.documentService = documentService || null;  // Reserved for future use
    this.emailService = emailService || null;
  }

  /**
   * Create a new signer for a document
   * POST /api/documents/:id/signers
   */
  createSigner = async (req: Request, res: Response): Promise<void> => {
    try {
      const documentId = req.params.id as string;
      const signerData: CreateSignerData = {
        document_id: documentId,
        email: req.body.email,
        name: req.body.name,
        signing_order: req.body.signing_order,
        status: req.body.status,
      };

      const signer = await this.signerService.createSigner(signerData);

      res.status(201).json({
        success: true,
        data: signer.toPublicJSON(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({
        success: false,
        error: message,
      });
    }
  };

  /**
   * Get all signers for a document
   * GET /api/documents/:id/signers
   */
  getSigners = async (req: Request, res: Response): Promise<void> => {
    try {
      const documentId = req.params.id as string;
      const signers = await this.signerService.getSignersByDocumentId(documentId);

      res.status(200).json({
        success: true,
        data: signers.map((s) => s.toPublicJSON()),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({
        success: false,
        error: message,
      });
    }
  };

  /**
   * Get a single signer by ID
   * GET /api/documents/:id/signers/:signerId
   */
  getSigner = async (req: Request, res: Response): Promise<void> => {
    try {
      const signerId = req.params.signerId as string;
      const signer = await this.signerService.getSignerById(signerId);

      if (!signer) {
        res.status(404).json({
          success: false,
          error: 'Signer not found',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: signer.toPublicJSON(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({
        success: false,
        error: message,
      });
    }
  };

  /**
   * Update a signer
   * PUT /api/documents/:id/signers/:signerId
   */
  updateSigner = async (req: Request, res: Response): Promise<void> => {
    try {
      const signerId = req.params.signerId as string;
      const updateData: UpdateSignerData = {
        email: req.body.email,
        name: req.body.name,
        signing_order: req.body.signing_order,
        status: req.body.status,
      };

      const signer = await this.signerService.updateSigner(signerId, updateData);

      res.status(200).json({
        success: true,
        data: signer.toPublicJSON(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({
        success: false,
        error: message,
      });
    }
  };

  /**
   * Delete a signer
   * DELETE /api/documents/:id/signers/:signerId
   */
  deleteSigner = async (req: Request, res: Response): Promise<void> => {
    try {
      const signerId = req.params.signerId as string;
      const deleted = await this.signerService.deleteSigner(signerId);

      if (!deleted) {
        res.status(404).json({
          success: false,
          error: 'Signer not found',
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Signer deleted successfully',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({
        success: false,
        error: message,
      });
    }
  };

  /**
   * Assign fields to a signer
   * POST /api/documents/:id/signers/:signerId/assign-fields
   */
  assignFields = async (req: Request, res: Response): Promise<void> => {
    try {
      const signerId = req.params.signerId as string;
      const fieldIds = req.body.field_ids;

      if (!Array.isArray(fieldIds)) {
        res.status(400).json({
          success: false,
          error: 'field_ids must be an array',
        });
        return;
      }

      await this.signerService.assignFieldsToSigner(signerId, fieldIds);

      res.status(200).json({
        success: true,
        message: 'Fields assigned successfully',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({
        success: false,
        error: message,
      });
    }
  };

  /**
   * Validate all signers for a document
   * GET /api/documents/:id/signers/validate
   */
  validateSigners = async (req: Request, res: Response): Promise<void> => {
    try {
      const documentId = req.params.id as string;
      const validation = await this.signerService.validateAllSignersForDocument(
        documentId
      );

      res.status(200).json({
        success: true,
        data: validation,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({
        success: false,
        error: message,
      });
    }
  };

  /**
   * Check if signer can sign in sequential workflow
   * GET /api/documents/:id/signers/:signerId/can-sign
   */
  canSign = async (req: Request, res: Response): Promise<void> => {
    try {
      const signerId = req.params.signerId as string;
      const result = await this.signerService.canSignInSequentialWorkflow(signerId);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({
        success: false,
        error: message,
      });
    }
  };

  /**
   * Resend signing invitation email to a signer
   * POST /api/documents/:id/signers/:signerId/resend
   */
  resendSigningEmail = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const { id: documentId, signerId } = req.params;
      const { message: customMessage } = req.body;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      // Get document and verify access (checkDocumentAccess middleware handles ownership)
      const documentQuery = await this.pool.query(
        'SELECT id, title, status, workflow_type, user_id FROM documents WHERE id = $1',
        [documentId]
      );

      if (documentQuery.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: 'Document not found',
        });
        return;
      }

      const document = documentQuery.rows[0];

      // Validate document status is 'pending'
      if (document.status !== 'pending') {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'Can only resend emails for pending documents',
        });
        return;
      }

      // Get signer
      const signer = await this.signerService.getSignerById(signerId as string);

      if (!signer) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: 'Signer not found',
        });
        return;
      }

      // Verify signer belongs to this document
      if (signer.document_id !== documentId) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'Signer does not belong to this document',
        });
        return;
      }

      // Validate signer status is 'pending'
      if (!signer.isPending()) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: `Cannot resend email to signer with status '${signer.status}'`,
        });
        return;
      }

      // For sequential workflow, validate it's current signer's turn
      if (document.workflow_type === 'sequential') {
        const allSigners = await this.signerService.getSignersByDocumentId(documentId);
        const pendingSigners = allSigners.filter(s => s.isPending()).sort((a, b) => {
          if (a.signing_order === null) return 1;
          if (b.signing_order === null) return -1;
          return a.signing_order - b.signing_order;
        });

        const currentSigner = pendingSigners[0];
        if (!currentSigner || currentSigner.id !== signerId) {
          res.status(400).json({
            success: false,
            error: 'Bad Request',
            message: 'Cannot resend to this signer. It is not their turn to sign yet.',
          });
          return;
        }
      }

      // Check rate limit
      signer.resetReminderCountIfExpired();
      const rateLimitCheck = signer.canResendReminder();

      if (!rateLimitCheck.canResend) {
        res.status(429).json({
          success: false,
          error: 'Too Many Requests',
          message: rateLimitCheck.reason || 'Rate limit exceeded',
        });
        return;
      }

      // Get document owner info for sender name
      const ownerQuery = await this.pool.query(
        'SELECT email FROM users WHERE id = $1',
        [document.user_id]
      );
      const ownerEmail = ownerQuery.rows[0]?.email || 'Document Owner';

      // Send email (if emailService is available)
      if (this.emailService) {
        await this.emailService.sendSigningRequest({
          recipientEmail: signer.email,
          recipientName: signer.name,
          documentTitle: document.title,
          senderName: ownerEmail,
          signingUrl: this.emailService.generateSigningUrl(signer.access_token),
          message: customMessage,
          isReminder: true,
        });
      }

      // Update last_reminder_sent_at and increment reminder_count
      const updateQuery = `
        UPDATE signers
        SET last_reminder_sent_at = CURRENT_TIMESTAMP,
            reminder_count = reminder_count + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING last_reminder_sent_at, reminder_count
      `;

      const updateResult = await this.pool.query(updateQuery, [signerId]);
      const updatedSigner = updateResult.rows[0];

      // Create audit event
      const auditQuery = `
        INSERT INTO audit_events (
          document_id, user_id, event_type, metadata, created_at
        ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      `;

      await this.pool.query(auditQuery, [
        documentId,
        userId,
        'signer_reminder_sent',
        JSON.stringify({
          signer_id: signerId,
          signer_email: signer.email,
          reminder_count: updatedSigner.reminder_count,
        }),
      ]);

      // Return success response
      res.status(200).json({
        success: true,
        message: 'Signing invitation resent successfully',
        data: {
          signer_id: signerId,
          email: signer.email,
          last_sent_at: updatedSigner.last_reminder_sent_at,
          reminder_count: updatedSigner.reminder_count,
        },
      });
    } catch (error) {
      console.error('Resend signing email error:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: `Failed to resend signing email: ${message}`,
      });
    }
  };
}
