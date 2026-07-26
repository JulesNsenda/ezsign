import { Request, Response } from 'express';
import { Pool } from 'pg';
import { AuthController } from '@/controllers/authController';
import { UserService } from '@/services/userService';
import { TeamService } from '@/services/teamService';
import { tokenService } from '@/services/tokenService';
import { tokenBlacklistService } from '@/services/tokenBlacklistService';

// Mock dependencies
jest.mock('@/services/userService');
jest.mock('@/services/teamService');
jest.mock('@/services/tokenService');
jest.mock('@/services/tokenBlacklistService', () => ({
  tokenBlacklistService: {
    blacklistToken: jest.fn().mockResolvedValue(undefined),
    isBlacklisted: jest.fn().mockResolvedValue(false),
    blacklistAllUserTokens: jest.fn().mockResolvedValue(undefined),
    isUserSessionRevoked: jest.fn().mockResolvedValue(false),
    close: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('@/services/twoFactorService', () => {
  return {
    TwoFactorService: jest.fn().mockImplementation(() => {
      return {
        isEnabled: jest.fn().mockResolvedValue(false),
        getStatus: jest.fn().mockResolvedValue({ enabled: false }),
        setup: jest.fn(),
        verify: jest.fn().mockResolvedValue(true),
        verifyBackupCode: jest.fn().mockResolvedValue(true),
      };
    }),
  };
});

describe('AuthController', () => {
  let authController: AuthController;
  let mockPool: jest.Mocked<Pool>;
  let mockUserService: jest.Mocked<UserService>;
  let mockTeamService: jest.Mocked<TeamService>;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let responseJson: jest.Mock;
  let responseStatus: jest.Mock;

  beforeEach(() => {
    // Setup mocks
    mockPool = {
      query: jest.fn(),
      connect: jest.fn(),
    } as any;

    mockUserService = new UserService(mockPool) as jest.Mocked<UserService>;
    mockTeamService = new TeamService(mockPool) as jest.Mocked<TeamService>;

    authController = new AuthController(mockPool);
    (authController as any).userService = mockUserService;
    (authController as any).teamService = mockTeamService;

    // Mock the twoFactorService instance to avoid database calls
    (authController as any).twoFactorService = {
      isEnabled: jest.fn().mockResolvedValue(false),
      getStatus: jest.fn().mockResolvedValue({ enabled: false }),
      setup: jest.fn(),
      verify: jest.fn().mockResolvedValue(true),
      verifyBackupCode: jest.fn().mockResolvedValue(true),
    };

    // Registration open by default so pre-existing register() tests are
    // unaffected; the 'registration gate' describe block below overrides
    // this per-test to exercise the closed path.
    (authController as any).settingsService = {
      getValue: jest.fn().mockResolvedValue(true),
    };
    (authController as any).invitationService = {
      findByToken: jest.fn().mockResolvedValue(null),
    };

    // Setup response mock
    responseJson = jest.fn();
    responseStatus = jest.fn().mockReturnValue({ json: responseJson });

    mockRequest = {
      body: {},
      headers: {},
    };

    mockResponse = {
      status: responseStatus,
      json: responseJson,
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
      };

      mockRequest.body = userData;

      const mockUser = {
        id: '123',
        email: userData.email,
        role: 'creator',
        generateEmailVerificationToken: jest.fn().mockReturnValue({
          token: 'verification-token',
          expires: new Date(),
        }),
        toJSON: jest.fn().mockReturnValue({
          id: '123',
          email: userData.email,
          role: 'creator',
        }),
      } as any;

      mockUserService.findByEmail = jest.fn().mockResolvedValue(null);
      mockUserService.createUser = jest.fn().mockResolvedValue(mockUser);
      mockUserService.updateEmailVerificationToken = jest.fn().mockResolvedValue(undefined);
      mockTeamService.createTeam = jest.fn().mockResolvedValue({
        id: 'team-123',
        name: "test's Team",
      });

      (tokenService.generateTokenPair as jest.Mock) = jest.fn().mockReturnValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });

      await authController.register(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockUserService.findByEmail).toHaveBeenCalledWith(userData.email);
      expect(mockUserService.createUser).toHaveBeenCalledWith({
        email: userData.email,
        password: userData.password,
        role: 'creator',
      });
      expect(responseStatus).toHaveBeenCalledWith(201);
      expect(responseJson).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'User registered successfully',
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
        })
      );
    });

    it('should auto-create a personal team on registration', async () => {
      const userData = {
        email: 'newuser@example.com',
        password: 'password123',
      };

      mockRequest.body = userData;

      const mockUser = {
        id: 'user-456',
        email: userData.email,
        role: 'creator',
        generateEmailVerificationToken: jest.fn().mockReturnValue({
          token: 'verification-token',
          expires: new Date(),
        }),
        toJSON: jest.fn().mockReturnValue({
          id: 'user-456',
          email: userData.email,
          role: 'creator',
        }),
      } as any;

      mockUserService.findByEmail = jest.fn().mockResolvedValue(null);
      mockUserService.createUser = jest.fn().mockResolvedValue(mockUser);
      mockUserService.updateEmailVerificationToken = jest.fn().mockResolvedValue(undefined);
      mockTeamService.createTeam = jest.fn().mockResolvedValue({
        id: 'team-456',
        name: "newuser's Team",
      });

      (tokenService.generateTokenPair as jest.Mock) = jest.fn().mockReturnValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });

      await authController.register(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockTeamService.createTeam).toHaveBeenCalledWith({
        name: "newuser's Team",
        owner_id: 'user-456',
      });
      expect(responseJson).toHaveBeenCalledWith(
        expect.objectContaining({
          team: { id: 'team-456', name: "newuser's Team" },
        })
      );
    });

    it('should still register successfully if team creation fails', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
      };

      mockRequest.body = userData;

      const mockUser = {
        id: '123',
        email: userData.email,
        role: 'creator',
        generateEmailVerificationToken: jest.fn().mockReturnValue({
          token: 'verification-token',
          expires: new Date(),
        }),
        toJSON: jest.fn().mockReturnValue({
          id: '123',
          email: userData.email,
          role: 'creator',
        }),
      } as any;

      mockUserService.findByEmail = jest.fn().mockResolvedValue(null);
      mockUserService.createUser = jest.fn().mockResolvedValue(mockUser);
      mockUserService.updateEmailVerificationToken = jest.fn().mockResolvedValue(undefined);
      mockTeamService.createTeam = jest.fn().mockRejectedValue(new Error('DB error'));

      (tokenService.generateTokenPair as jest.Mock) = jest.fn().mockReturnValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });

      await authController.register(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(201);
      expect(responseJson).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'User registered successfully',
        })
      );
      // Should not include team in response when team creation fails
      expect(responseJson).toHaveBeenCalledWith(
        expect.not.objectContaining({
          team: expect.anything(),
        })
      );
    });

    it('should return 400 if email is missing', async () => {
      mockRequest.body = { password: 'password123' };

      await authController.register(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'Email and password are required',
      });
    });

    it('should return 400 if password is missing', async () => {
      mockRequest.body = { email: 'test@example.com' };

      await authController.register(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'Email and password are required',
      });
    });

    it('should return 400 if email format is invalid', async () => {
      mockRequest.body = {
        email: 'invalid-email',
        password: 'password123',
      };

      await authController.register(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'Invalid email format',
      });
    });

    it('should return 400 if password is too short', async () => {
      mockRequest.body = {
        email: 'test@example.com',
        password: 'short',
      };

      await authController.register(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'Password must be at least 8 characters long',
      });
    });

    it('should return 409 if email already exists', async () => {
      mockRequest.body = {
        email: 'test@example.com',
        password: 'password123',
      };

      const existingUser = { id: '123' } as any;
      mockUserService.findByEmail = jest.fn().mockResolvedValue(existingUser);

      await authController.register(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(409);
      expect(responseJson).toHaveBeenCalledWith({
        error: 'Conflict',
        message: 'Email already registered',
      });
    });

    it('normalizes a mixed-case submitted email to lowercase before calling findByEmail and createUser (so Foo@Bar.com and foo@bar.com cannot become two accounts)', async () => {
      mockRequest.body = {
        email: 'Foo@Bar.com',
        password: 'password123',
      };

      const mockUser = {
        id: 'user-x',
        email: 'foo@bar.com',
        role: 'creator',
        generateEmailVerificationToken: jest.fn().mockReturnValue({
          token: 'verification-token',
          expires: new Date(),
        }),
        toJSON: jest.fn().mockReturnValue({ id: 'user-x', email: 'foo@bar.com', role: 'creator' }),
      } as any;

      mockUserService.findByEmail = jest.fn().mockResolvedValue(null);
      mockUserService.createUser = jest.fn().mockResolvedValue(mockUser);
      mockUserService.updateEmailVerificationToken = jest.fn().mockResolvedValue(undefined);
      mockTeamService.createTeam = jest.fn().mockResolvedValue({ id: 'team-x', name: "foo's Team" });

      (tokenService.generateTokenPair as jest.Mock) = jest.fn().mockReturnValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });

      await authController.register(mockRequest as Request, mockResponse as Response);

      expect(mockUserService.findByEmail).toHaveBeenCalledWith('foo@bar.com');
      expect(mockUserService.createUser).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'foo@bar.com' })
      );
      expect(responseStatus).toHaveBeenCalledWith(201);
    });

    it('returns 409 for a case-variant of an already-registered email (findByEmail is what actually matches case-insensitively; this confirms register normalizes before checking)', async () => {
      mockRequest.body = {
        email: 'FOO@BAR.COM',
        password: 'password123',
      };

      const existingUser = { id: '123' } as any;
      mockUserService.findByEmail = jest.fn().mockResolvedValue(existingUser);

      await authController.register(mockRequest as Request, mockResponse as Response);

      expect(mockUserService.findByEmail).toHaveBeenCalledWith('foo@bar.com');
      expect(responseStatus).toHaveBeenCalledWith(409);
      expect(mockUserService.createUser).not.toHaveBeenCalled();
    });
  });

  describe('register: registration gate', () => {
    const setRegistrationEnabled = (enabled: boolean): void => {
      (authController as any).settingsService = {
        getValue: jest.fn().mockResolvedValue(enabled),
      };
    };

    const setInvitation = (invitation: any): void => {
      (authController as any).invitationService = {
        findByToken: jest.fn().mockResolvedValue(invitation),
      };
    };

    const mockSuccessfulUserCreation = (email: string, id: string): void => {
      const mockUser = {
        id,
        email,
        role: 'creator',
        generateEmailVerificationToken: jest.fn().mockReturnValue({
          token: 'verification-token',
          expires: new Date(),
        }),
        toJSON: jest.fn().mockReturnValue({ id, email, role: 'creator' }),
      } as any;

      mockUserService.findByEmail = jest.fn().mockResolvedValue(null);
      mockUserService.createUser = jest.fn().mockResolvedValue(mockUser);
      mockUserService.updateEmailVerificationToken = jest.fn().mockResolvedValue(undefined);
      mockTeamService.createTeam = jest.fn().mockResolvedValue({ id: `team-${id}`, name: "x's Team" });

      (tokenService.generateTokenPair as jest.Mock) = jest.fn().mockReturnValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
    };

    it('returns 403 before findByEmail when closed and no invitation token is present', async () => {
      setRegistrationEnabled(false);
      setInvitation(null);
      mockRequest.body = { email: 'invitee@example.com', password: 'password123' };

      await authController.register(mockRequest as Request, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(403);
      expect(responseJson).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: 'Registration is currently closed',
      });
      expect(mockUserService.findByEmail).not.toHaveBeenCalled();
    });

    it('allows registration when closed but a valid invitation token matches the submitted email', async () => {
      setRegistrationEnabled(false);
      const findByToken = jest.fn().mockResolvedValue({ email: 'invitee@example.com', isValid: () => true });
      (authController as any).invitationService = { findByToken };
      mockSuccessfulUserCreation('invitee@example.com', 'user-1');

      mockRequest.body = {
        email: 'invitee@example.com',
        password: 'password123',
        invitationToken: 'good-token',
      };

      await authController.register(mockRequest as Request, mockResponse as Response);

      expect(findByToken).toHaveBeenCalledWith('good-token');
      expect(mockUserService.createUser).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'invitee@example.com' })
      );
      expect(responseStatus).toHaveBeenCalledWith(201);
    });

    it('normalizes a mixed-case submitted email to match the (always-lowercase) invitation email, and stores it normalized', async () => {
      setRegistrationEnabled(false);
      setInvitation({ email: 'invitee@example.com', isValid: () => true });
      mockSuccessfulUserCreation('invitee@example.com', 'user-1');

      mockRequest.body = {
        email: 'Invitee@Example.com',
        password: 'password123',
        invitationToken: 'good-token',
      };

      await authController.register(mockRequest as Request, mockResponse as Response);

      expect(mockUserService.findByEmail).toHaveBeenCalledWith('invitee@example.com');
      expect(mockUserService.createUser).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'invitee@example.com' })
      );
      expect(responseStatus).toHaveBeenCalledWith(201);
    });

    it('maps a users.email unique-violation from createUser to the same 409 findByEmail() returns (race guard)', async () => {
      setRegistrationEnabled(false);
      setInvitation({ email: 'invitee@example.com', isValid: () => true });

      mockUserService.findByEmail = jest.fn().mockResolvedValue(null);
      const raceError: any = new Error('duplicate key value violates unique constraint');
      raceError.code = '23505';
      mockUserService.createUser = jest.fn().mockRejectedValue(raceError);

      mockRequest.body = {
        email: 'invitee@example.com',
        password: 'password123',
        invitationToken: 'good-token',
      };

      await authController.register(mockRequest as Request, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(409);
      expect(responseJson).toHaveBeenCalledWith({
        error: 'Conflict',
        message: 'Email already registered',
      });
    });

    it('returns 403 when closed and the invitation token is valid but issued to a different email', async () => {
      setRegistrationEnabled(false);
      setInvitation({ email: 'someone-else@example.com', isValid: () => true });

      mockRequest.body = {
        email: 'invitee@example.com',
        password: 'password123',
        invitationToken: 'good-token',
      };

      await authController.register(mockRequest as Request, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(403);
      expect(mockUserService.findByEmail).not.toHaveBeenCalled();
    });

    it('returns 403 when closed and the invitation token is expired', async () => {
      setRegistrationEnabled(false);
      // isExpired() -> isValid() false for an expired invitation.
      setInvitation({ email: 'invitee@example.com', isValid: () => false });

      mockRequest.body = {
        email: 'invitee@example.com',
        password: 'password123',
        invitationToken: 'expired-token',
      };

      await authController.register(mockRequest as Request, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(403);
    });

    it('returns 403 when closed and the invitation token has already been accepted', async () => {
      setRegistrationEnabled(false);
      // status === 'accepted' -> isValid() false.
      setInvitation({ email: 'invitee@example.com', isValid: () => false });

      mockRequest.body = {
        email: 'invitee@example.com',
        password: 'password123',
        invitationToken: 'already-accepted-token',
      };

      await authController.register(mockRequest as Request, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(403);
    });

    it('returns 403 when closed and no invitation is found for the token', async () => {
      setRegistrationEnabled(false);
      const findByToken = jest.fn().mockResolvedValue(null);
      (authController as any).invitationService = { findByToken };

      mockRequest.body = {
        email: 'invitee@example.com',
        password: 'password123',
        invitationToken: 'unknown-token',
      };

      await authController.register(mockRequest as Request, mockResponse as Response);

      expect(findByToken).toHaveBeenCalledWith('unknown-token');
      expect(responseStatus).toHaveBeenCalledWith(403);
      expect(mockUserService.createUser).not.toHaveBeenCalled();
    });

    it('allows registration regardless of invitation state when registration is open', async () => {
      setRegistrationEnabled(true);
      setInvitation(null);
      mockSuccessfulUserCreation('anyone@example.com', 'user-2');

      mockRequest.body = { email: 'anyone@example.com', password: 'password123' };

      await authController.register(mockRequest as Request, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(201);
    });
  });

  describe('login', () => {
    it('should login user successfully', async () => {
      const credentials = {
        email: 'test@example.com',
        password: 'password123',
      };

      mockRequest.body = credentials;

      const mockUser = {
        id: '123',
        email: credentials.email,
        role: 'creator',
        verifyPassword: jest.fn().mockResolvedValue(true),
        toJSON: jest.fn().mockReturnValue({
          id: '123',
          email: credentials.email,
          role: 'creator',
        }),
      } as any;

      mockUserService.findByEmail = jest.fn().mockResolvedValue(mockUser);

      (tokenService.generateTokenPair as jest.Mock) = jest.fn().mockReturnValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });

      await authController.login(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockUserService.findByEmail).toHaveBeenCalledWith(credentials.email);
      expect(mockUser.verifyPassword).toHaveBeenCalledWith(credentials.password);
      expect(responseStatus).toHaveBeenCalledWith(200);
      expect(responseJson).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Login successful',
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
        })
      );
    });

    it('should return 400 if email is missing', async () => {
      mockRequest.body = { password: 'password123' };

      await authController.login(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'Email and password are required',
      });
    });

    it('should return 401 if user not found', async () => {
      mockRequest.body = {
        email: 'test@example.com',
        password: 'password123',
      };

      mockUserService.findByEmail = jest.fn().mockResolvedValue(null);

      await authController.login(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(401);
      expect(responseJson).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Invalid email or password',
      });
    });

    it('should return 401 if password is invalid', async () => {
      mockRequest.body = {
        email: 'test@example.com',
        password: 'wrongpassword',
      };

      const mockUser = {
        id: '123',
        verifyPassword: jest.fn().mockResolvedValue(false),
      } as any;

      mockUserService.findByEmail = jest.fn().mockResolvedValue(mockUser);

      await authController.login(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(401);
      expect(responseJson).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Invalid email or password',
      });
    });

    it('stamps the mustChangePassword claim on the access token when the user is flagged', async () => {
      mockRequest.body = {
        email: 'admin@example.com',
        password: 'password123',
      };

      const mockUser = {
        id: '123',
        email: 'admin@example.com',
        role: 'admin',
        must_change_password: true,
        verifyPassword: jest.fn().mockResolvedValue(true),
        toJSON: jest.fn().mockReturnValue({
          id: '123',
          email: 'admin@example.com',
          role: 'admin',
          must_change_password: true,
        }),
      } as any;

      mockUserService.findByEmail = jest.fn().mockResolvedValue(mockUser);

      (tokenService.generateTokenPair as jest.Mock) = jest.fn().mockReturnValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });

      await authController.login(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(tokenService.generateTokenPair).toHaveBeenCalledWith(
        expect.objectContaining({ mustChangePassword: true })
      );
      expect(responseJson).toHaveBeenCalledWith(
        expect.objectContaining({ mustChangePassword: true })
      );
    });
  });

  describe('logout', () => {
    it('should logout successfully', async () => {
      await authController.logout(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(200);
      expect(responseJson).toHaveBeenCalledWith({
        message: 'Logout successful',
      });
    });
  });

  /**
   * blacklistAllUserTokens() changed from Promise<void> to Promise<boolean>
   * (registration-gate item 2.5, so the admin revoke-sessions endpoint can
   * distinguish a real failure from success). logoutAll is one of the two
   * pre-existing, fire-and-forget callers (the other is changePassword,
   * below) that must keep ignoring the return value - these tests confirm
   * a resolved `false` (a *handled* best-effort failure, not a throw)
   * changes nothing about the response.
   */
  describe('logoutAll', () => {
    beforeEach(() => {
      (mockRequest as any).user = { userId: '123' };
    });

    it('returns 401 when there is no authenticated user on the request', async () => {
      (mockRequest as any).user = undefined;

      await authController.logoutAll(mockRequest as Request, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(401);
      expect(tokenBlacklistService.blacklistAllUserTokens).not.toHaveBeenCalled();
    });

    it('returns 200 when blacklistAllUserTokens resolves true', async () => {
      (tokenBlacklistService.blacklistAllUserTokens as jest.Mock).mockResolvedValueOnce(true);

      await authController.logoutAll(mockRequest as Request, mockResponse as Response);

      expect(tokenBlacklistService.blacklistAllUserTokens).toHaveBeenCalledWith('123');
      expect(responseStatus).toHaveBeenCalledWith(200);
      expect(responseJson).toHaveBeenCalledWith({
        message: 'Successfully logged out from all devices',
      });
    });

    it('still returns 200 when blacklistAllUserTokens resolves false (ignores the boolean - unchanged fire-and-forget behavior)', async () => {
      (tokenBlacklistService.blacklistAllUserTokens as jest.Mock).mockResolvedValueOnce(false);

      await authController.logoutAll(mockRequest as Request, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(200);
      expect(responseJson).toHaveBeenCalledWith({
        message: 'Successfully logged out from all devices',
      });
    });

    it('returns 500 if blacklistAllUserTokens throws unexpectedly', async () => {
      (tokenBlacklistService.blacklistAllUserTokens as jest.Mock).mockRejectedValueOnce(
        new Error('used before init')
      );

      await authController.logoutAll(mockRequest as Request, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(500);
      expect(responseJson).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'Failed to logout from all devices',
      });
    });
  });

  describe('refresh', () => {
    it('should refresh token successfully', async () => {
      mockRequest.body = { refreshToken: 'valid-refresh-token' };

      const mockUser = {
        id: '123',
        email: 'test@example.com',
        role: 'creator',
      } as any;

      (tokenService.verifyRefreshToken as jest.Mock) = jest.fn().mockReturnValue({
        userId: '123',
        email: 'test@example.com',
        role: 'creator',
      });

      mockUserService.findById = jest.fn().mockResolvedValue(mockUser);

      (tokenService.generateAccessToken as jest.Mock) = jest.fn().mockReturnValue('new-access-token');

      await authController.refresh(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(tokenService.verifyRefreshToken).toHaveBeenCalledWith('valid-refresh-token');
      expect(mockUserService.findById).toHaveBeenCalledWith('123');
      expect(responseStatus).toHaveBeenCalledWith(200);
      expect(responseJson).toHaveBeenCalledWith({
        message: 'Token refreshed successfully',
        accessToken: 'new-access-token',
      });
    });

    it('should return 400 if refresh token is missing', async () => {
      mockRequest.body = {};

      await authController.refresh(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'Refresh token is required',
      });
    });

    it('should return 401 if refresh token is invalid', async () => {
      mockRequest.body = { refreshToken: 'invalid-token' };

      (tokenService.verifyRefreshToken as jest.Mock) = jest.fn().mockImplementation(() => {
        throw new Error('Invalid refresh token');
      });

      await authController.refresh(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(401);
      expect(responseJson).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Invalid refresh token',
      });
    });

    it('re-derives the mustChangePassword claim from the DB user, not the refresh token', async () => {
      mockRequest.body = { refreshToken: 'valid-refresh-token' };

      // The presented refresh token has no claim...
      (tokenService.verifyRefreshToken as jest.Mock) = jest.fn().mockReturnValue({
        userId: '123',
        email: 'admin@example.com',
        role: 'admin',
        jti: 'refresh-jti-1',
        iat: Math.floor(Date.now() / 1000),
      });

      // ...but the current DB state says the user is flagged.
      const mockUser = {
        id: '123',
        email: 'admin@example.com',
        role: 'admin',
        must_change_password: true,
      } as any;
      mockUserService.findById = jest.fn().mockResolvedValue(mockUser);

      (tokenService.generateAccessToken as jest.Mock) = jest.fn().mockReturnValue('new-access-token');

      await authController.refresh(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(tokenService.generateAccessToken).toHaveBeenCalledWith(
        expect.objectContaining({ mustChangePassword: true })
      );
      expect(responseStatus).toHaveBeenCalledWith(200);
    });

    it('does not stamp the claim when the DB user is not flagged, even if requested', async () => {
      mockRequest.body = { refreshToken: 'valid-refresh-token' };

      (tokenService.verifyRefreshToken as jest.Mock) = jest.fn().mockReturnValue({
        userId: '123',
        email: 'user@example.com',
        role: 'creator',
        jti: 'refresh-jti-2',
        iat: Math.floor(Date.now() / 1000),
      });

      const mockUser = {
        id: '123',
        email: 'user@example.com',
        role: 'creator',
        must_change_password: false,
      } as any;
      mockUserService.findById = jest.fn().mockResolvedValue(mockUser);

      (tokenService.generateAccessToken as jest.Mock) = jest.fn().mockReturnValue('new-access-token');

      await authController.refresh(
        mockRequest as Request,
        mockResponse as Response
      );

      const callArg = (tokenService.generateAccessToken as jest.Mock).mock.calls[0]?.[0];
      expect(callArg.mustChangePassword).toBeUndefined();
    });

    it('rejects a blacklisted refresh token with 401 and does not mint a new access token', async () => {
      mockRequest.body = { refreshToken: 'blacklisted-refresh-token' };

      (tokenService.verifyRefreshToken as jest.Mock) = jest.fn().mockReturnValue({
        userId: '123',
        email: 'admin@example.com',
        role: 'admin',
        jti: 'revoked-jti',
        iat: Math.floor(Date.now() / 1000),
      });

      (tokenBlacklistService.isBlacklisted as jest.Mock).mockResolvedValueOnce(true);

      await authController.refresh(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(401);
      expect(responseJson).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Refresh token has been revoked',
      });
      expect(mockUserService.findById).not.toHaveBeenCalled();
      expect(tokenService.generateAccessToken).not.toHaveBeenCalled();
    });

    it('fails closed with 401 when the revocation check throws unexpectedly, instead of minting a new access token', async () => {
      mockRequest.body = { refreshToken: 'valid-refresh-token' };

      (tokenService.verifyRefreshToken as jest.Mock) = jest.fn().mockReturnValue({
        userId: '123',
        email: 'admin@example.com',
        role: 'admin',
        jti: 'jti-1',
        iat: Math.floor(Date.now() / 1000),
      });

      // The service's read methods fail closed internally on query errors
      // (they return true, not throw). A throw here models the one case
      // that still reaches this catch: an unexpected failure such as the
      // service being used before init().
      (tokenBlacklistService.isBlacklisted as jest.Mock).mockRejectedValueOnce(
        new Error('TokenBlacklistService used before init(pool) was called')
      );

      await authController.refresh(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(401);
      expect(responseJson).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Unable to verify token revocation status',
      });
      expect(mockUserService.findById).not.toHaveBeenCalled();
      expect(tokenService.generateAccessToken).not.toHaveBeenCalled();
    });
  });

  describe('changePassword', () => {
    beforeEach(() => {
      // Add userId to request (simulating authenticate middleware)
      (mockRequest as any).user = { userId: '123' };
    });

    /**
     * changePassword() waits out the remainder of the current wall-clock
     * second (waitPastCurrentSecond()) between revoking existing tokens and
     * minting new ones -- see that function's doc comment in
     * authController.ts for why (tokenBlacklistService's inclusive
     * `iat <= revoked_at` comparison would otherwise treat the freshly
     * minted tokens as revoked on arrival, since both land in the same
     * floored second in the overwhelming majority of calls). Use fake
     * timers so these tests don't burn ~0.5-1s of real wall-clock time each.
     */
    const runChangePasswordWithFakeTimers = async (): Promise<void> => {
      const promise = authController.changePassword(
        mockRequest as Request,
        mockResponse as Response
      );
      await jest.advanceTimersByTimeAsync(1100); // > worst-case 1050ms wait
      await promise;
    };

    it('clears the must_change_password flag and mints tokens without the claim', async () => {
      jest.useFakeTimers();
      mockRequest.body = {
        currentPassword: 'OldPassword123',
        newPassword: 'NewPassword456',
      };

      const mockUser = {
        id: '123',
        email: 'admin@example.com',
        role: 'admin',
        must_change_password: true,
        verifyPassword: jest.fn().mockResolvedValue(true),
      } as any;

      mockUserService.findById = jest.fn().mockResolvedValue(mockUser);
      mockUserService.updatePassword = jest.fn().mockResolvedValue(undefined);
      mockUserService.clearMustChangePassword = jest.fn().mockResolvedValue(undefined);

      (tokenService.generateTokenPair as jest.Mock) = jest.fn().mockReturnValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });

      await runChangePasswordWithFakeTimers();
      jest.useRealTimers();

      expect(mockUserService.clearMustChangePassword).toHaveBeenCalledWith('123');
      // Explicitly omitted, not read from the stale pre-update in-memory user.
      const callArg = (tokenService.generateTokenPair as jest.Mock).mock.calls[0]?.[0];
      expect(callArg.mustChangePassword).toBeUndefined();
      expect(responseStatus).toHaveBeenCalledWith(200);
      expect(responseJson).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
        })
      );
    });

    it('waits past the current second before minting tokens (so they are not born-revoked)', async () => {
      jest.useFakeTimers();
      mockRequest.body = {
        currentPassword: 'OldPassword123',
        newPassword: 'NewPassword456',
      };

      const mockUser = {
        id: '123',
        email: 'test@example.com',
        role: 'creator',
        verifyPassword: jest.fn().mockResolvedValue(true),
      } as any;

      mockUserService.findById = jest.fn().mockResolvedValue(mockUser);
      mockUserService.updatePassword = jest.fn().mockResolvedValue(undefined);

      (tokenService.generateTokenPair as jest.Mock) = jest.fn().mockReturnValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });

      const promise = authController.changePassword(
        mockRequest as Request,
        mockResponse as Response
      );

      // Let microtasks (bcrypt verify, the two DB writes, the revoke call)
      // drain, but not the fake timer itself: minting must not have
      // happened yet.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(tokenService.generateTokenPair).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(1100);
      await promise;
      jest.useRealTimers();

      expect(tokenService.generateTokenPair).toHaveBeenCalled();
      expect(responseStatus).toHaveBeenCalledWith(200);
    });

    it('still succeeds (does not 500) when revoking existing tokens fails (blacklist store down)', async () => {
      jest.useFakeTimers();
      mockRequest.body = {
        currentPassword: 'OldPassword123',
        newPassword: 'NewPassword456',
      };

      const mockUser = {
        id: '123',
        email: 'test@example.com',
        role: 'creator',
        must_change_password: false,
        verifyPassword: jest.fn().mockResolvedValue(true),
      } as any;

      mockUserService.findById = jest.fn().mockResolvedValue(mockUser);
      mockUserService.updatePassword = jest.fn().mockResolvedValue(undefined);
      mockUserService.clearMustChangePassword = jest.fn().mockResolvedValue(undefined);

      (tokenBlacklistService.blacklistAllUserTokens as jest.Mock).mockRejectedValueOnce(
        new Error('connection refused')
      );

      (tokenService.generateTokenPair as jest.Mock) = jest.fn().mockReturnValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });

      await runChangePasswordWithFakeTimers();
      jest.useRealTimers();

      expect(mockUserService.updatePassword).toHaveBeenCalledWith('123', 'NewPassword456');
      expect(responseStatus).toHaveBeenCalledWith(200);
      expect(responseJson).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Password changed successfully',
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
        })
      );
    });

    it('still succeeds identically when blacklistAllUserTokens resolves false (a handled best-effort failure, not a throw) - changePassword ignores the boolean return value', async () => {
      jest.useFakeTimers();
      mockRequest.body = {
        currentPassword: 'OldPassword123',
        newPassword: 'NewPassword456',
      };

      const mockUser = {
        id: '123',
        email: 'test@example.com',
        role: 'creator',
        must_change_password: false,
        verifyPassword: jest.fn().mockResolvedValue(true),
      } as any;

      mockUserService.findById = jest.fn().mockResolvedValue(mockUser);
      mockUserService.updatePassword = jest.fn().mockResolvedValue(undefined);
      mockUserService.clearMustChangePassword = jest.fn().mockResolvedValue(undefined);

      // Resolves false rather than rejecting - the new possibility this
      // method's Promise<void> -> Promise<boolean> change introduced.
      // Since changePassword never inspects the return value (only whether
      // the call threw), this must take the exact same path as a `true`
      // resolution: no throw reaches the catch block below, so
      // waitPastCurrentSecond() must still run before tokens are minted.
      (tokenBlacklistService.blacklistAllUserTokens as jest.Mock).mockResolvedValueOnce(false);

      (tokenService.generateTokenPair as jest.Mock) = jest.fn().mockReturnValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });

      const promise = authController.changePassword(
        mockRequest as Request,
        mockResponse as Response
      );

      // Drain microtasks (bcrypt verify, the two DB writes, the revoke
      // call) but not the fake timer - minting must not have happened yet,
      // proving the `false` resolution still took the wait branch (a
      // regression that mistakenly treated "resolved false" like a throw
      // would skip both the wait and this assertion would already be
      // satisfied trivially).
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(tokenService.generateTokenPair).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(1100);
      await promise;
      jest.useRealTimers();

      expect(mockUserService.updatePassword).toHaveBeenCalledWith('123', 'NewPassword456');
      expect(responseStatus).toHaveBeenCalledWith(200);
      expect(responseJson).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Password changed successfully',
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
        })
      );
    });

    it('should change password successfully', async () => {
      jest.useFakeTimers();
      mockRequest.body = {
        currentPassword: 'OldPassword123',
        newPassword: 'NewPassword456',
      };

      const mockUser = {
        id: '123',
        email: 'test@example.com',
        role: 'creator',
        verifyPassword: jest.fn().mockResolvedValue(true),
      } as any;

      mockUserService.findById = jest.fn().mockResolvedValue(mockUser);
      mockUserService.updatePassword = jest.fn().mockResolvedValue(undefined);

      (tokenService.generateTokenPair as jest.Mock) = jest.fn().mockReturnValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });

      await runChangePasswordWithFakeTimers();
      jest.useRealTimers();

      expect(mockUserService.findById).toHaveBeenCalledWith('123');
      expect(mockUser.verifyPassword).toHaveBeenCalledWith('OldPassword123');
      expect(mockUserService.updatePassword).toHaveBeenCalledWith('123', 'NewPassword456');
      expect(responseStatus).toHaveBeenCalledWith(200);
      expect(responseJson).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Password changed successfully',
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
        })
      );
    });

    it('should return 401 if user is not authenticated', async () => {
      delete (mockRequest as any).user;
      mockRequest.body = {
        currentPassword: 'OldPassword123',
        newPassword: 'NewPassword456',
      };

      await authController.changePassword(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(401);
      expect(responseJson).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    });

    it('should return 400 if current password is missing', async () => {
      mockRequest.body = {
        newPassword: 'NewPassword456',
      };

      await authController.changePassword(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'Current password and new password are required',
      });
    });

    it('should return 400 if new password is missing', async () => {
      mockRequest.body = {
        currentPassword: 'OldPassword123',
      };

      await authController.changePassword(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'Current password and new password are required',
      });
    });

    it('should return 400 if current password is incorrect', async () => {
      mockRequest.body = {
        currentPassword: 'WrongPassword123',
        newPassword: 'NewPassword456',
      };

      const mockUser = {
        id: '123',
        verifyPassword: jest.fn().mockResolvedValue(false),
      } as any;

      mockUserService.findById = jest.fn().mockResolvedValue(mockUser);

      await authController.changePassword(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'Current password is incorrect',
      });
    });

    it('should return 400 if new password does not meet requirements', async () => {
      mockRequest.body = {
        currentPassword: 'OldPassword123',
        newPassword: 'weak', // Too short, no uppercase, no number
      };

      const mockUser = {
        id: '123',
        email: 'test@example.com',
        role: 'creator',
        verifyPassword: jest.fn().mockResolvedValue(true),
      } as any;

      mockUserService.findById = jest.fn().mockResolvedValue(mockUser);

      await authController.changePassword(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'New password does not meet requirements',
        errors: expect.arrayContaining([
          'Password must be at least 8 characters long',
          'Password must contain at least one uppercase letter',
          'Password must contain at least one number',
        ]),
      });
    });

    it('should return 400 if new password is same as current password', async () => {
      mockRequest.body = {
        currentPassword: 'SamePassword123',
        newPassword: 'SamePassword123',
      };

      const mockUser = {
        id: '123',
        email: 'test@example.com',
        role: 'creator',
        verifyPassword: jest.fn().mockResolvedValue(true),
      } as any;

      mockUserService.findById = jest.fn().mockResolvedValue(mockUser);

      await authController.changePassword(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'New password must be different from current password',
      });
    });

    it('should return 404 if user not found', async () => {
      mockRequest.body = {
        currentPassword: 'OldPassword123',
        newPassword: 'NewPassword456',
      };

      mockUserService.findById = jest.fn().mockResolvedValue(null);

      await authController.changePassword(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(404);
      expect(responseJson).toHaveBeenCalledWith({
        error: 'Not Found',
        message: 'User not found',
      });
    });
  });
});
