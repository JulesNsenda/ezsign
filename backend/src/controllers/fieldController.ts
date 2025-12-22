import { Request, Response } from 'express';
import { FieldService } from '../services/fieldService.js';
import { SignerService } from '../services/signerService.js';
import { CreateFieldData, UpdateFieldData } from '../models/Field.js';
import logger from '@/services/loggerService';

export class FieldController {
  private fieldService: FieldService;

  constructor(fieldService: FieldService, _signerService: SignerService) {
    this.fieldService = fieldService;
  }

  /**
   * Create a new field for a document
   * POST /api/documents/:id/fields
   */
  createField = async (req: Request, res: Response): Promise<void> => {
    try {
      const documentId = req.params.id as string;
      const fieldData: CreateFieldData = {
        document_id: documentId,
        type: req.body.type,
        page: req.body.page,
        x: req.body.x,
        y: req.body.y,
        width: req.body.width,
        height: req.body.height,
        required: req.body.required,
        signer_email: req.body.signer_email,
        properties: req.body.properties,
      };

      const field = await this.fieldService.createField(fieldData);

      res.status(201).json({
        success: true,
        data: field.toJSON(),
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
   * Get all fields for a document
   * GET /api/documents/:id/fields
   */
  getFields = async (req: Request, res: Response): Promise<void> => {
    try {
      const documentId = req.params.id as string;
      const fields = await this.fieldService.getFieldsByDocumentId(documentId);

      res.status(200).json({
        success: true,
        data: fields.map((f) => f.toJSON()),
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
   * Get a single field by ID
   * GET /api/documents/:id/fields/:fieldId
   */
  getField = async (req: Request, res: Response): Promise<void> => {
    try {
      const fieldId = req.params.fieldId as string;
      const field = await this.fieldService.getFieldById(fieldId);

      if (!field) {
        res.status(404).json({
          success: false,
          error: 'Field not found',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: field.toJSON(),
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
   * Update a field
   * PUT /api/documents/:id/fields/:fieldId
   */
  updateField = async (req: Request, res: Response): Promise<void> => {
    try {
      const fieldId = req.params.fieldId as string;
      const updateData: UpdateFieldData = {
        type: req.body.type,
        page: req.body.page,
        x: req.body.x,
        y: req.body.y,
        width: req.body.width,
        height: req.body.height,
        required: req.body.required,
        signer_email: req.body.signer_email,
        properties: req.body.properties,
      };

      logger.debug('Updating field', { fieldId, updateData, correlationId: req.correlationId });
      const field = await this.fieldService.updateField(fieldId, updateData);

      res.status(200).json({
        success: true,
        data: field.toJSON(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Field update error', { error: message, fieldId: req.params.fieldId, body: req.body, correlationId: req.correlationId });
      res.status(400).json({
        success: false,
        error: message,
      });
    }
  };

  /**
   * Delete a field
   * DELETE /api/documents/:id/fields/:fieldId
   */
  deleteField = async (req: Request, res: Response): Promise<void> => {
    try {
      const fieldId = req.params.fieldId as string;
      const deleted = await this.fieldService.deleteField(fieldId);

      if (!deleted) {
        res.status(404).json({
          success: false,
          error: 'Field not found',
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Field deleted successfully',
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
   * Bulk upsert fields for a document
   * POST /api/documents/:id/fields/bulk
   */
  bulkUpsertFields = async (req: Request, res: Response): Promise<void> => {
    try {
      const documentId = req.params.id as string;
      const fieldsData = req.body.fields;

      if (!Array.isArray(fieldsData)) {
        res.status(400).json({
          success: false,
          error: 'Fields must be an array',
        });
        return;
      }

      // Add document_id to each field
      const fields = fieldsData.map((f) => ({
        ...f,
        document_id: documentId,
      }));

      const result = await this.fieldService.bulkUpsertFields(documentId, fields);

      res.status(200).json({
        success: true,
        data: result.map((f) => f.toJSON()),
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
   * Validate all fields for a document
   * GET /api/documents/:id/fields/validate
   */
  validateFields = async (req: Request, res: Response): Promise<void> => {
    try {
      const documentId = req.params.id as string;
      const validation = await this.fieldService.validateAllFieldsForDocument(
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
}
