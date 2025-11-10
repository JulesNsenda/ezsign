/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unused-vars */
import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { DocumentService } from '@/services/documentService';
import { LocalStorageAdapter } from '@/adapters/LocalStorageAdapter';
import { createStorageService } from '@/services/storageService';
import path from 'path';

/**
 * Middleware to check if user can access a document
 * Allows access if user is the owner or a member of the document's team
 */
export const createDocumentAccessMiddleware = (pool: Pool) => {
  // Initialize services
  const storagePath = process.env.STORAGE_PATH || path.join(process.cwd(), 'storage');
  const storageAdapter = new LocalStorageAdapter(storagePath);
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
      const canAccess = await documentService.canAccessDocument(documentId, req.user.userId);

      if (!canAccess) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have permission to access this document',
        });
        return;
      }

      next();
    } catch (error) {
      console.error('Document access check error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to verify document access',
      });
    }
  };
};
