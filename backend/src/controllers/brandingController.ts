import { Request, Response } from 'express';
import { Pool } from 'pg';
import { BrandingService } from '@/services/brandingService';
import { TeamService } from '@/services/teamService';
import { StorageService } from '@/services/storageService';
import { AuthenticatedRequest } from '@/middleware/auth';
import { Branding } from '@/models/Branding';
import logger from '@/services/loggerService';
import path from 'path';

export class BrandingController {
  private brandingService: BrandingService;
  private teamService: TeamService;
  private storageService: StorageService;

  constructor(pool: Pool, storageService: StorageService) {
    this.brandingService = new BrandingService(pool);
    this.teamService = new TeamService(pool);
    this.storageService = storageService;
  }

  /**
   * Get branding settings for a team
   * GET /api/teams/:teamId/branding
   */
  getBranding = async (req: Request, res: Response): Promise<void> => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;

      if (!authenticatedReq.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      const teamId = req.params.teamId;

      if (!teamId) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Team ID is required',
        });
        return;
      }

      const userId = authenticatedReq.user.userId;

      // Check if user is a member of the team
      const isMember = await this.teamService.isMember(teamId, userId);

      if (!isMember && authenticatedReq.user.role !== 'admin') {
        res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have permission to access this team',
        });
        return;
      }

      // Get or create branding
      const branding = await this.brandingService.getOrCreateBranding(teamId);

      // Use actual request host for API URLs (logo endpoint)
      const apiBaseUrl = `${req.protocol}://${req.get('host')}`;

      res.status(200).json({
        branding: branding.toJSON(),
        publicBranding: branding.toPublicJSON(apiBaseUrl),
      });
    } catch (error) {
      logger.error('Get branding error', {
        error: (error as Error).message,
        stack: (error as Error).stack,
        correlationId: req.correlationId,
      });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve branding settings',
      });
    }
  };

  /**
   * Update branding settings for a team
   * PUT /api/teams/:teamId/branding
   */
  updateBranding = async (req: Request, res: Response): Promise<void> => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;

      if (!authenticatedReq.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      const teamId = req.params.teamId;

      if (!teamId) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Team ID is required',
        });
        return;
      }

      const userId = authenticatedReq.user.userId;

      // Check if user is admin/owner of the team
      const isAdminOrOwner = await this.teamService.isAdminOrOwner(teamId, userId);

      if (!isAdminOrOwner && authenticatedReq.user.role !== 'admin') {
        res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have permission to update branding settings',
        });
        return;
      }

      // Validate branding data
      const validation = Branding.validate(req.body);
      if (!validation.valid) {
        res.status(400).json({
          error: 'Bad Request',
          message: validation.errors.join(', '),
        });
        return;
      }

      // Ensure branding exists
      await this.brandingService.getOrCreateBranding(teamId);

      // Update branding
      const branding = await this.brandingService.updateBranding(teamId, req.body);

      if (!branding) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Branding settings not found',
        });
        return;
      }

      // Use actual request host for API URLs (logo endpoint)
      const apiBaseUrl = `${req.protocol}://${req.get('host')}`;

      res.status(200).json({
        message: 'Branding settings updated successfully',
        branding: branding.toJSON(),
        publicBranding: branding.toPublicJSON(apiBaseUrl),
      });
    } catch (error) {
      logger.error('Update branding error', {
        error: (error as Error).message,
        stack: (error as Error).stack,
        correlationId: req.correlationId,
      });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to update branding settings',
      });
    }
  };

  /**
   * Upload a logo for a team
   * POST /api/teams/:teamId/branding/logo
   */
  uploadLogo = async (req: Request, res: Response): Promise<void> => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;

      if (!authenticatedReq.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      const teamId = req.params.teamId;

      if (!teamId) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Team ID is required',
        });
        return;
      }

      const userId = authenticatedReq.user.userId;

      // Check if user is admin/owner of the team
      const isAdminOrOwner = await this.teamService.isAdminOrOwner(teamId, userId);

      if (!isAdminOrOwner && authenticatedReq.user.role !== 'admin') {
        res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have permission to upload logos',
        });
        return;
      }

      // Check if file was uploaded
      if (!req.file) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'No logo file uploaded',
        });
        return;
      }

      // Validate file type
      const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
      if (!allowedMimeTypes.includes(req.file.mimetype)) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid file type. Allowed types: PNG, JPEG, SVG, WebP',
        });
        return;
      }

      // Validate file size (max 2MB)
      const maxSize = 2 * 1024 * 1024;
      if (req.file.size > maxSize) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'File too large. Maximum size is 2MB',
        });
        return;
      }

      // Get existing branding to delete old logo if exists
      const existingBranding = await this.brandingService.getByTeamId(teamId);
      if (existingBranding?.logo_path) {
        try {
          await this.storageService.deleteFile(existingBranding.logo_path);
        } catch (deleteError) {
          logger.warn('Failed to delete old logo', {
            path: existingBranding.logo_path,
            error: (deleteError as Error).message,
          });
        }
      }

      // Save the new logo
      const extension = path.extname(req.file.originalname) || '.png';
      const logoPath = `branding/${teamId}/logo${extension}`;

      await this.storageService.uploadFile(req.file.buffer, logoPath);

      // Update branding with new logo path
      await this.brandingService.getOrCreateBranding(teamId);
      const branding = await this.brandingService.updateLogoPath(teamId, logoPath);

      if (!branding) {
        res.status(500).json({
          error: 'Internal Server Error',
          message: 'Failed to update logo path',
        });
        return;
      }

      // Use actual request host for API URLs (logo endpoint)
      const apiBaseUrl = `${req.protocol}://${req.get('host')}`;

      res.status(200).json({
        message: 'Logo uploaded successfully',
        logoUrl: branding.getLogoUrl(apiBaseUrl),
        branding: branding.toJSON(),
      });
    } catch (error) {
      logger.error('Upload logo error', {
        error: (error as Error).message,
        stack: (error as Error).stack,
        correlationId: req.correlationId,
      });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to upload logo',
      });
    }
  };

  /**
   * Delete a logo for a team
   * DELETE /api/teams/:teamId/branding/logo
   */
  deleteLogo = async (req: Request, res: Response): Promise<void> => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;

      if (!authenticatedReq.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      const teamId = req.params.teamId;

      if (!teamId) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Team ID is required',
        });
        return;
      }

      const userId = authenticatedReq.user.userId;

      // Check if user is admin/owner of the team
      const isAdminOrOwner = await this.teamService.isAdminOrOwner(teamId, userId);

      if (!isAdminOrOwner && authenticatedReq.user.role !== 'admin') {
        res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have permission to delete logos',
        });
        return;
      }

      // Get existing branding
      const branding = await this.brandingService.getByTeamId(teamId);

      if (!branding) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Branding settings not found',
        });
        return;
      }

      // Delete logo file if exists
      if (branding.logo_path) {
        try {
          await this.storageService.deleteFile(branding.logo_path);
        } catch (deleteError) {
          logger.warn('Failed to delete logo file', {
            path: branding.logo_path,
            error: (deleteError as Error).message,
          });
        }
      }

      // Update branding to remove logo path and URL
      const updatedBranding = await this.brandingService.updateBranding(teamId, {
        logo_path: null,
        logo_url: null,
      });

      res.status(200).json({
        message: 'Logo deleted successfully',
        branding: updatedBranding?.toJSON(),
      });
    } catch (error) {
      logger.error('Delete logo error', {
        error: (error as Error).message,
        stack: (error as Error).stack,
        correlationId: req.correlationId,
      });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to delete logo',
      });
    }
  };

  /**
   * Get logo file for a team (public endpoint)
   * GET /api/branding/logo/:teamId
   */
  getLogo = async (req: Request, res: Response): Promise<void> => {
    try {
      const teamId = req.params.teamId;

      if (!teamId) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Team ID is required',
        });
        return;
      }

      const branding = await this.brandingService.getByTeamId(teamId);

      if (!branding || !branding.logo_path) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Logo not found',
        });
        return;
      }

      const logoBuffer = await this.storageService.downloadFile(branding.logo_path);

      // Determine content type from path
      const extension = path.extname(branding.logo_path).toLowerCase();
      const contentTypes: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.webp': 'image/webp',
      };

      const contentType = contentTypes[extension] || 'application/octet-stream';

      res.set('Content-Type', contentType);
      res.set('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
      res.send(logoBuffer);
    } catch (error) {
      logger.error('Get logo error', {
        error: (error as Error).message,
        stack: (error as Error).stack,
        correlationId: req.correlationId,
      });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve logo',
      });
    }
  };

  /**
   * Reset branding to defaults
   * POST /api/teams/:teamId/branding/reset
   */
  resetBranding = async (req: Request, res: Response): Promise<void> => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;

      if (!authenticatedReq.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      const teamId = req.params.teamId;

      if (!teamId) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Team ID is required',
        });
        return;
      }

      const userId = authenticatedReq.user.userId;

      // Check if user is admin/owner of the team
      const isAdminOrOwner = await this.teamService.isAdminOrOwner(teamId, userId);

      if (!isAdminOrOwner && authenticatedReq.user.role !== 'admin') {
        res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have permission to reset branding settings',
        });
        return;
      }

      // Get existing branding to delete files
      const existingBranding = await this.brandingService.getByTeamId(teamId);

      if (existingBranding) {
        // Delete logo file if exists
        if (existingBranding.logo_path) {
          try {
            await this.storageService.deleteFile(existingBranding.logo_path);
          } catch (deleteError) {
            logger.warn('Failed to delete logo file during reset', {
              path: existingBranding.logo_path,
              error: (deleteError as Error).message,
            });
          }
        }

        // Delete favicon file if exists
        if (existingBranding.favicon_path) {
          try {
            await this.storageService.deleteFile(existingBranding.favicon_path);
          } catch (deleteError) {
            logger.warn('Failed to delete favicon file during reset', {
              path: existingBranding.favicon_path,
              error: (deleteError as Error).message,
            });
          }
        }
      }

      // Reset to defaults
      const branding = await this.brandingService.resetToDefaults(teamId);

      if (!branding) {
        // Create new branding with defaults if doesn't exist
        const newBranding = await this.brandingService.createBranding({ team_id: teamId });
        res.status(200).json({
          message: 'Branding reset to defaults',
          branding: newBranding.toJSON(),
        });
        return;
      }

      res.status(200).json({
        message: 'Branding reset to defaults',
        branding: branding.toJSON(),
      });
    } catch (error) {
      logger.error('Reset branding error', {
        error: (error as Error).message,
        stack: (error as Error).stack,
        correlationId: req.correlationId,
      });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to reset branding settings',
      });
    }
  };

  /**
   * Get public branding for signing pages (no authentication required)
   * GET /api/branding/public/:teamId
   */
  getPublicBranding = async (req: Request, res: Response): Promise<void> => {
    try {
      const teamId = req.params.teamId;

      if (!teamId) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Team ID is required',
        });
        return;
      }

      const branding = await this.brandingService.getByTeamId(teamId);

      if (!branding) {
        // Return default branding if none configured
        res.status(200).json({
          branding: null,
          isDefault: true,
        });
        return;
      }

      // Use actual request host for API URLs (logo endpoint)
      const apiBaseUrl = `${req.protocol}://${req.get('host')}`;

      res.status(200).json({
        branding: branding.toPublicJSON(apiBaseUrl),
        isDefault: !branding.hasCustomBranding(),
      });
    } catch (error) {
      logger.error('Get public branding error', {
        error: (error as Error).message,
        stack: (error as Error).stack,
        correlationId: req.correlationId,
      });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve branding settings',
      });
    }
  };

  /**
   * Get default branding for public pages (login, register)
   * GET /api/branding/default
   */
  getDefaultBranding = async (req: Request, res: Response): Promise<void> => {
    try {
      const branding = await this.brandingService.getDefaultBranding();

      if (!branding) {
        // Return null branding if none configured
        res.status(200).json({
          branding: null,
          isDefault: true,
        });
        return;
      }

      // Use actual request host for API URLs (logo endpoint)
      const apiBaseUrl = `${req.protocol}://${req.get('host')}`;

      res.status(200).json({
        branding: branding.toPublicJSON(apiBaseUrl),
        isDefault: !branding.hasCustomBranding(),
      });
    } catch (error) {
      logger.error('Get default branding error', {
        error: (error as Error).message,
        stack: (error as Error).stack,
        correlationId: req.correlationId,
      });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve default branding',
      });
    }
  };
}
