import { Request, Response, NextFunction } from 'express';
import { errorHandler, ApiError } from './errorHandler';

jest.mock('@/services/loggerService', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('errorHandler', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let responseJson: jest.Mock;
  let responseStatus: jest.Mock;

  beforeEach(() => {
    responseJson = jest.fn();
    responseStatus = jest.fn().mockReturnValue({ json: responseJson });

    mockRequest = {
      path: '/api/signing/some-token/sign',
      method: 'POST',
      correlationId: 'corr-1',
    };
    mockResponse = {
      status: responseStatus,
      json: responseJson,
    };
    mockNext = jest.fn();
  });

  it('maps a body-parser entity.too.large error to 413 with PAYLOAD_TOO_LARGE, regardless of its own statusCode', () => {
    // No statusCode set here on purpose - a test that relies on the
    // incidental statusCode body-parser/http-errors happens to attach would
    // pass even without the explicit branch this test is meant to cover.
    const err = {
      name: 'Error',
      message: 'request entity too large',
      type: 'entity.too.large',
    } as ApiError;

    errorHandler(err, mockRequest as Request, mockResponse as Response, mockNext);

    expect(responseStatus).toHaveBeenCalledWith(413);
    expect(responseJson).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request body too large',
      },
    });
  });

  it('maps a multer LIMIT_FILE_SIZE error to 413 with PAYLOAD_TOO_LARGE, regardless of its own statusCode', () => {
    // Multer's MulterError has no `type` and no `statusCode` of its own -
    // a test relying on either would pass without the `err.code` branch
    // this test is meant to cover.
    const err = {
      name: 'MulterError',
      message: 'File too large',
      code: 'LIMIT_FILE_SIZE',
    } as ApiError;

    errorHandler(err, mockRequest as Request, mockResponse as Response, mockNext);

    expect(responseStatus).toHaveBeenCalledWith(413);
    expect(responseJson).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request body too large',
      },
    });
  });

  it('falls back to statusCode || 500 for errors that are not entity.too.large', () => {
    const err = {
      name: 'Error',
      message: 'boom',
    } as ApiError;

    errorHandler(err, mockRequest as Request, mockResponse as Response, mockNext);

    expect(responseStatus).toHaveBeenCalledWith(500);
    expect(responseJson).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'boom',
      },
    });
  });

  it('preserves an explicit statusCode/code for a normal ApiError', () => {
    const err: ApiError = {
      name: 'Error',
      message: 'Document not found',
      statusCode: 404,
      code: 'NOT_FOUND',
    } as ApiError;

    errorHandler(err, mockRequest as Request, mockResponse as Response, mockNext);

    expect(responseStatus).toHaveBeenCalledWith(404);
    expect(responseJson).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Document not found',
      },
    });
  });
});
