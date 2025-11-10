import { Request, Response } from 'express';
import { TemplateService } from '@/services/templateService';

export class TemplateController {
  private templateService: TemplateService;

  constructor(templateService: TemplateService) {
    this.templateService = templateService;
  }

  /**
   * Create template from existing document
   * POST /api/templates
   */
  createFromDocument = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId; // Fixed: should be userId not id
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { document_id, name, description, team_id } = req.body;

      if (!document_id || !name) {
        res.status(400).json({
          success: false,
          error: 'document_id and name are required',
        });
        return;
      }

      const result = await this.templateService.createTemplateFromDocument(
        document_id,
        userId,
        { name, description, team_id }
      );

      res.status(201).json({
        success: true,
        data: {
          template: result.template.toPublicJSON(),
          fields: result.fields.map((f) => f.toJSON()),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({ success: false, error: message });
    }
  };

  /**
   * Get all templates
   * GET /api/templates
   */
  list = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId; // Fixed: should be userId not id
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const teamId = req.query.team_id as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

      const result = await this.templateService.getTemplates(userId, {
        teamId,
        limit,
        offset,
      });

      res.status(200).json({
        success: true,
        data: {
          templates: result.templates.map((t) => t.toPublicJSON()),
          total: result.total,
          limit,
          offset,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({ success: false, error: message });
    }
  };

  /**
   * Get a single template
   * GET /api/templates/:id
   */
  getById = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId; // Fixed: should be userId not id
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const templateId = req.params.id as string;
      const template = await this.templateService.getTemplateById(templateId);

      if (!template) {
        res.status(404).json({ success: false, error: 'Template not found' });
        return;
      }

      // Check access
      const userTeams = await this.getUserTeamIds(userId);
      if (!template.canUserAccess(userId, userTeams)) {
        res.status(403).json({ success: false, error: 'Access denied' });
        return;
      }

      // Get template fields
      const fields = await this.templateService.getTemplateFields(templateId);

      res.status(200).json({
        success: true,
        data: {
          template: template.toPublicJSON(),
          fields: fields.map((f) => f.toJSON()),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({ success: false, error: message });
    }
  };

  /**
   * Update a template
   * PUT /api/templates/:id
   */
  update = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const templateId = req.params.id as string;
      const { name, description, team_id } = req.body;

      const template = await this.templateService.updateTemplate(templateId, userId, {
        name,
        description,
        team_id,
      });

      res.status(200).json({
        success: true,
        data: template.toPublicJSON(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message === 'Access denied' || message === 'Template not found') {
        res.status(message === 'Template not found' ? 404 : 403).json({
          success: false,
          error: message,
        });
      } else {
        res.status(400).json({ success: false, error: message });
      }
    }
  };

  /**
   * Delete a template
   * DELETE /api/templates/:id
   */
  delete = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const templateId = req.params.id as string;
      const deleted = await this.templateService.deleteTemplate(templateId, userId);

      if (!deleted) {
        res.status(404).json({ success: false, error: 'Template not found' });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Template deleted successfully',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message === 'Access denied') {
        res.status(403).json({ success: false, error: message });
      } else {
        res.status(400).json({ success: false, error: message });
      }
    }
  };

  /**
   * Create document from template
   * POST /api/templates/:id/documents
   */
  createDocument = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const templateId = req.params.id as string;
      const { title, team_id, workflow_type } = req.body;

      if (!title) {
        res.status(400).json({ success: false, error: 'title is required' });
        return;
      }

      const documentId = await this.templateService.createDocumentFromTemplate(
        templateId,
        userId,
        { title, team_id, workflow_type }
      );

      res.status(201).json({
        success: true,
        data: { document_id: documentId },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message === 'Access denied' || message === 'Template not found') {
        res.status(message === 'Template not found' ? 404 : 403).json({
          success: false,
          error: message,
        });
      } else {
        res.status(400).json({ success: false, error: message });
      }
    }
  };

  /**
   * Helper to get user's team IDs
   */
  private async getUserTeamIds(_userId: string): Promise<string[]> {
    // This should ideally be moved to a shared service
    // For now, we'll return an empty array and let the service handle it
    return [];
  }
}
