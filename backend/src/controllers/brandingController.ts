import { Request, Response } from 'express';
import { Pool } from 'pg';
import { BrandingService } from '@/services/brandingService';
import { TeamService } from '@/services/teamService';
import { StorageService } from '@/services/storageService';
import { getSettingsService, SettingsService } from '@/services/settingsService';
import { AuthenticatedRequest } from '@/middleware/auth';
import { Branding, UpdateBrandingData } from '@/models/Branding';
import logger from '@/services/loggerService';
import path from 'path';

/**
 * Fields a team owner may set through `PUT /api/teams/:teamId/branding`.
 * `logo_path`/`favicon_path` are deliberately excluded (SEC-C2): a raw
 * client-supplied path here would be read back, unauthenticated, by
 * `GET /api/branding/logo/:teamId`, so it must never come from `req.body`.
 * `uploadLogo` sets `logo_path` separately, server-side, with a key it
 * generates itself (`branding/${teamId}/logo${ext}`); `logo_url` (a plain
 * external URL, never resolved against storage) is fine to accept here.
 */
const ALLOWED_UPDATE_BRANDING_FIELDS = [
  'logo_url',
  'primary_color',
  'secondary_color',
  'accent_color',
  'company_name',
  'tagline',
  'email_footer_text',
  'custom_page_title',
  'support_email',
  'support_url',
  'privacy_url',
  'terms_url',
  'show_powered_by',
  'hide_ezsign_branding',
] as const;

function pickUpdateBrandingFields(body: Record<string, unknown>): UpdateBrandingData {
  const picked: Record<string, unknown> = {};
  for (const field of ALLOWED_UPDATE_BRANDING_FIELDS) {
    if (field in body) {
      picked[field] = body[field];
    }
  }
  return picked as UpdateBrandingData;
}

export class BrandingController {
  private brandingService: BrandingService;
  private teamService: TeamService;
  private storageService: StorageService;
  private settingsService: SettingsService;

  constructor(pool: Pool, storageService: StorageService) {
    this.brandingService = new BrandingService(pool);
    this.teamService = new TeamService(pool);
    this.storageService = storageService;
    this.settingsService = getSettingsService(pool);
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

      // Pick only the fields a client may set (SEC-C2 - drops any
      // logo_path/favicon_path in the request body) before validating or
      // persisting anything from it.
      const updates = pickUpdateBrandingFields(req.body);

      // Validate branding data
      const validation = Branding.validate(updates);
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
      const branding = await this.brandingService.updateBranding(teamId, updates);

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

      // SEC-C2 (F1): containment to the storage root is not containment to
      // this endpoint's own subtree. This route is unauthenticated, so a
      // `logo_path` poisoned before the row existed (or during the open
      // registration window) would otherwise let anyone who knows a
      // `teamId` read any file under the storage root -- `documents/...`,
      // `temp/...`, another team's own logo, etc. `uploadLogo` (the only
      // writer) always composes exactly `branding/${teamId}/logo${ext}`, so
      // requiring that prefix rejects everything else without needing a
      // live-DB audit.
      const expectedPrefix = `branding/${teamId}/`;
      if (!branding.logo_path.startsWith(expectedPrefix)) {
        logger.warn('Rejected logo_path outside its team branding subtree', {
          teamId,
          correlationId: req.correlationId,
        });
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
   *
   * Also folds in `registrationEnabled` -- this is the one unauthenticated,
   * DB-backed endpoint already polled by Landing/Login/PublicNavbar (via
   * useDefaultBranding, 5-min staleTime), so it doubles as the public config
   * surface for the registration gate rather than adding a new route.
   * Deliberately minimal: only this single boolean, not the settings
   * registry at large -- this response is reachable with no auth at all.
   */
  getDefaultBranding = async (req: Request, res: Response): Promise<void> => {
    try {
      const branding = await this.brandingService.getDefaultBranding();

      // getValue() (unlike getAll()) throws on a malformed stored value
      // instead of degrading to the default. This endpoint is unauthenticated
      // and otherwise branding-only, so a single bad `instance_settings` row
      // must not turn into a 500 that also takes branding down with it --
      // fail closed on the flag, but keep serving branding.
      let registrationEnabled = false;
      try {
        registrationEnabled = Boolean(await this.settingsService.getValue('registration.enabled'));
      } catch (settingsError) {
        logger.warn('Failed to resolve registration.enabled for default branding; reporting closed', {
          error: (settingsError as Error).message,
          correlationId: req.correlationId,
        });
      }

      if (!branding) {
        // Return null branding if none configured
        res.status(200).json({
          branding: null,
          isDefault: true,
          registrationEnabled,
        });
        return;
      }

      // Use actual request host for API URLs (logo endpoint)
      const apiBaseUrl = `${req.protocol}://${req.get('host')}`;

      res.status(200).json({
        branding: branding.toPublicJSON(apiBaseUrl),
        isDefault: !branding.hasCustomBranding(),
        registrationEnabled,
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
