import { DocumentController } from './documentController';
import { Pool } from 'pg';

// Mock the services
jest.mock('@/services/documentService');
jest.mock('@/adapters/LocalStorageAdapter');

describe('DocumentController', () => {
  let controller: DocumentController;
  let mockPool: Pool;
  let mockRequest: any;
  let mockResponse: any;

  beforeEach(() => {
    mockPool = {} as Pool;
    controller = new DocumentController(mockPool);

    mockRequest = {
      user: {
        userId: 'user-123',
        email: 'test@example.com',
        role: 'creator',
      },
      params: {},
      query: {},
      body: {},
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    jest.clearAllMocks();
  });

  describe('upload', () => {
    it('should return 401 if user is not authenticated', async () => {
      mockRequest.user = undefined;

      await controller.upload(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    });

    it('should return 400 if no file is uploaded', async () => {
      mockRequest.file = undefined;

      await controller.upload(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'No file uploaded',
      });
    });

    it('should return 400 if title is missing', async () => {
      mockRequest.file = {
        buffer: Buffer.from('test'),
        originalname: 'test.pdf',
      };
      mockRequest.body = {};

      await controller.upload(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'Title is required',
      });
    });

    it('should upload document successfully', async () => {
      const mockDocument = {
        id: 'doc-123',
        user_id: 'user-123',
        title: 'Test Document',
        toPublicJSON: jest.fn().mockReturnValue({
          id: 'doc-123',
          title: 'Test Document',
        }),
      };

      mockRequest.file = {
        buffer: Buffer.from('test'),
        originalname: 'test.pdf',
      };
      mockRequest.body = {
        title: 'Test Document',
      };

      // Mock the createDocument method
      const mockCreateDocument = jest.fn().mockResolvedValue(mockDocument);
      (controller as any).documentService = {
        createDocument: mockCreateDocument,
      };

      await controller.upload(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Document uploaded successfully',
        document: mockDocument.toPublicJSON(),
      });
    });
  });

  describe('list', () => {
    it('should return 401 if user is not authenticated', async () => {
      mockRequest.user = undefined;

      await controller.list(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    });

    it('should return 400 for invalid page number', async () => {
      mockRequest.query = { page: 'invalid' };

      await controller.list(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'Invalid page number',
      });
    });

    it('should list documents successfully', async () => {
      const mockDocuments = [
        {
          id: 'doc-1',
          toPublicJSON: jest.fn().mockReturnValue({ id: 'doc-1' }),
        },
        {
          id: 'doc-2',
          toPublicJSON: jest.fn().mockReturnValue({ id: 'doc-2' }),
        },
      ];

      const mockResult = {
        documents: mockDocuments,
        total: 2,
        page: 1,
        limit: 10,
        totalPages: 1,
      };

      mockRequest.query = {
        page: '1',
        limit: '10',
      };

      const mockFindDocuments = jest.fn().mockResolvedValue(mockResult);
      (controller as any).documentService = {
        findDocuments: mockFindDocuments,
      };

      await controller.list(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        documents: [{ id: 'doc-1' }, { id: 'doc-2' }],
        pagination: {
          total: 2,
          page: 1,
          limit: 10,
          total_pages: 1,
        },
      });
    });
  });

  describe('getById', () => {
    it('should return 401 if user is not authenticated', async () => {
      mockRequest.user = undefined;

      await controller.getById(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    });

    it('should return 404 if document not found', async () => {
      mockRequest.params = { id: 'doc-123' };

      const mockFindById = jest.fn().mockResolvedValue(null);
      (controller as any).documentService = {
        findById: mockFindById,
      };

      await controller.getById(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Not Found',
        message: 'Document not found',
      });
    });

    it('should return document successfully', async () => {
      const mockDocument = {
        id: 'doc-123',
        toPublicJSON: jest.fn().mockReturnValue({ id: 'doc-123' }),
      };

      mockRequest.params = { id: 'doc-123' };

      const mockFindById = jest.fn().mockResolvedValue(mockDocument);
      (controller as any).documentService = {
        findById: mockFindById,
      };

      await controller.getById(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        document: { id: 'doc-123' },
      });
    });
  });

  describe('update', () => {
    it('should return 400 if no fields are provided', async () => {
      mockRequest.params = { id: 'doc-123' };
      mockRequest.body = {};

      await controller.update(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'At least one field (title or status) must be provided',
      });
    });

    it('should return 404 if document not found', async () => {
      mockRequest.params = { id: 'doc-123' };
      mockRequest.body = { title: 'Updated Title' };

      const mockUpdateDocument = jest.fn().mockResolvedValue(null);
      (controller as any).documentService = {
        updateDocument: mockUpdateDocument,
      };

      await controller.update(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Not Found',
        message: 'Document not found',
      });
    });

    it('should update document successfully', async () => {
      const mockDocument = {
        id: 'doc-123',
        title: 'Updated Title',
        toPublicJSON: jest.fn().mockReturnValue({
          id: 'doc-123',
          title: 'Updated Title',
        }),
      };

      mockRequest.params = { id: 'doc-123' };
      mockRequest.body = { title: 'Updated Title' };

      const mockUpdateDocument = jest.fn().mockResolvedValue(mockDocument);
      (controller as any).documentService = {
        updateDocument: mockUpdateDocument,
      };

      await controller.update(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Document updated successfully',
        document: mockDocument.toPublicJSON(),
      });
    });
  });

  describe('delete', () => {
    it('should return 404 if document not found', async () => {
      mockRequest.params = { id: 'doc-123' };

      const mockDeleteDocument = jest.fn().mockResolvedValue(false);
      (controller as any).documentService = {
        deleteDocument: mockDeleteDocument,
      };

      await controller.delete(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Not Found',
        message: 'Document not found',
      });
    });

    it('should delete document successfully', async () => {
      mockRequest.params = { id: 'doc-123' };

      const mockDeleteDocument = jest.fn().mockResolvedValue(true);
      (controller as any).documentService = {
        deleteDocument: mockDeleteDocument,
      };

      await controller.delete(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Document deleted successfully',
      });
    });
  });

  describe('download', () => {
    it('should return 404 if document not found', async () => {
      mockRequest.params = { id: 'doc-123' };

      const mockFindById = jest.fn().mockResolvedValue(null);
      (controller as any).documentService = {
        findById: mockFindById,
      };

      await controller.download(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Not Found',
        message: 'Document not found',
      });
    });

    it('should download document successfully', async () => {
      const mockDocument = {
        id: 'doc-123',
        mime_type: 'application/pdf',
        original_filename: 'test.pdf',
      };

      const mockFileBuffer = Buffer.from('test file content');

      mockRequest.params = { id: 'doc-123' };

      const mockFindById = jest.fn().mockResolvedValue(mockDocument);
      const mockGetDocumentFile = jest.fn().mockResolvedValue(mockFileBuffer);
      (controller as any).documentService = {
        findById: mockFindById,
        getDocumentFile: mockGetDocumentFile,
      };

      await controller.download(mockRequest, mockResponse);

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/pdf'
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="test.pdf"'
      );
      expect(mockResponse.send).toHaveBeenCalledWith(mockFileBuffer);
    });
  });
});
