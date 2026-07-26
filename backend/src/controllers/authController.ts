import { Request, Response } from 'express';
import { Pool } from 'pg';
import { UserService } from '@/services/userService';
import { TeamService } from '@/services/teamService';
import { EmailService } from '@/services/emailService';
import { TwoFactorService } from '@/services/twoFactorService';
import { getSettingsService, SettingsService } from '@/services/settingsService';
import { InvitationService } from '@/services/invitationService';
import { tokenService } from '@/services/tokenService';
import { tokenBlacklistService } from '@/services/tokenBlacklistService';
import logger from '@/services/loggerService';

/**
 * Wait out the remainder of the current wall-clock second, plus a small
 * scheduling-jitter buffer.
 *
 * Why this exists: tokenBlacklistService.isUserSessionRevoked() compares
 * `iat <= floor(revoked_at)` -- inclusive, at whole-second granularity, by
 * design (see the tokenBlacklistService revocation-tables migration /
 * plan decision on closing the same-second revocation race). JWT `iat` is
 * also whole-second. So a token minted immediately after
 * blacklistAllUserTokens() writes `revoked_at = now()` will, in the
 * overwhelming majority of calls, land on the *same* floored second as
 * that revocation and be treated as revoked on arrival -- i.e. changePassword
 * would silently hand back access/refresh tokens that fail on their very
 * first use. Waiting past the current second guarantees the new tokens'
 * `iat` is strictly later than the revocation's floored second, without
 * loosening the revocation check itself (which still needs to catch other,
 * genuinely stale sessions issued in that same second).
 *
 * The +50ms is a buffer for event-loop/setTimeout scheduling jitter between
 * this wait and the subsequent tokenService call, NOT for clock skew:
 * `revoked_at` is stamped by Postgres's clock (`now()`) and `iat` by the
 * app process's clock (jsonwebtoken's own `Date.now()`), and this buffer is
 * far too small to cover any real drift between the two. In practice this
 * is safe because same-host docker-compose and cloud-managed Postgres
 * deployments keep both clocks NTP-synced. If app/DB clocks were to drift
 * by more than ~50ms in a given deployment, the symptom would be
 * newly-issued tokens intermittently born-revoked right after
 * change-password (not a security gap -- the fail-closed revocation check
 * would just be more aggressive than intended).
 */
export const waitPastCurrentSecond = async (): Promise<void> => {
  const msRemaining = 1000 - (Date.now() % 1000) + 50; // +50ms buffer for scheduling jitter, not clock skew
  await new Promise((resolve) => setTimeout(resolve, msRemaining));
};

// Temporary token storage for 2FA login flow. Deliberately in-process (no
// Redis/external store): EzSign is Postgres-only and single-instance by
// design — see docs/plans/2026-07-22-remove-redis-postgres-only-r2.md
// decision 12. Scaling to multiple instances would break this.
const twoFactorPendingLogins = new Map<string, { userId: string; email: string; role: string; expiresAt: number }>();

// Clean up expired pending logins periodically
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of twoFactorPendingLogins.entries()) {
    if (data.expiresAt < now) {
      twoFactorPendingLogins.delete(token);
    }
  }
}, 60000); // Clean up every minute

export class AuthController {
  private userService: UserService;
  private teamService: TeamService;
  private emailService: EmailService | null;
  private twoFactorService: TwoFactorService;
  private settingsService: SettingsService;
  private invitationService: InvitationService;

  constructor(pool: Pool, emailService?: EmailService) {
    this.userService = new UserService(pool);
    this.teamService = new TeamService(pool);
    this.emailService = emailService || null;
    this.twoFactorService = new TwoFactorService(pool);
    this.settingsService = getSettingsService(pool);
    this.invitationService = new InvitationService(pool);
  }

  /**
   * Register a new user
   * POST /api/auth/register
   */
  register = async (req: Request, res: Response): Promise<void> => {
    try {
      // Single normalization point (registration-gate item 2 fix A1): the
      // exemption check below, the findByEmail() duplicate check, and
      // createUser() must all see the exact same value, or a case variant
      // of an address authorized by an invitation (e.g. `Foo@bar.com` vs
      // `foo@bar.com`) bypasses both the exemption's email match and the
      // 409 duplicate check -- `users.email` is a plain `varchar(255)
      // UNIQUE`, byte comparison, no `citext`. This lowercases every
      // registration's email, not just invited ones -- a deliberate
      // behaviour change (see PR notes).
      const email = String(req.body?.email ?? '').trim().toLowerCase();
      const { password, invitationToken } = req.body;

      // Registration gate (items 2.2/2.3 of the registration-gate plan).
      // The literal first check in the handler -- before any other
      // validation, and critically before findByEmail() below, whose
      // 409-vs-other differential is a live user-enumeration oracle that
      // gating after it would keep exposed even with registration closed.
      // getValue() resolves fresh on every call (no cache -- see
      // SettingsService), so flipping the toggle takes effect without a
      // restart, and registration.enabled has no env fallback (see
      // settingsService.ts), so this can only come from the DB or the
      // closed-by-default default value.
      const registrationEnabled =
        (await this.settingsService.getValue('registration.enabled')) === true;
      if (!registrationEnabled) {
        const exempt = await this.hasInvitationExemption(invitationToken, email);
        if (!exempt) {
          res.status(403).json({
            error: 'Forbidden',
            message: 'Registration is currently closed',
          });
          return;
        }
      }

      // Validate input
      if (!email || !password) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Email and password are required',
        });
        return;
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid email format',
        });
        return;
      }

      // Validate password length
      if (password.length < 8) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Password must be at least 8 characters long',
        });
        return;
      }

      // Check if email already exists
      const existingUser = await this.userService.findByEmail(email);
      if (existingUser) {
        res.status(409).json({
          error: 'Conflict',
          message: 'Email already registered',
        });
        return;
      }

      // Create user. Role is always server-assigned — never trust a client-supplied
      // role. Admin accounts are provisioned out-of-band (seed/CLI), not via public registration.
      //
      // The invitation exemption above deliberately does NOT consume the
      // invitation (see hasInvitationExemption's doc) - the race it would
      // otherwise leave open (two concurrent registrations racing the same
      // exemption) is closed here instead, by the `users.email` UNIQUE
      // constraint: only one of two concurrent inserts for the same
      // (now-normalized) email can succeed, and the loser's unique
      // violation is mapped to the same 409 findByEmail() returns above,
      // rather than surfacing as a raw 500.
      let user;
      try {
        user = await this.userService.createUser({
          email,
          password,
          role: 'creator',
        });
      } catch (createUserError) {
        if (this.isDuplicateEmailError(createUserError)) {
          res.status(409).json({
            error: 'Conflict',
            message: 'Email already registered',
          });
          return;
        }
        throw createUserError;
      }

      // Auto-create a personal team for the new user
      let team;
      try {
        const teamName = user.email.split('@')[0] + "'s Team";
        team = await this.teamService.createTeam({
          name: teamName,
          owner_id: user.id,
        });
      } catch (teamError) {
        logger.warn('Failed to create personal team for new user', { error: (teamError as Error).message, userId: user.id, correlationId: req.correlationId });
        // Don't fail registration if team creation fails
      }

      // Generate email verification token
      const { token, expires } = user.generateEmailVerificationToken();
      await this.userService.updateEmailVerificationToken(
        user.id,
        token,
        expires
      );

      // Send verification email
      if (this.emailService) {
        try {
          await this.emailService.sendEmailVerification({
            recipientEmail: user.email,
            recipientName: user.email.split('@')[0] || user.email, // Use email prefix as name
            verificationToken: token,
          });
        } catch (emailError) {
          logger.warn('Failed to send verification email', { error: (emailError as Error).message, email, correlationId: req.correlationId });
          // Don't fail registration if email fails
        }
      }

      // In development, also return the token for testing
      const verificationInfo =
        process.env.NODE_ENV === 'development'
          ? { verification_token: token }
          : {};

      // Generate tokens
      const tokens = tokenService.generateTokenPair({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      res.status(201).json({
        message: 'User registered successfully',
        user: user.toJSON(),
        ...(team ? { team: { id: team.id, name: team.name } } : {}),
        ...tokens,
        ...verificationInfo,
      });
    } catch (error) {
      logger.error('Registration error', { error: (error as Error).message, stack: (error as Error).stack, correlationId: req.correlationId });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to register user',
      });
    }
  };

  /**
   * Registration-gate exemption (item 2.3): with the global toggle off, a
   * still-valid team invitation whose email matches the submitted address
   * is still allowed to register -- otherwise closing registration would
   * permanently strand the team-invite feature (routes, emails, controller,
   * and page all shipped; InvitationService.accept() never creates a user,
   * so an un-registerable invitee has no way to onboard). Reuses
   * InvitationService's existing token lookup and
   * TeamInvitation.isValid() (status === 'pending' && !isExpired()) rather
   * than a second, differently-scoped query.
   *
   * A missing/malformed token, an unknown token, an expired one, an
   * already-accepted one, and an email mismatch are all indistinguishable
   * to the caller (all resolve to `false`, and the caller returns the same
   * 403 for all of them) -- otherwise a leaked invitation token could be
   * used to probe which invitations exist or which email each targets.
   *
   * Deliberately does NOT mark the invitation consumed. Any status change
   * (accepted/cancelled/etc.) would make TeamInvitation.canAccept() false,
   * which would break the very next step of the flow this exists to
   * unstrand: register() returns a live session, and the invited user's
   * browser is expected to hit the authenticated `POST
   * /invitations/:token/accept` moments later to actually join the team
   * (that endpoint - not this one - is the one that's supposed to add the
   * team_members row). Consuming the invitation here would leave the user
   * with an account but no way to ever join the team it was for.
   *
   * The exemption is instead bounded by the caller (register()) mapping a
   * `users.email` UNIQUE-constraint violation to the same 409 findByEmail()
   * returns for a pre-existing account: since the exemption only ever
   * authorizes the one address on the invitation, and every registration
   * for that address (this one included) stores the same normalized email,
   * at most one account can ever exist for it at a time. See the caller's
   * comment and the implementation report for the residual this leaves
   * (an invitation stays usable again if that one account is later
   * deleted) and why that's an accepted, narrower scope than "single-use".
   */
  private async hasInvitationExemption(
    invitationToken: unknown,
    normalizedEmail: string
  ): Promise<boolean> {
    if (typeof invitationToken !== 'string' || invitationToken.length === 0) {
      return false;
    }

    // TeamInvitation.generateToken() always produces 64 hex chars; req.body
    // is read from a much larger (50 MB) body-size limit, so bound the
    // value before it reaches `WHERE token = $1` in findByToken().
    if (invitationToken.length > 128) {
      return false;
    }

    const invitation = await this.invitationService.findByToken(invitationToken);
    if (!invitation || !invitation.isValid()) {
      return false;
    }

    return normalizedEmail.length > 0 && invitation.email === normalizedEmail;
  }

  /**
   * True for a Postgres unique-violation error (SQLSTATE 23505) - the
   * shape node-postgres surfaces for a concurrent `INSERT` racing the
   * `users.email` UNIQUE constraint. Used by register() to map the loser of
   * that race to the same 409 findByEmail() returns for a pre-existing
   * account, instead of a generic 500.
   */
  private isDuplicateEmailError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: string }).code === '23505'
    );
  }

  /**
   * Verify email with token
   * POST /api/auth/verify-email
   */
  verifyEmail = async (req: Request, res: Response): Promise<void> => {
    try {
      const { token } = req.body;

      // Validate input
      if (!token) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Verification token is required',
        });
        return;
      }

      // Find user by verification token
      const query = `
        SELECT id, email, password_hash, role, email_verified,
               email_verification_token, email_verification_expires,
               password_reset_token, password_reset_expires,
               created_at, updated_at
        FROM users
        WHERE email_verification_token = $1
      `;

      const result = await this.userService['pool'].query(query, [token]);

      if (result.rows.length === 0) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid verification token',
        });
        return;
      }

      const userData = result.rows[0];

      // Check if token has expired
      if (
        !userData.email_verification_expires ||
        new Date() > new Date(userData.email_verification_expires)
      ) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Verification token has expired',
        });
        return;
      }

      // Check if email is already verified
      if (userData.email_verified) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Email is already verified',
        });
        return;
      }

      // Mark email as verified
      await this.userService.markEmailVerified(userData.id);

      res.status(200).json({
        message: 'Email verified successfully',
      });
    } catch (error) {
      logger.error('Email verification error', { error: (error as Error).message, stack: (error as Error).stack, correlationId: req.correlationId });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to verify email',
      });
    }
  };

  /**
   * Login user
   * POST /api/auth/login
   */
  login = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password } = req.body;

      // Validate input
      if (!email || !password) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Email and password are required',
        });
        return;
      }

      // Find user by email
      const user = await this.userService.findByEmail(email);

      if (!user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid email or password',
        });
        return;
      }

      // Verify password
      const isValidPassword = await user.verifyPassword(password);

      if (!isValidPassword) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid email or password',
        });
        return;
      }

      // Check if 2FA is enabled for this user
      const twoFactorEnabled = await this.twoFactorService.isEnabled(user.id);

      if (twoFactorEnabled) {
        // Generate a temporary token for the 2FA flow
        const crypto = await import('crypto');
        const twoFactorToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

        // Store pending login
        twoFactorPendingLogins.set(twoFactorToken, {
          userId: user.id,
          email: user.email,
          role: user.role,
          expiresAt,
        });

        res.status(200).json({
          twoFactorRequired: true,
          twoFactorToken,
          userId: user.id,
          message: 'Two-factor authentication required',
        });
        return;
      }

      // Generate tokens (no 2FA required)
      const tokens = tokenService.generateTokenPair({
        userId: user.id,
        email: user.email,
        role: user.role,
        ...(user.must_change_password && { mustChangePassword: true }),
      });

      res.status(200).json({
        message: 'Login successful',
        user: user.toJSON(),
        mustChangePassword: user.must_change_password,
        ...tokens,
      });
    } catch (error) {
      logger.error('Login error', { error: (error as Error).message, stack: (error as Error).stack, correlationId: req.correlationId });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to login',
      });
    }
  };

  /**
   * Complete login with 2FA verification
   * POST /api/auth/verify-2fa
   */
  verify2fa = async (req: Request, res: Response): Promise<void> => {
    try {
      const { twoFactorToken, code, isBackupCode } = req.body;

      if (!twoFactorToken || !code) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Two-factor token and code are required',
        });
        return;
      }

      // Get pending login data
      const pendingLogin = twoFactorPendingLogins.get(twoFactorToken);

      if (!pendingLogin) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid or expired two-factor token. Please login again.',
        });
        return;
      }

      // Check if token has expired
      if (pendingLogin.expiresAt < Date.now()) {
        twoFactorPendingLogins.delete(twoFactorToken);
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Two-factor token has expired. Please login again.',
        });
        return;
      }

      // Verify the 2FA code
      let isValid: boolean;
      if (isBackupCode) {
        isValid = await this.twoFactorService.verifyBackupCode(pendingLogin.userId, code);
      } else {
        isValid = await this.twoFactorService.verify(pendingLogin.userId, code);
      }

      if (!isValid) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid verification code',
        });
        return;
      }

      // Remove the pending login
      twoFactorPendingLogins.delete(twoFactorToken);

      // Get fresh user data
      const user = await this.userService.findById(pendingLogin.userId);

      if (!user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'User not found',
        });
        return;
      }

      // Generate tokens
      const tokens = tokenService.generateTokenPair({
        userId: user.id,
        email: user.email,
        role: user.role,
        ...(user.must_change_password && { mustChangePassword: true }),
      });

      res.status(200).json({
        message: 'Login successful',
        user: user.toJSON(),
        mustChangePassword: user.must_change_password,
        ...tokens,
      });
    } catch (error) {
      const errorMessage = (error as Error).message;

      if (errorMessage.includes('locked')) {
        res.status(429).json({
          error: 'Too Many Requests',
          message: errorMessage,
        });
        return;
      }

      logger.error('2FA verification error', { error: errorMessage, stack: (error as Error).stack, correlationId: req.correlationId });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to verify two-factor authentication',
      });
    }
  };

  /**
   * Logout user
   * POST /api/auth/logout
   *
   * Blacklists the current access token so it can no longer be used.
   */
  logout = async (req: Request, res: Response): Promise<void> => {
    try {
      const token = tokenService.extractTokenFromHeader(req.headers.authorization);

      if (token) {
        // Decode the token to get jti and expiry
        const decoded = tokenService.decodeToken(token);

        if (decoded && decoded.jti) {
          // Calculate remaining TTL for the token
          const now = Math.floor(Date.now() / 1000);
          const expiresIn = decoded.exp - now;

          if (expiresIn > 0) {
            // Blacklist the token for its remaining lifetime
            await tokenBlacklistService.blacklistToken(decoded.jti, expiresIn);
            logger.info('Token blacklisted on logout', {
              userId: decoded.userId,
              jti: decoded.jti,
              correlationId: req.correlationId,
            });
          }
        }
      }

      res.status(200).json({
        message: 'Logout successful',
      });
    } catch (error) {
      logger.error('Logout error', { error: (error as Error).message, stack: (error as Error).stack, correlationId: req.correlationId });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to logout',
      });
    }
  };

  /**
   * Logout user from all devices/sessions
   * POST /api/auth/logout-all
   *
   * Revokes all tokens for the authenticated user by setting a revocation timestamp.
   * Any token issued before this timestamp will be considered invalid.
   * Requires authentication.
   */
  logoutAll = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;

      if (!userId) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      // Revoke all tokens for this user
      await tokenBlacklistService.blacklistAllUserTokens(userId);

      logger.info('All user tokens revoked', {
        userId,
        correlationId: req.correlationId,
      });

      res.status(200).json({
        message: 'Successfully logged out from all devices',
      });
    } catch (error) {
      logger.error('Logout all error', { error: (error as Error).message, stack: (error as Error).stack, correlationId: req.correlationId });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to logout from all devices',
      });
    }
  };

  /**
   * Request password reset
   * POST /api/auth/forgot-password
   */
  forgotPassword = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email } = req.body;

      // Validate input
      if (!email) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Email is required',
        });
        return;
      }

      // Find user by email
      const user = await this.userService.findByEmail(email);

      // Always return success even if user doesn't exist (security best practice)
      // This prevents user enumeration attacks
      if (!user) {
        res.status(200).json({
          message: 'If the email exists, a password reset link has been sent',
        });
        return;
      }

      // Generate password reset token
      const { token, expires } = user.generatePasswordResetToken();
      await this.userService.updatePasswordResetToken(user.id, token, expires);

      // TODO: Send password reset email (will be implemented in email service task)
      // For now, just return the token in development
      const resetInfo =
        process.env.NODE_ENV === 'development'
          ? { reset_token: token }
          : {};

      res.status(200).json({
        message: 'If the email exists, a password reset link has been sent',
        ...resetInfo,
      });
    } catch (error) {
      logger.error('Forgot password error', { error: (error as Error).message, stack: (error as Error).stack, correlationId: req.correlationId });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to process password reset request',
      });
    }
  };

  /**
   * Reset password with token
   * POST /api/auth/reset-password
   */
  resetPassword = async (req: Request, res: Response): Promise<void> => {
    try {
      const { token, password } = req.body;

      // Validate input
      if (!token || !password) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Token and new password are required',
        });
        return;
      }

      // Validate password length
      if (password.length < 8) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Password must be at least 8 characters long',
        });
        return;
      }

      // Find user by reset token
      const query = `
        SELECT id, email, password_hash, role, email_verified,
               email_verification_token, email_verification_expires,
               password_reset_token, password_reset_expires,
               created_at, updated_at
        FROM users
        WHERE password_reset_token = $1
      `;

      const result = await this.userService['pool'].query(query, [token]);

      if (result.rows.length === 0) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid or expired reset token',
        });
        return;
      }

      const userData = result.rows[0];

      // Check if token has expired
      if (
        !userData.password_reset_expires ||
        new Date() > new Date(userData.password_reset_expires)
      ) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Reset token has expired',
        });
        return;
      }

      // Update password
      await this.userService.updatePassword(userData.id, password);

      res.status(200).json({
        message: 'Password reset successfully',
      });
    } catch (error) {
      logger.error('Reset password error', { error: (error as Error).message, stack: (error as Error).stack, correlationId: req.correlationId });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to reset password',
      });
    }
  };

  /**
   * Refresh access token using refresh token
   * POST /api/auth/refresh
   */
  refresh = async (req: Request, res: Response): Promise<void> => {
    try {
      const { refreshToken } = req.body;

      // Validate input
      if (!refreshToken) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Refresh token is required',
        });
        return;
      }

      // Verify refresh token
      let decoded;
      try {
        decoded = tokenService.verifyRefreshToken(refreshToken);
      } catch (error) {
        res.status(401).json({
          error: 'Unauthorized',
          message: error instanceof Error ? error.message : 'Invalid refresh token',
        });
        return;
      }

      // Check if the refresh token has been revoked (blacklisted or user session revoked).
      // Fail closed: tokenBlacklistService's read methods already return
      // true (revoked) rather than throwing on a query error, which the
      // isRevoked/isSessionRevoked checks below turn into a 401. This
      // try/catch is therefore only reachable for an unexpected throw (e.g.
      // the service was never initialized) -- reject the refresh in that
      // case too, rather than the old behavior of logging and minting a new
      // access token anyway.
      try {
        if (decoded.jti) {
          const isRevoked = await tokenBlacklistService.isBlacklisted(decoded.jti);
          if (isRevoked) {
            res.status(401).json({
              error: 'Unauthorized',
              message: 'Refresh token has been revoked',
            });
            return;
          }

          const isSessionRevoked = await tokenBlacklistService.isUserSessionRevoked(
            decoded.userId,
            decoded.iat
          );
          if (isSessionRevoked) {
            res.status(401).json({
              error: 'Unauthorized',
              message: 'Session has been revoked. Please log in again.',
            });
            return;
          }
        }
      } catch (error) {
        logger.error('Refresh token revocation check failed unexpectedly', {
          error: (error as Error).message,
          correlationId: req.correlationId,
        });
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Unable to verify token revocation status',
        });
        return;
      }

      // Verify user still exists
      const user = await this.userService.findById(decoded.userId);

      if (!user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'User not found',
        });
        return;
      }

      // Generate new access token, re-stamping the claim from the current DB value
      const accessToken = tokenService.generateAccessToken({
        userId: user.id,
        email: user.email,
        role: user.role,
        ...(user.must_change_password && { mustChangePassword: true }),
      });

      res.status(200).json({
        message: 'Token refreshed successfully',
        accessToken,
      });
    } catch (error) {
      logger.error('Token refresh error', { error: (error as Error).message, stack: (error as Error).stack, correlationId: req.correlationId });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to refresh token',
      });
    }
  };

  /**
   * Get current authenticated user
   * GET /api/auth/me
   * Requires authentication
   */
  me = async (req: Request, res: Response): Promise<void> => {
    try {
      // User is attached to request by authenticate middleware
      const userId = (req as any).user?.userId;

      if (!userId) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      // Fetch user from database
      const user = await this.userService.findById(userId);

      if (!user) {
        res.status(404).json({
          error: 'Not Found',
          message: 'User not found',
        });
        return;
      }

      res.status(200).json({
        user: user.toJSON(),
      });
    } catch (error) {
      logger.error('Get current user error', { error: (error as Error).message, stack: (error as Error).stack, correlationId: req.correlationId });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get current user',
      });
    }
  };

  /**
   * Change password for authenticated user
   * POST /api/auth/change-password
   * Requires authentication
   */
  changePassword = async (req: Request, res: Response): Promise<void> => {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = (req as any).user?.userId;

      // Validate authentication
      if (!userId) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      // Validate input - check required fields
      if (!currentPassword || !newPassword) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Current password and new password are required',
        });
        return;
      }

      // Get user from database with password hash
      const user = await this.userService.findById(userId);

      if (!user) {
        res.status(404).json({
          error: 'Not Found',
          message: 'User not found',
        });
        return;
      }

      // Verify current password
      const isValidPassword = await user.verifyPassword(currentPassword);

      if (!isValidPassword) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Current password is incorrect',
        });
        return;
      }

      // Validate new password meets requirements
      const { validatePassword, isSamePassword } = await import('@/utils/passwordValidator');
      const validationResult = validatePassword(newPassword);

      if (!validationResult.valid) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'New password does not meet requirements',
          errors: validationResult.errors,
        });
        return;
      }

      // Check new password is different from current password
      if (isSamePassword(currentPassword, newPassword)) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'New password must be different from current password',
        });
        return;
      }

      // Update password in database
      await this.userService.updatePassword(userId, newPassword);

      // Clear the forced-password-change flag now that the password has been updated
      await this.userService.clearMustChangePassword(userId);

      // Revoke all existing tokens for security
      // This forces all other sessions to log in again with the new password
      // Best-effort: the password has already changed at this point, so a
      // blacklist-store outage must not turn into a 500 for the caller.
      // tokenBlacklistService.blacklistAllUserTokens() already swallows its
      // own query errors internally (write methods are best-effort by
      // design); this try/catch remains as a guard for an unexpected throw
      // (e.g. the service was never initialized).
      try {
        await tokenBlacklistService.blacklistAllUserTokens(userId);
        logger.info('All user tokens revoked after password change', {
          userId,
          correlationId: req.correlationId,
        });

        // See waitPastCurrentSecond()'s doc comment: without this, the
        // tokens minted below would almost always be born-revoked by the
        // blacklistAllUserTokens() call above. Only needed on this branch --
        // if blacklistAllUserTokens() threw (the catch below), no
        // revocation was written, so there's nothing for the new tokens to
        // collide with and the wait would be pure wasted latency.
        await waitPastCurrentSecond();
      } catch (error) {
        logger.warn('Failed to revoke existing tokens after password change, continuing', {
          userId,
          error: (error as Error).message,
          correlationId: req.correlationId,
        });
      }

      // Generate new access and refresh tokens. The forced-change claim is intentionally
      // omitted here (not read from the stale pre-update in-memory `user`) since the
      // flag was just cleared above.
      const tokens = tokenService.generateTokenPair({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      // TODO: Queue email notification (background job)
      // This will be implemented in task 4.0

      // TODO: Log audit event
      // This will be implemented when audit service is available

      res.status(200).json({
        message: 'Password changed successfully',
        ...tokens,
      });
    } catch (error) {
      logger.error('Change password error', { error: (error as Error).message, stack: (error as Error).stack, correlationId: req.correlationId });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to change password',
      });
    }
  };
}
