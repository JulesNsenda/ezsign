import { Pool } from 'pg';
import { Request, Response } from 'express';
import { BrandingController } from './brandingController';
import { StorageService } from '@/services/storageService';
import logger from '@/services/loggerService';

jest.mock('@/services/loggerService', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

/**
 * Covers `getDefaultBranding`'s registration-gate addition (item 2/6): the
 * one unauthenticated, DB-backed endpoint that doubles as the public config
 * surface for `registration.enabled`, since Login/Landing/PublicNavbar
 * already poll it via `useDefaultBranding`.
 */
describe('BrandingController.getDefaultBranding', () => {
  let controller: BrandingController;
  let mockBrandingService: { getDefaultBranding: jest.Mock };
  let mockSettingsService: { getValue: jest.Mock };
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let responseJson: jest.Mock;
  let responseStatus: jest.Mock;

  beforeEach(() => {
    const mockPool = { query: jest.fn() } as unknown as Pool;
    const mockStorageService = {} as unknown as StorageService;
    controller = new BrandingController(mockPool, mockStorageService);

    mockBrandingService = { getDefaultBranding: jest.fn() };
    mockSettingsService = { getValue: jest.fn() };
    (controller as any).brandingService = mockBrandingService;
    (controller as any).settingsService = mockSettingsService;

    responseJson = jest.fn();
    responseStatus = jest.fn().mockReturnValue({ json: responseJson });
    mockRequest = { protocol: 'http', get: jest.fn().mockReturnValue('localhost:3001') } as any;
    mockResponse = { status: responseStatus, json: responseJson };
  });

  it('reports registrationEnabled: true when the setting resolves true (no custom branding configured)', async () => {
    mockBrandingService.getDefaultBranding.mockResolvedValue(null);
    mockSettingsService.getValue.mockResolvedValue(true);

    await controller.getDefaultBranding(mockRequest as Request, mockResponse as Response);

    expect(mockSettingsService.getValue).toHaveBeenCalledWith('registration.enabled');
    expect(responseJson).toHaveBeenCalledWith({
      branding: null,
      isDefault: true,
      registrationEnabled: true,
    });
  });

  it('reports registrationEnabled: false by default (closed) when the setting resolves false', async () => {
    mockBrandingService.getDefaultBranding.mockResolvedValue(null);
    mockSettingsService.getValue.mockResolvedValue(false);

    await controller.getDefaultBranding(mockRequest as Request, mockResponse as Response);

    expect(responseJson).toHaveBeenCalledWith(
      expect.objectContaining({ registrationEnabled: false })
    );
  });

  it('includes registrationEnabled alongside real branding data (custom branding configured)', async () => {
    const mockBranding = {
      toPublicJSON: jest.fn().mockReturnValue({ logoUrl: 'http://localhost:3001/api/branding/logo/team-1' }),
      hasCustomBranding: jest.fn().mockReturnValue(true),
    };
    mockBrandingService.getDefaultBranding.mockResolvedValue(mockBranding);
    mockSettingsService.getValue.mockResolvedValue(true);

    await controller.getDefaultBranding(mockRequest as Request, mockResponse as Response);

    expect(responseJson).toHaveBeenCalledWith({
      branding: { logoUrl: 'http://localhost:3001/api/branding/logo/team-1' },
      isDefault: false,
      registrationEnabled: true,
    });
  });

  it('fails closed (registrationEnabled: false) but still serves branding with 200, not 500, when settingsService.getValue throws', async () => {
    // getValue() throws on a malformed stored value (unlike getAll(), which
    // degrades) - a single corrupt instance_settings row must not also take
    // this unauthenticated, otherwise-branding-only endpoint down with it.
    const mockBranding = {
      toPublicJSON: jest.fn().mockReturnValue({ logoUrl: 'http://localhost:3001/logo.png' }),
      hasCustomBranding: jest.fn().mockReturnValue(false),
    };
    mockBrandingService.getDefaultBranding.mockResolvedValue(mockBranding);
    mockSettingsService.getValue.mockRejectedValue(new Error('registration.enabled has an invalid stored boolean value'));

    await controller.getDefaultBranding(mockRequest as Request, mockResponse as Response);

    expect(responseStatus).not.toHaveBeenCalledWith(500);
    expect(responseJson).toHaveBeenCalledWith(
      expect.objectContaining({ registrationEnabled: false, isDefault: true })
    );
  });

  it('still returns 500 for an unrelated failure in getDefaultBranding itself (registration-gate addition does not swallow real errors)', async () => {
    mockBrandingService.getDefaultBranding.mockRejectedValue(new Error('db down'));
    mockSettingsService.getValue.mockResolvedValue(true);

    await controller.getDefaultBranding(mockRequest as Request, mockResponse as Response);

    expect(responseStatus).toHaveBeenCalledWith(500);
  });
});

/**
 * Covers item 3.6 (SEC-C2): `updateBranding` must never let a client-supplied
 * `logo_path`/`favicon_path` reach `Branding.validate` or
 * `brandingService.updateBranding` - those two paths are how a poisoned key
 * would end up readable, unauthenticated, via `GET /api/branding/logo/:teamId`.
 */
describe('BrandingController.updateBranding', () => {
  let controller: BrandingController;
  let mockBrandingService: { getOrCreateBranding: jest.Mock; updateBranding: jest.Mock };
  let mockTeamService: { isAdminOrOwner: jest.Mock };
  let mockRequest: any;
  let mockResponse: Partial<Response>;
  let responseJson: jest.Mock;
  let responseStatus: jest.Mock;

  beforeEach(() => {
    const mockPool = { query: jest.fn() } as unknown as Pool;
    const mockStorageService = {} as unknown as StorageService;
    controller = new BrandingController(mockPool, mockStorageService);

    mockBrandingService = {
      getOrCreateBranding: jest.fn().mockResolvedValue({}),
      updateBranding: jest.fn().mockResolvedValue({
        toJSON: jest.fn().mockReturnValue({}),
        toPublicJSON: jest.fn().mockReturnValue({}),
      }),
    };
    mockTeamService = { isAdminOrOwner: jest.fn().mockResolvedValue(true) };
    (controller as any).brandingService = mockBrandingService;
    (controller as any).teamService = mockTeamService;

    responseJson = jest.fn();
    responseStatus = jest.fn().mockReturnValue({ json: responseJson });
    mockRequest = {
      params: { teamId: 'team-1' },
      body: {},
      user: { userId: 'user-1', email: 'owner@example.com', role: 'creator' },
      protocol: 'http',
      get: jest.fn().mockReturnValue('localhost:3001'),
    };
    mockResponse = { status: responseStatus, json: responseJson };
  });

  it('drops a client-supplied logo_path/favicon_path before validating or persisting anything', async () => {
    mockRequest.body = {
      company_name: 'Acme',
      logo_path: '../../../../etc/passwd',
      favicon_path: '/etc/shadow',
    };

    await controller.updateBranding(mockRequest as Request, mockResponse as Response);

    expect(mockBrandingService.updateBranding).toHaveBeenCalledWith('team-1', { company_name: 'Acme' });
    const [, persisted] = mockBrandingService.updateBranding.mock.calls[0];
    expect(persisted).not.toHaveProperty('logo_path');
    expect(persisted).not.toHaveProperty('favicon_path');
  });

  it('still persists allowed fields, including logo_url', async () => {
    mockRequest.body = {
      logo_url: 'https://cdn.example.com/logo.png',
      primary_color: '#112233',
    };

    await controller.updateBranding(mockRequest as Request, mockResponse as Response);

    expect(mockBrandingService.updateBranding).toHaveBeenCalledWith('team-1', {
      logo_url: 'https://cdn.example.com/logo.png',
      primary_color: '#112233',
    });
  });

  it('rejects an invalid primary_color the same way it did before the pick-list (validation still runs on the picked fields)', async () => {
    mockRequest.body = { primary_color: 'not-a-hex-color' };

    await controller.updateBranding(mockRequest as Request, mockResponse as Response);

    expect(responseStatus).toHaveBeenCalledWith(400);
    expect(mockBrandingService.updateBranding).not.toHaveBeenCalled();
  });
});

/**
 * Covers F1 (SEC-C2 follow-up): containment to the storage root does not
 * imply containment to this endpoint's own subtree. `getLogo` is
 * unauthenticated, so a `logo_path` poisoned to point anywhere else under
 * the storage root (e.g. during the open registration window, before item 2
 * shipped) would otherwise still be served to anyone who knows the
 * `teamId`. `uploadLogo` is the only writer and always composes
 * `branding/${teamId}/logo${ext}`, so requiring that prefix closes
 * pre-poisoned rows without a live-DB audit.
 */
describe('BrandingController.getLogo', () => {
  let controller: BrandingController;
  let mockBrandingService: { getByTeamId: jest.Mock };
  let mockStorageService: { downloadFile: jest.Mock };
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let responseJson: jest.Mock;
  let responseStatus: jest.Mock;
  let responseSet: jest.Mock;
  let responseSend: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    const mockPool = { query: jest.fn() } as unknown as Pool;
    mockStorageService = { downloadFile: jest.fn() };
    controller = new BrandingController(mockPool, mockStorageService as unknown as StorageService);

    mockBrandingService = { getByTeamId: jest.fn() };
    (controller as any).brandingService = mockBrandingService;

    responseJson = jest.fn();
    responseStatus = jest.fn().mockReturnValue({ json: responseJson });
    responseSet = jest.fn();
    responseSend = jest.fn();
    mockRequest = { params: { teamId: 'team-1' } } as any;
    mockResponse = { status: responseStatus, json: responseJson, set: responseSet, send: responseSend };
  });

  it('serves the logo when logo_path is the team\'s own branding subtree', async () => {
    mockBrandingService.getByTeamId.mockResolvedValue({ logo_path: 'branding/team-1/logo.png' });
    mockStorageService.downloadFile.mockResolvedValue(Buffer.from('png-bytes'));

    await controller.getLogo(mockRequest as Request, mockResponse as Response);

    expect(mockStorageService.downloadFile).toHaveBeenCalledWith('branding/team-1/logo.png');
    expect(responseSend).toHaveBeenCalledWith(Buffer.from('png-bytes'));
    expect(responseStatus).not.toHaveBeenCalled();
  });

  it('404s, without touching storage, when logo_path escapes the team\'s branding subtree (poisoned row)', async () => {
    mockBrandingService.getByTeamId.mockResolvedValue({ logo_path: 'documents/some-other-uuid/file.pdf' });

    await controller.getLogo(mockRequest as Request, mockResponse as Response);

    expect(mockStorageService.downloadFile).not.toHaveBeenCalled();
    expect(responseStatus).toHaveBeenCalledWith(404);
    expect(logger.warn).toHaveBeenCalledWith(
      'Rejected logo_path outside its team branding subtree',
      expect.objectContaining({ teamId: 'team-1' })
    );
  });

  it('404s when logo_path points at a sibling team\'s own branding subtree (teamId spoofed in the path, not the param)', async () => {
    mockBrandingService.getByTeamId.mockResolvedValue({ logo_path: 'branding/team-2/logo.png' });

    await controller.getLogo(mockRequest as Request, mockResponse as Response);

    expect(mockStorageService.downloadFile).not.toHaveBeenCalled();
    expect(responseStatus).toHaveBeenCalledWith(404);
  });

  it('404s on a prefix-only lookalike (branding/team-10/... must not match teamId "team-1")', async () => {
    mockBrandingService.getByTeamId.mockResolvedValue({ logo_path: 'branding/team-10/logo.png' });

    await controller.getLogo(mockRequest as Request, mockResponse as Response);

    expect(mockStorageService.downloadFile).not.toHaveBeenCalled();
    expect(responseStatus).toHaveBeenCalledWith(404);
  });
});
