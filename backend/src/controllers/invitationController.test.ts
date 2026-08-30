import { InvitationController } from './invitationController';
import { TeamInvitation } from '@/models/TeamInvitation';
import { getSettingsService } from '@/services/settingsService';
import { InvitationService } from '@/services/invitationService';
import { TeamService } from '@/services/teamService';
import { UserService } from '@/services/userService';

/**
 * G3: `sendInvitationEmail` (private, exercised via `createInvitation`)
 * interpolates `teamName`/`inviterEmail`/`role`/`inviteUrl` into HTML passed
 * to `emailService.sendCustomEmail`, which is deliberately un-escaped.
 * `teamName` in particular is free-form user input (teamController validates
 * only length), so any authenticated user can create a team named e.g.
 * `<img src=x onerror=...>` and invite an arbitrary external address - the
 * invitee's mail client then renders whatever markup was embedded.
 */

const mockInvitationService = {
  create: jest.fn(),
  findPendingByTeamAndEmail: jest.fn(),
};
const mockTeamService = {
  findById: jest.fn(),
  isAdminOrOwner: jest.fn(),
};
const mockUserService = {
  findByEmail: jest.fn(),
  findById: jest.fn(),
};

jest.mock('@/services/invitationService', () => ({
  InvitationService: jest.fn(),
}));
jest.mock('@/services/teamService', () => ({
  TeamService: jest.fn(),
}));
jest.mock('@/services/userService', () => ({
  UserService: jest.fn(),
}));
jest.mock('@/services/settingsService', () => ({
  getSettingsService: jest.fn(),
}));
jest.mock('@/services/loggerService', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

describe('InvitationController - createInvitation HTML escaping (G3)', () => {
  let controller: InvitationController;
  let mockEmailService: { sendCustomEmail: jest.Mock };
  let mockRequest: any;
  let mockResponse: any;

  beforeEach(() => {
    // `resetMocks: true` (jest.config.js) strips any implementation supplied
    // inline in the jest.mock() factories above before every test - so the
    // constructor mocks are (re-)established here instead (mirrors
    // signerController.test.ts's note on the same pattern).
    (InvitationService as jest.Mock).mockImplementation(() => mockInvitationService);
    (TeamService as jest.Mock).mockImplementation(() => mockTeamService);
    (UserService as jest.Mock).mockImplementation(() => mockUserService);

    mockEmailService = { sendCustomEmail: jest.fn().mockResolvedValue(undefined) };
    (getSettingsService as jest.Mock).mockReturnValue({
      getAppUrl: jest.fn().mockResolvedValue('https://example.test'),
    });

    controller = new InvitationController({} as any, mockEmailService as any);

    mockRequest = {
      user: { userId: 'user-1', email: 'admin@example.com', role: 'user' },
      params: { teamId: 'team-1' },
      body: { email: 'invitee@example.com', role: 'member' },
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    mockTeamService.findById.mockResolvedValue({
      id: 'team-1',
      name: '<img src=x onerror=alert(1)>Evil Corp',
    });
    mockTeamService.isAdminOrOwner.mockResolvedValue(true);
    mockUserService.findByEmail.mockResolvedValue(null);
    mockInvitationService.findPendingByTeamAndEmail.mockResolvedValue(null);
    mockInvitationService.create.mockResolvedValue(
      new TeamInvitation({
        id: 'inv-1',
        team_id: 'team-1',
        email: 'invitee@example.com',
        role: 'member',
        token: 'tok-123',
        invited_by: 'user-1',
        status: 'pending',
        expires_at: new Date(Date.now() + 7 * 86_400_000),
        created_at: new Date(),
      })
    );
    mockUserService.findById.mockResolvedValue({
      id: 'user-1',
      email: '<script>alert(document.cookie)</script>@evil.example',
    });
  });

  it('escapes an <img>/<script>-bearing team name and inviter email before embedding them in the invitation HTML', async () => {
    await controller.createInvitation(mockRequest, mockResponse);

    expect(mockResponse.status).toHaveBeenCalledWith(201);
    expect(mockEmailService.sendCustomEmail).toHaveBeenCalledTimes(1);

    const [{ html }] = mockEmailService.sendCustomEmail.mock.calls[0];

    // Neither payload survives as live markup in the HTML body.
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<script>alert(document.cookie)</script>');

    // The escaped text is still present (the invitee can still read the
    // team name/inviter), just neutralized.
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;Evil Corp');
    expect(html).toContain('&lt;script&gt;alert(document.cookie)&lt;/script&gt;@evil.example');
  });

  it('renders the accept-invitation link as a safe, escaped href', async () => {
    await controller.createInvitation(mockRequest, mockResponse);

    const [{ html }] = mockEmailService.sendCustomEmail.mock.calls[0];

    expect(html).toContain('href="https://example.test/accept-invitation/tok-123"');
  });
});
