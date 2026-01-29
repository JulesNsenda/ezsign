import { Request, Response } from 'express';
import { FieldGroupService } from '../services/fieldGroupService.js';
import { CreateFieldGroupData, UpdateFieldGroupData } from '../models/FieldGroup.js';
import logger from '@/services/loggerService';

export class FieldGroupController {
  private fieldGroupService: FieldGroupService;

  constructor(fieldGroupService: FieldGroupService) {
    this.fieldGroupService = fieldGroupService;
  }

  /**
   * Create a new field group for a document
   * POST /api/documents/:id/groups
   */
  createGroup = async (req: Request, res: Response): Promise<void> => {
    try {
      const documentId = req.params.id as string;
      const groupData: CreateFieldGroupData = {
        document_id: documentId,
        name: req.body.name,
        description: req.body.description,
        sort_order: req.body.sort_order,
        collapsed: req.body.collapsed,
        color: req.body.color,
      };

      // Check if group name is already taken
      const nameTaken = await this.fieldGroupService.isGroupNameTaken(
        documentId,
        groupData.name
      );
      if (nameTaken) {
        res.status(400).json({
          success: false,
          error: 'A group with this name already exists in this document',
        });
        return;
      }

      const group = await this.fieldGroupService.createGroup(groupData);

      logger.info('Field group created', {
        groupId: group.id,
        documentId,
        name: group.name,
        correlationId: req.correlationId,
      });

      res.status(201).json({
        success: true,
        data: group.toJSON(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Field group creation error', {
        error: message,
        documentId: req.params.id,
        body: req.body,
        correlationId: req.correlationId,
      });
      res.status(400).json({
        success: false,
        error: message,
      });
    }
  };

  /**
   * Get all field groups for a document
   * GET /api/documents/:id/groups
   */
  getGroups = async (req: Request, res: Response): Promise<void> => {
    try {
      const documentId = req.params.id as string;
      const includeFieldCounts = req.query.include_field_counts === 'true';

      if (includeFieldCounts) {
        const groupsWithCounts =
          await this.fieldGroupService.getGroupsWithFieldCounts(documentId);
        res.status(200).json({
          success: true,
          data: groupsWithCounts.map((item) => ({
            ...item.group.toJSON(),
            field_count: item.fieldCount,
          })),
        });
      } else {
        const groups =
          await this.fieldGroupService.getGroupsByDocumentId(documentId);
        res.status(200).json({
          success: true,
          data: groups.map((g) => g.toJSON()),
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({
        success: false,
        error: message,
      });
    }
  };

  /**
   * Get a single field group by ID
   * GET /api/documents/:id/groups/:groupId
   */
  getGroup = async (req: Request, res: Response): Promise<void> => {
    try {
      const groupId = req.params.groupId as string;
      const group = await this.fieldGroupService.getGroupById(groupId);

      if (!group) {
        res.status(404).json({
          success: false,
          error: 'Field group not found',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: group.toJSON(),
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
   * Update a field group
   * PUT /api/documents/:id/groups/:groupId
   */
  updateGroup = async (req: Request, res: Response): Promise<void> => {
    try {
      const documentId = req.params.id as string;
      const groupId = req.params.groupId as string;
      const updateData: UpdateFieldGroupData = {
        name: req.body.name,
        description: req.body.description,
        sort_order: req.body.sort_order,
        collapsed: req.body.collapsed,
        color: req.body.color,
      };

      // If updating name, check it's not taken
      if (updateData.name !== undefined) {
        const nameTaken = await this.fieldGroupService.isGroupNameTaken(
          documentId,
          updateData.name,
          groupId
        );
        if (nameTaken) {
          res.status(400).json({
            success: false,
            error: 'A group with this name already exists in this document',
          });
          return;
        }
      }

      logger.debug('Updating field group', {
        groupId,
        updateData,
        correlationId: req.correlationId,
      });
      const group = await this.fieldGroupService.updateGroup(
        groupId,
        updateData
      );

      res.status(200).json({
        success: true,
        data: group.toJSON(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Field group update error', {
        error: message,
        groupId: req.params.groupId,
        body: req.body,
        correlationId: req.correlationId,
      });
      res.status(400).json({
        success: false,
        error: message,
      });
    }
  };

  /**
   * Delete a field group
   * DELETE /api/documents/:id/groups/:groupId
   */
  deleteGroup = async (req: Request, res: Response): Promise<void> => {
    try {
      const groupId = req.params.groupId as string;
      const deleted = await this.fieldGroupService.deleteGroup(groupId);

      if (!deleted) {
        res.status(404).json({
          success: false,
          error: 'Field group not found',
        });
        return;
      }

      logger.info('Field group deleted', {
        groupId,
        correlationId: req.correlationId,
      });

      res.status(200).json({
        success: true,
        message: 'Field group deleted successfully',
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
   * Reorder field groups within a document
   * POST /api/documents/:id/groups/reorder
   */
  reorderGroups = async (req: Request, res: Response): Promise<void> => {
    try {
      const documentId = req.params.id as string;
      const { groupIds } = req.body;

      if (!Array.isArray(groupIds)) {
        res.status(400).json({
          success: false,
          error: 'groupIds must be an array',
        });
        return;
      }

      await this.fieldGroupService.reorderGroups(documentId, groupIds);

      res.status(200).json({
        success: true,
        message: 'Field groups reordered successfully',
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
   * Assign fields to a group
   * POST /api/documents/:id/groups/:groupId/fields
   */
  assignFields = async (req: Request, res: Response): Promise<void> => {
    try {
      const groupId = req.params.groupId as string;
      const { fieldIds } = req.body;

      if (!Array.isArray(fieldIds)) {
        res.status(400).json({
          success: false,
          error: 'fieldIds must be an array',
        });
        return;
      }

      await this.fieldGroupService.assignFieldsToGroup(groupId, fieldIds);

      logger.info('Fields assigned to group', {
        groupId,
        fieldCount: fieldIds.length,
        correlationId: req.correlationId,
      });

      res.status(200).json({
        success: true,
        message: 'Fields assigned to group successfully',
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
   * Ungroup fields (remove from any group)
   * POST /api/documents/:id/fields/ungroup
   */
  ungroupFields = async (req: Request, res: Response): Promise<void> => {
    try {
      const { fieldIds } = req.body;

      if (!Array.isArray(fieldIds)) {
        res.status(400).json({
          success: false,
          error: 'fieldIds must be an array',
        });
        return;
      }

      await this.fieldGroupService.assignFieldsToGroup(null, fieldIds);

      logger.info('Fields ungrouped', {
        fieldCount: fieldIds.length,
        correlationId: req.correlationId,
      });

      res.status(200).json({
        success: true,
        message: 'Fields ungrouped successfully',
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
   * Reorder fields within a group
   * POST /api/documents/:id/groups/:groupId/fields/reorder
   */
  reorderFieldsInGroup = async (req: Request, res: Response): Promise<void> => {
    try {
      const groupId = req.params.groupId as string;
      const { fieldIds } = req.body;

      if (!Array.isArray(fieldIds)) {
        res.status(400).json({
          success: false,
          error: 'fieldIds must be an array',
        });
        return;
      }

      await this.fieldGroupService.reorderFieldsInGroup(groupId, fieldIds);

      res.status(200).json({
        success: true,
        message: 'Fields reordered within group successfully',
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
