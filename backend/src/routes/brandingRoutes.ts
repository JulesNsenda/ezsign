import { Router } from 'express';
import { Pool } from 'pg';
import multer from 'multer';
import { BrandingController } from '@/controllers/brandingController';
import { StorageService } from '@/services/storageService';
import { authenticate } from '@/middleware/auth';

// Configure multer for logo uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB limit for logos
  },
  fileFilter: (_req, file, cb) => {
    // Only allow image files
    const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PNG, JPEG, SVG, and WebP are allowed.'));
    }
  },
});

/**
 * Create branding routes for team branding settings
 * Routes are nested under /api/teams/:teamId/branding
 */
export const createBrandingRouter = (pool: Pool, storageService: StorageService): Router => {
  const router = Router({ mergeParams: true }); // mergeParams to access :teamId from parent router
  const brandingController = new BrandingController(pool, storageService);

  // All routes require authentication
  router.use(authenticate);

  // Get branding settings for a team
  router.get('/', brandingController.getBranding);

  // Update branding settings for a team
  router.put('/', brandingController.updateBranding);

  // Upload logo
  router.post('/logo', upload.single('logo'), brandingController.uploadLogo);

  // Delete logo
  router.delete('/logo', brandingController.deleteLogo);

  // Reset branding to defaults
  router.post('/reset', brandingController.resetBranding);

  return router;
};

/**
 * Create public branding routes (no authentication required)
 * Routes are mounted at /api/branding
 */
export const createPublicBrandingRouter = (pool: Pool, storageService: StorageService): Router => {
  const router = Router();
  const brandingController = new BrandingController(pool, storageService);

  // Get default branding for public pages (login, register)
  router.get('/default', brandingController.getDefaultBranding);

  // Get logo file (public endpoint for displaying logos)
  router.get('/logo/:teamId', brandingController.getLogo);

  // Get public branding for signing pages
  router.get('/public/:teamId', brandingController.getPublicBranding);

  return router;
};
