import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { DocumentService } from '@/services/documentService';
import { createStorageAdapter } from '@/config/storage';
import { createStorageService } from '@/services/storageService';
import logger from '@/services/loggerService';

/**
 * Middleware to check if user can access a document
 * Allows access if user is the owner or a member of the document's team
 */
export const createDocumentAccessMiddleware = (pool: Pool) => {
  // Initialize services
  const storageAdapter = createStorageAdapter();
  const storageService = createStorageService(storageAdapter);
  const documentService = new DocumentService(pool, storageService);

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      const documentId = req.params.id;

      if (!documentId) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Document ID is required',
        });
        return;
      }

      // Check if user can access the document
      const canAccess = await documentService.canAccessDocument(
        documentId,
        req.user.userId
      );

      if (!canAccess) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have permission to access this document',
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('Document access check error', {
        error: (error as Error).message,
        stack: (error as Error).stack,
        documentId: req.params.id,
        userId: req.user?.userId,
        correlationId: req.correlationId,
      });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to verify document access',
      });
    }
  };
};
