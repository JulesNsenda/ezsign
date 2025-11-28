import { Request, Response } from 'express';
import { Pool } from 'pg';
import { ApiKeyService } from '@/services/apiKeyService';
import { AuthenticatedRequest } from '@/middleware/auth';

export class ApiKeyController {
  private apiKeyService: ApiKeyService;

  constructor(pool: Pool) {
    this.apiKeyService = new ApiKeyService(pool);
  }

  /**
   * Get all API keys for the authenticated user
   * GET /api/api-keys
   */
  getApiKeys = async (req: Request, res: Response): Promise<void> => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;

      if (!authenticatedReq.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      const apiKeys = await this.apiKeyService.findByUserId(
        authenticatedReq.user.userId
      );

      res.status(200).json({
        apiKeys: apiKeys.map((key) => key.toJSON()),
      });
    } catch (error) {
      console.error('Get API keys error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve API keys',
      });
    }
  };

  /**
   * Create a new API key
   * POST /api/api-keys
   */
  createApiKey = async (req: Request, res: Response): Promise<void> => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;

      if (!authenticatedReq.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      const { name, expiresIn } = req.body;

      // Validate input
      if (!name) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'API key name is required',
        });
        return;
      }

      // Validate name length
      if (name.length > 255) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'API key name must be 255 characters or less',
        });
        return;
      }

      // Calculate expiry date if provided
      let expiresAt: Date | null = null;
      if (expiresIn) {
        const expiresInDays = parseInt(expiresIn, 10);
        if (isNaN(expiresInDays) || expiresInDays <= 0) {
          res.status(400).json({
            error: 'Bad Request',
            message: 'expiresIn must be a positive number of days',
          });
          return;
        }
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expiresInDays);
      }

      // Create API key
      const { apiKey, plainTextKey } = await this.apiKeyService.createApiKey({
        user_id: authenticatedReq.user.userId,
        name,
        expires_at: expiresAt,
      });

      res.status(201).json({
        message: 'API key created successfully',
        apiKey: apiKey.toJSON(),
        key: plainTextKey,
        warning:
          'This is the only time the full API key will be displayed. Please store it securely.',
      });
    } catch (error) {
      console.error('Create API key error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to create API key',
      });
    }
  };

  /**
   * Get a specific API key by ID
   * GET /api/api-keys/:id
   */
  getApiKey = async (req: Request, res: Response): Promise<void> => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;

      if (!authenticatedReq.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      const id = req.params.id;

      if (!id) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'API key ID is required',
        });
        return;
      }

      const apiKey = await this.apiKeyService.findById(id);

      if (!apiKey) {
        res.status(404).json({
          error: 'Not Found',
          message: 'API key not found',
        });
        return;
      }

      // Check ownership
      if (apiKey.user_id !== authenticatedReq.user.userId) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have permission to access this API key',
        });
        return;
      }

      res.status(200).json({
        apiKey: apiKey.toJSON(),
      });
    } catch (error) {
      console.error('Get API key error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve API key',
      });
    }
  };

  /**
   * Update an API key
   * PUT /api/api-keys/:id
   */
  updateApiKey = async (req: Request, res: Response): Promise<void> => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;

      if (!authenticatedReq.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      const id = req.params.id;
      const { name, expiresIn } = req.body;

      if (!id) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'API key ID is required',
        });
        return;
      }

      // Find existing API key
      const existingKey = await this.apiKeyService.findById(id);

      if (!existingKey) {
        res.status(404).json({
          error: 'Not Found',
          message: 'API key not found',
        });
        return;
      }

      // Check ownership
      if (existingKey.user_id !== authenticatedReq.user.userId) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have permission to update this API key',
        });
        return;
      }

      // Calculate expiry date if provided
      let expiresAt: Date | null | undefined = undefined;
      if (expiresIn !== undefined) {
        if (expiresIn === null) {
          expiresAt = null;
        } else {
          const expiresInDays = parseInt(expiresIn, 10);
          if (isNaN(expiresInDays) || expiresInDays <= 0) {
            res.status(400).json({
              error: 'Bad Request',
              message: 'expiresIn must be a positive number of days or null',
            });
            return;
          }
          expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + expiresInDays);
        }
      }

      // Update API key
      const updatedKey = await this.apiKeyService.updateApiKey(id, {
        name,
        expires_at: expiresAt,
      });

      res.status(200).json({
        message: 'API key updated successfully',
        apiKey: updatedKey?.toJSON(),
      });
    } catch (error) {
      console.error('Update API key error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to update API key',
      });
    }
  };

  /**
   * Delete an API key
   * DELETE /api/api-keys/:id
   */
  deleteApiKey = async (req: Request, res: Response): Promise<void> => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;

      if (!authenticatedReq.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      const id = req.params.id;

      if (!id) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'API key ID is required',
        });
        return;
      }

      // Find existing API key
      const existingKey = await this.apiKeyService.findById(id);

      if (!existingKey) {
        res.status(404).json({
          error: 'Not Found',
          message: 'API key not found',
        });
        return;
      }

      // Check ownership
      if (existingKey.user_id !== authenticatedReq.user.userId) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have permission to delete this API key',
        });
        return;
      }

      // Delete API key
      await this.apiKeyService.deleteApiKey(id);

      res.status(200).json({
        message: 'API key deleted successfully',
      });
    } catch (error) {
      console.error('Delete API key error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to delete API key',
      });
    }
  };
}
