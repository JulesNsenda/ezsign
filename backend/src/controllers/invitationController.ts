/**
 * Team Invitation Controller
 */
import { Request, Response } from 'express';
import { Pool } from 'pg';
import { InvitationService } from '@/services/invitationService';
import { TeamService } from '@/services/teamService';
import { UserService } from '@/services/userService';
import { AuthenticatedRequest } from '@/middleware/auth';
import { EmailService } from '@/services/emailService';
import logger from '@/services/loggerService';

export class InvitationController {
  private invitationService: InvitationService;
  private teamService: TeamService;
  private userService: UserService;
  private emailService: EmailService | null;

  constructor(pool: Pool, emailService?: EmailService) {
    this.invitationService = new InvitationService(pool);
    this.teamService = new TeamService(pool);
    this.userService = new UserService(pool);
    this.emailService = emailService || null;
  }

  /**
   * Create a new invitation
   * POST /api/teams/:teamId/invitations
   */
  createInvitation = async (req: Request, res: Response): Promise<void> => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;

      if (!authenticatedReq.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      const teamId = req.params.teamId;
      const { email, role } = req.body;
      const userId = authenticatedReq.user.userId;

      if (!teamId) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Team ID is required',
        });
        return;
      }

      if (!email) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Email is required',
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

      // Validate role
      if (role && !['admin', 'member'].includes(role)) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid role. Must be admin or member',
        });
        return;
      }

      // Check if team exists
      const team = await this.teamService.findById(teamId);
      if (!team) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Team not found',
        });
        return;
      }

      // Check if user is admin/owner of the team
      const isAdminOrOwner = await this.teamService.isAdminOrOwner(teamId, userId);
      if (!isAdminOrOwner) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have permission to invite members to this team',
        });
        return;
      }

      // Check if email is already a team member
      const existingUser = await this.userService.findByEmail(email);
      if (existingUser) {
        const isMember = await this.teamService.isMember(teamId, existingUser.id);
        if (isMember) {
          res.status(409).json({
            error: 'Conflict',
            message: 'This user is already a member of the team',
          });
          return;
        }
      }

      // Check for existing pending invitation
      const existingInvitation = await this.invitationService.findPendingByTeamAndEmail(teamId, email);
      if (existingInvitation) {
        res.status(409).json({
          error: 'Conflict',
          message: 'An invitation has already been sent to this email',
        });
        return;
      }

      // Create the invitation
      const invitation = await this.invitationService.create({
        team_id: teamId,
        email,
        role: role || 'member',
        invited_by: userId,
      });

      // Get inviter info for email
      const inviter = await this.userService.findById(userId);

      // Send invitation email
      if (this.emailService) {
        const appUrl = process.env.APP_URL || 'http://localhost:3002';
        const inviteUrl = `${appUrl}/accept-invitation/${invitation.token}`;

        try {
          await this.sendInvitationEmail(
            email,
            team.name,
            inviter?.email || 'A team administrator',
            invitation.role,
            inviteUrl,
            false
          );
          logger.info('Invitation email sent', { email, teamId, invitationId: invitation.id });
        } catch (emailError) {
          logger.error('Failed to send invitation email', { error: (emailError as Error).message });
          // Don't fail the request, invitation is still created
        }
      }

      res.status(201).json({
        message: 'Invitation sent successfully',
        invitation: invitation.toPublicJSON(),
      });
    } catch (error) {
      logger.error('Create invitation error', { error: (error as Error).message, stack: (error as Error).stack });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to create invitation',
      });
    }
  };

  /**
   * Get all invitations for a team
   * GET /api/teams/:teamId/invitations
   */
  getTeamInvitations = async (req: Request, res: Response): Promise<void> => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;

      if (!authenticatedReq.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      const teamId = req.params.teamId;
      const userId = authenticatedReq.user.userId;

      if (!teamId) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Team ID is required',
        });
        return;
      }

      // Check if user is a member of the team
      const isMember = await this.teamService.isMember(teamId, userId);
      if (!isMember) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have access to this team',
        });
        return;
      }

      const invitations = await this.invitationService.findByTeamId(teamId);

      res.status(200).json({
        invitations: invitations.map((inv) => inv.toPublicJSON()),
      });
    } catch (error) {
      logger.error('Get team invitations error', { error: (error as Error).message });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get invitations',
      });
    }
  };

  /**
   * Get invitation details by token (public - no auth required)
   * GET /api/invitations/:token
   */
  getInvitationByToken = async (req: Request, res: Response): Promise<void> => {
    try {
      const { token } = req.params;

      if (!token) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Token is required',
        });
        return;
      }

      const invitation = await this.invitationService.findByToken(token);

      if (!invitation) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Invitation not found',
        });
        return;
      }

      // Get team info
      const team = await this.teamService.findById(invitation.team_id);

      res.status(200).json({
        invitation: {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          status: invitation.status,
          expires_at: invitation.expires_at,
          is_valid: invitation.isValid(),
          is_expired: invitation.isExpired(),
        },
        team: team ? { id: team.id, name: team.name } : null,
      });
    } catch (error) {
      logger.error('Get invitation by token error', { error: (error as Error).message });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get invitation',
      });
    }
  };

  /**
   * Accept an invitation
   * POST /api/invitations/:token/accept
   */
  acceptInvitation = async (req: Request, res: Response): Promise<void> => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;

      if (!authenticatedReq.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      const { token } = req.params;
      const userId = authenticatedReq.user.userId;

      if (!token) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Token is required',
        });
        return;
      }

      // Get the invitation
      const invitation = await this.invitationService.findByToken(token);

      if (!invitation) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Invitation not found',
        });
        return;
      }

      // Verify the logged-in user's email matches the invitation
      const user = await this.userService.findById(userId);
      if (!user || user.email.toLowerCase() !== invitation.email.toLowerCase()) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'This invitation was sent to a different email address',
        });
        return;
      }

      if (!invitation.canAccept()) {
        if (invitation.isExpired()) {
          res.status(410).json({
            error: 'Gone',
            message: 'This invitation has expired',
          });
          return;
        }
        res.status(400).json({
          error: 'Bad Request',
          message: 'This invitation is no longer valid',
        });
        return;
      }

      // Accept the invitation
      await this.invitationService.accept(token, userId);

      // Get team info
      const team = await this.teamService.findById(invitation.team_id);

      res.status(200).json({
        message: 'Invitation accepted successfully',
        team: team ? { id: team.id, name: team.name } : null,
      });
    } catch (error) {
      logger.error('Accept invitation error', { error: (error as Error).message, stack: (error as Error).stack });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to accept invitation',
      });
    }
  };

  /**
   * Cancel/delete an invitation
   * DELETE /api/teams/:teamId/invitations/:invitationId
   */
  cancelInvitation = async (req: Request, res: Response): Promise<void> => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;

      if (!authenticatedReq.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      const { teamId, invitationId } = req.params;
      const userId = authenticatedReq.user.userId;

      if (!teamId || !invitationId) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Team ID and Invitation ID are required',
        });
        return;
      }

      // Check if user is admin/owner
      const isAdminOrOwner = await this.teamService.isAdminOrOwner(teamId, userId);
      if (!isAdminOrOwner) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have permission to cancel invitations',
        });
        return;
      }

      // Get the invitation
      const invitation = await this.invitationService.findById(invitationId);
      if (!invitation || invitation.team_id !== teamId) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Invitation not found',
        });
        return;
      }

      await this.invitationService.delete(invitationId);

      res.status(200).json({
        message: 'Invitation cancelled successfully',
      });
    } catch (error) {
      logger.error('Cancel invitation error', { error: (error as Error).message });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to cancel invitation',
      });
    }
  };

  /**
   * Resend an invitation
   * POST /api/teams/:teamId/invitations/:invitationId/resend
   */
  resendInvitation = async (req: Request, res: Response): Promise<void> => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;

      if (!authenticatedReq.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      const { teamId, invitationId } = req.params;
      const userId = authenticatedReq.user.userId;

      if (!teamId || !invitationId) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Team ID and Invitation ID are required',
        });
        return;
      }

      // Check if user is admin/owner
      const isAdminOrOwner = await this.teamService.isAdminOrOwner(teamId, userId);
      if (!isAdminOrOwner) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have permission to resend invitations',
        });
        return;
      }

      // Get the invitation
      const invitation = await this.invitationService.findById(invitationId);
      if (!invitation || invitation.team_id !== teamId) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Invitation not found',
        });
        return;
      }

      // Resend the invitation
      const updatedInvitation = await this.invitationService.resend(invitationId);

      if (!updatedInvitation) {
        res.status(500).json({
          error: 'Internal Server Error',
          message: 'Failed to resend invitation',
        });
        return;
      }

      // Get team info and send email
      if (this.emailService) {
        const team = await this.teamService.findById(teamId);
        const inviter = await this.userService.findById(userId);
        const appUrl = process.env.APP_URL || 'http://localhost:3002';
        const inviteUrl = `${appUrl}/accept-invitation/${updatedInvitation.token}`;

        try {
          await this.sendInvitationEmail(
            updatedInvitation.email,
            team?.name || 'a team',
            inviter?.email || 'A team administrator',
            updatedInvitation.role,
            inviteUrl,
            true
          );
        } catch (emailError) {
          logger.error('Failed to send resend invitation email', { error: (emailError as Error).message });
        }
      }

      res.status(200).json({
        message: 'Invitation resent successfully',
        invitation: updatedInvitation.toPublicJSON(),
      });
    } catch (error) {
      logger.error('Resend invitation error', { error: (error as Error).message });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to resend invitation',
      });
    }
  };

  /**
   * Get pending invitations for the current user
   * GET /api/invitations/pending
   */
  getPendingInvitations = async (req: Request, res: Response): Promise<void> => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;

      if (!authenticatedReq.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      const userId = authenticatedReq.user.userId;
      const user = await this.userService.findById(userId);

      if (!user) {
        res.status(404).json({
          error: 'Not Found',
          message: 'User not found',
        });
        return;
      }

      const invitations = await this.invitationService.findPendingByEmail(user.email);

      // Get team info for each invitation
      const invitationsWithTeams = await Promise.all(
        invitations.map(async (inv) => {
          const team = await this.teamService.findById(inv.team_id);
          return {
            ...inv.toPublicJSON(),
            team: team ? { id: team.id, name: team.name } : null,
          };
        })
      );

      res.status(200).json({
        invitations: invitationsWithTeams,
      });
    } catch (error) {
      logger.error('Get pending invitations error', { error: (error as Error).message });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get pending invitations',
      });
    }
  };

  /**
   * Helper method to send invitation email
   */
  private async sendInvitationEmail(
    email: string,
    teamName: string,
    inviterEmail: string,
    role: string,
    inviteUrl: string,
    isReminder: boolean
  ): Promise<void> {
    if (!this.emailService) return;

    const subject = isReminder
      ? `Reminder: You've been invited to join ${teamName} on EzSign`
      : `You've been invited to join ${teamName} on EzSign`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4F46E5;">${isReminder ? 'Team Invitation Reminder' : 'Team Invitation'}</h2>
        <p>Hi there,</p>
        <p>${isReminder ? 'This is a reminder that ' : ''}<strong>${inviterEmail}</strong> has invited you to join <strong>${teamName}</strong> on EzSign as a <strong>${role}</strong>.</p>
        <p style="margin: 30px 0;">
          <a href="${inviteUrl}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Accept Invitation
          </a>
        </p>
        <p style="color: #666; font-size: 14px;">This invitation will expire in 7 days.</p>
        <p style="color: #666; font-size: 14px;">If you didn't expect this invitation, you can safely ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
        <p style="color: #999; font-size: 12px;">EzSign - Document Signing Made Easy</p>
      </div>
    `;

    const text = `
${isReminder ? 'Team Invitation Reminder' : 'Team Invitation'}

Hi there,

${isReminder ? 'This is a reminder that ' : ''}${inviterEmail} has invited you to join ${teamName} on EzSign as a ${role}.

Accept the invitation by visiting:
${inviteUrl}

This invitation will expire in 7 days.

If you didn't expect this invitation, you can safely ignore this email.

---
EzSign - Document Signing Made Easy
    `.trim();

    // Use a simple sendMail approach since EmailService is configured for transporter
    await (this.emailService as any).transporter.sendMail({
      from: (this.emailService as any).fromEmail,
      to: email,
      subject,
      text,
      html,
    });
  }
}
