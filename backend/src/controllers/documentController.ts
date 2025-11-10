import { Request, Response } from 'express';
import { Pool } from 'pg';
import multer from 'multer';
import { DocumentService } from '@/services/documentService';
import { LocalStorageAdapter } from '@/adapters/LocalStorageAdapter';
import { createStorageService } from '@/services/storageService';
import path from 'path';

// Configure multer for memory storage (we'll process the file before storing)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (_req, file, cb) => {
    // Only allow PDF files
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
});

export class DocumentController {
  private documentService: DocumentService;
  public uploadMiddleware: multer.Multer;

  constructor(pool: Pool) {
    // Initialize storage adapter
    const storagePath = process.env.STORAGE_PATH || path.join(process.cwd(), 'storage');
    const storageAdapter = new LocalStorageAdapter(storagePath);
    const storageService = createStorageService(storageAdapter);

    this.documentService = new DocumentService(pool, storageService);
    this.uploadMiddleware = upload;
  }

  /**
   * Upload a new document
   * POST /api/documents
   */
  upload = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      if (!req.file) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'No file uploaded',
        });
        return;
      }

      const { title, team_id } = req.body;

      // Validate title
      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Title is required',
        });
        return;
      }

      // Create document
      const document = await this.documentService.createDocument({
        userId: req.user.userId,
        teamId: team_id,
        title: title.trim(),
        fileBuffer: req.file.buffer,
        originalFilename: req.file.originalname,
      });

      res.status(201).json({
        message: 'Document uploaded successfully',
        document: document.toPublicJSON(),
      });
    } catch (error) {
      console.error('Document upload error:', error);

      if (error instanceof Error && error.message.includes('PDF')) {
        res.status(400).json({
          error: 'Bad Request',
          message: error.message,
        });
        return;
      }

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to upload document',
      });
    }
  };

  /**
   * List documents with pagination and filtering
   * GET /api/documents
   */
  list = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      const {
        team_id,
        status,
        page = '1',
        limit = '10',
        sort_by = 'created_at',
        sort_order = 'desc',
      } = req.query;

      // Validate pagination parameters
      const pageNum = parseInt(page as string, 10);
      const limitNum = parseInt(limit as string, 10);

      if (isNaN(pageNum) || pageNum < 1) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid page number',
        });
        return;
      }

      if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Limit must be between 1 and 100',
        });
        return;
      }

      // Validate sort parameters
      const validSortBy = ['created_at', 'updated_at', 'title'];
      const validSortOrder = ['asc', 'desc'];

      if (!validSortBy.includes(sort_by as string)) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid sort_by parameter',
        });
        return;
      }

      if (!validSortOrder.includes(sort_order as string)) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid sort_order parameter',
        });
        return;
      }

      const result = await this.documentService.findDocuments({
        userId: req.user.userId,
        teamId: team_id as string | undefined,
        status: status as any,
        page: pageNum,
        limit: limitNum,
        sortBy: sort_by as any,
        sortOrder: sort_order as any,
      });

      res.status(200).json({
        documents: result.documents.map((doc) => doc.toPublicJSON()),
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          total_pages: result.totalPages,
        },
      });
    } catch (error) {
      console.error('Document list error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve documents',
      });
    }
  };

  /**
   * Get a single document
   * GET /api/documents/:id
   */
  getById = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Document ID is required',
        });
        return;
      }

      const document = await this.documentService.findById(id, req.user.userId);

      if (!document) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Document not found',
        });
        return;
      }

      res.status(200).json({
        document: document.toPublicJSON(),
      });
    } catch (error) {
      console.error('Get document error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve document',
      });
    }
  };

  /**
   * Update a document
   * PUT /api/documents/:id
   */
  update = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      const { id } = req.params;
      const { title, status } = req.body;

      if (!id) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Document ID is required',
        });
        return;
      }

      // Validate at least one field is provided
      if (title === undefined && status === undefined) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'At least one field (title or status) must be provided',
        });
        return;
      }

      // Validate title if provided
      if (title !== undefined && (typeof title !== 'string' || title.trim().length === 0)) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Title must be a non-empty string',
        });
        return;
      }

      // Validate status if provided
      if (status !== undefined && !['draft', 'pending', 'completed', 'cancelled'].includes(status)) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid status value',
        });
        return;
      }

      const document = await this.documentService.updateDocument(
        id,
        req.user.userId,
        {
          title: title?.trim(),
          status,
        }
      );

      if (!document) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Document not found',
        });
        return;
      }

      res.status(200).json({
        message: 'Document updated successfully',
        document: document.toPublicJSON(),
      });
    } catch (error) {
      console.error('Update document error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to update document',
      });
    }
  };

  /**
   * Delete a document
   * DELETE /api/documents/:id
   */
  delete = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Document ID is required',
        });
        return;
      }

      const deleted = await this.documentService.deleteDocument(id, req.user.userId);

      if (!deleted) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Document not found',
        });
        return;
      }

      res.status(200).json({
        message: 'Document deleted successfully',
      });
    } catch (error) {
      console.error('Delete document error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to delete document',
      });
    }
  };

  /**
   * Get document metadata
   * GET /api/documents/:id/metadata
   */
  getMetadata = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Document ID is required',
        });
        return;
      }

      // Get document
      const document = await this.documentService.findById(id, req.user.userId);

      if (!document) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Document not found',
        });
        return;
      }

      // Get file buffer to extract PDF metadata
      const fileBuffer = await this.documentService.getDocumentFile(id, req.user.userId);

      if (!fileBuffer) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Document file not found',
        });
        return;
      }

      // Get PDF info
      const { pdfService } = await import('@/services/pdfService');
      const pdfInfo = await pdfService.getPdfInfo(fileBuffer);

      res.status(200).json({
        metadata: {
          id: document.id,
          title: document.title,
          original_filename: document.original_filename,
          file_size: document.file_size,
          file_size_formatted: document.getFormattedFileSize(),
          mime_type: document.mime_type,
          page_count: document.page_count,
          status: document.status,
          workflow_type: document.workflow_type,
          workflow_description: document.getWorkflowDescription(),
          created_at: document.created_at,
          updated_at: document.updated_at,
          completed_at: document.completed_at,
          pdf_info: {
            page_count: pdfInfo.pageCount,
            pages: pdfInfo.pages,
            title: pdfInfo.title,
            author: pdfInfo.author,
            creation_date: pdfInfo.creationDate,
          },
        },
      });
    } catch (error) {
      console.error('Get document metadata error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve document metadata',
      });
    }
  };

  /**
   * Download a document
   * GET /api/documents/:id/download
   */
  download = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Document ID is required',
        });
        return;
      }

      // Get document metadata
      const document = await this.documentService.findById(id, req.user.userId);

      if (!document) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Document not found',
        });
        return;
      }

      // Get document file
      const fileBuffer = await this.documentService.getDocumentFile(id, req.user.userId);

      if (!fileBuffer) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Document file not found',
        });
        return;
      }

      // Set headers for file download
      // Use 'inline' disposition to allow PDF viewing in browser (e.g., for react-pdf)
      res.setHeader('Content-Type', document.mime_type);
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${document.original_filename}"`
      );
      res.setHeader('Content-Length', fileBuffer.length);
      res.setHeader('Accept-Ranges', 'bytes'); // Enable range requests for PDF streaming

      res.send(fileBuffer);
    } catch (error) {
      console.error('Download document error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to download document',
      });
    }
  };

  /**
   * Get document thumbnail
   * GET /api/documents/:id/thumbnail
   */
  getThumbnail = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      const { id } = req.params;
      const width = req.query.width ? parseInt(req.query.width as string) : 200;
      const height = req.query.height ? parseInt(req.query.height as string) : 300;

      if (!id) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Document ID is required',
        });
        return;
      }

      // Generate thumbnail
      const thumbnail = await this.documentService.generateThumbnail(
        id,
        req.user.userId,
        { maxWidth: width, maxHeight: height }
      );

      if (!thumbnail) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Document not found or thumbnail generation failed',
        });
        return;
      }

      // Set headers for image
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
      res.send(thumbnail);
    } catch (error) {
      console.error('Generate thumbnail error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to generate thumbnail',
      });
    }
  };
}
