import { Request, Response } from 'express';
import { Pool } from 'pg';
import { TeamService } from '@/services/teamService';
import { AuthenticatedRequest } from '@/middleware/auth';

export class TeamController {
  private teamService: TeamService;

  constructor(pool: Pool) {
    this.teamService = new TeamService(pool);
  }

  /**
   * Get all teams for the authenticated user
   * GET /api/teams
   */
  getTeams = async (req: Request, res: Response): Promise<void> => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;

      if (!authenticatedReq.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      const teams = await this.teamService.findByUserId(
        authenticatedReq.user.userId
      );

      // Get role for each team
      const teamsWithRoles = await Promise.all(
        teams.map(async (team) => {
          const member = await this.teamService.getMember(team.id, authenticatedReq.user!.userId);
          return {
            ...team.toJSON(),
            role: member?.role || 'member',
          };
        })
      );

      res.status(200).json({
        teams: teamsWithRoles,
      });
    } catch (error) {
      console.error('Get teams error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve teams',
      });
    }
  };

  /**
   * Create a new team
   * POST /api/teams
   */
  createTeam = async (req: Request, res: Response): Promise<void> => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;

      if (!authenticatedReq.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      const { name } = req.body;

      // Validate input
      if (!name) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Team name is required',
        });
        return;
      }

      // Validate name length
      if (name.length > 255) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Team name must be 255 characters or less',
        });
        return;
      }

      // Create team
      const team = await this.teamService.createTeam({
        name,
        owner_id: authenticatedReq.user.userId,
      });

      res.status(201).json({
        message: 'Team created successfully',
        team: team.toJSON(),
      });
    } catch (error) {
      console.error('Create team error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to create team',
      });
    }
  };

  /**
   * Get a specific team by ID
   * GET /api/teams/:id
   */
  getTeam = async (req: Request, res: Response): Promise<void> => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;

      if (!authenticatedReq.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      const { id } = req.params;

      const team = await this.teamService.findById(id);

      if (!team) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Team not found',
        });
        return;
      }

      // Check if user is a member
      const isMember = await this.teamService.isMember(
        id,
        authenticatedReq.user.userId
      );

      if (!isMember && authenticatedReq.user.role !== 'admin') {
        res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have permission to access this team',
        });
        return;
      }

      res.status(200).json({
        team: team.toJSON(),
      });
    } catch (error) {
      console.error('Get team error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve team',
      });
    }
  };

  /**
   * Update a team
   * PUT /api/teams/:id
   */
  updateTeam = async (req: Request, res: Response): Promise<void> => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;

      if (!authenticatedReq.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      const { id } = req.params;
      const { name } = req.body;

      // Find existing team
      const existingTeam = await this.teamService.findById(id);

      if (!existingTeam) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Team not found',
        });
        return;
      }

      // Check if user is admin/owner or system admin
      const isAdminOrOwner = await this.teamService.isAdminOrOwner(
        id,
        authenticatedReq.user.userId
      );

      if (!isAdminOrOwner && authenticatedReq.user.role !== 'admin') {
        res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have permission to update this team',
        });
        return;
      }

      // Validate name if provided
      if (name && name.length > 255) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Team name must be 255 characters or less',
        });
        return;
      }

      // Update team
      const updatedTeam = await this.teamService.updateTeam(id, { name });

      res.status(200).json({
        message: 'Team updated successfully',
        team: updatedTeam?.toJSON(),
      });
    } catch (error) {
      console.error('Update team error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to update team',
      });
    }
  };

  /**
   * Delete a team
   * DELETE /api/teams/:id
   */
  deleteTeam = async (req: Request, res: Response): Promise<void> => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;

      if (!authenticatedReq.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      const { id } = req.params;

      // Find existing team
      const existingTeam = await this.teamService.findById(id);

      if (!existingTeam) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Team not found',
        });
        return;
      }

      // Only owner or system admin can delete a team
      if (
        existingTeam.owner_id !== authenticatedReq.user.userId &&
        authenticatedReq.user.role !== 'admin'
      ) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'Only the team owner can delete the team',
        });
        return;
      }

      // Delete team
      await this.teamService.deleteTeam(id);

      res.status(200).json({
        message: 'Team deleted successfully',
      });
    } catch (error) {
      console.error('Delete team error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to delete team',
      });
    }
  };

  /**
   * Get all members of a team
   * GET /api/teams/:id/members
   */
  getTeamMembers = async (req: Request, res: Response): Promise<void> => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;

      if (!authenticatedReq.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      const { id } = req.params;

      // Check if team exists
      const team = await this.teamService.findById(id);

      if (!team) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Team not found',
        });
        return;
      }

      // Check if user is a member
      const isMember = await this.teamService.isMember(
        id,
        authenticatedReq.user.userId
      );

      if (!isMember && authenticatedReq.user.role !== 'admin') {
        res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have permission to view team members',
        });
        return;
      }

      const members = await this.teamService.getMembers(id);

      res.status(200).json({
        members: members.map((member) => member.toJSON()),
      });
    } catch (error) {
      console.error('Get team members error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve team members',
      });
    }
  };

  /**
   * Add a member to a team
   * POST /api/teams/:id/members
   */
  addTeamMember = async (req: Request, res: Response): Promise<void> => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;

      if (!authenticatedReq.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      const { id } = req.params;
      const { userId, role } = req.body;

      // Validate input
      if (!userId) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'User ID is required',
        });
        return;
      }

      // Validate role if provided
      if (role && !['owner', 'admin', 'member'].includes(role)) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid role. Must be owner, admin, or member',
        });
        return;
      }

      // Check if team exists
      const team = await this.teamService.findById(id);

      if (!team) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Team not found',
        });
        return;
      }

      // Check if user is admin/owner
      const isAdminOrOwner = await this.teamService.isAdminOrOwner(
        id,
        authenticatedReq.user.userId
      );

      if (!isAdminOrOwner && authenticatedReq.user.role !== 'admin') {
        res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have permission to add members to this team',
        });
        return;
      }

      // Check if user is already a member
      const existingMember = await this.teamService.getMember(id, userId);

      if (existingMember) {
        res.status(409).json({
          error: 'Conflict',
          message: 'User is already a member of this team',
        });
        return;
      }

      // Add member
      const member = await this.teamService.addMember(id, {
        user_id: userId,
        role: role || 'member',
      });

      res.status(201).json({
        message: 'Team member added successfully',
        member: member.toJSON(),
      });
    } catch (error) {
      console.error('Add team member error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to add team member',
      });
    }
  };

  /**
   * Remove a member from a team
   * DELETE /api/teams/:id/members/:userId
   */
  removeTeamMember = async (req: Request, res: Response): Promise<void> => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;

      if (!authenticatedReq.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      const { id, userId } = req.params;

      // Check if team exists
      const team = await this.teamService.findById(id);

      if (!team) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Team not found',
        });
        return;
      }

      // Check if member exists
      const member = await this.teamService.getMember(id, userId);

      if (!member) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Team member not found',
        });
        return;
      }

      // Check permissions:
      // - System admins can remove anyone
      // - Team admins/owners can remove anyone except the owner
      // - Members can remove themselves
      const isAdminOrOwner = await this.teamService.isAdminOrOwner(
        id,
        authenticatedReq.user.userId
      );

      const isSelf = authenticatedReq.user.userId === userId;
      const isSystemAdmin = authenticatedReq.user.role === 'admin';

      if (!isSystemAdmin && !isAdminOrOwner && !isSelf) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have permission to remove this team member',
        });
        return;
      }

      // Prevent removing the team owner
      if (member.role === 'owner' && !isSystemAdmin) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'Cannot remove the team owner',
        });
        return;
      }

      // Remove member
      await this.teamService.removeMember(id, userId);

      res.status(200).json({
        message: 'Team member removed successfully',
      });
    } catch (error) {
      console.error('Remove team member error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to remove team member',
      });
    }
  };

  /**
   * Update a team member's role
   * PUT /api/teams/:id/members/:userId
   */
  updateTeamMemberRole = async (req: Request, res: Response): Promise<void> => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;

      if (!authenticatedReq.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      const { id, userId } = req.params;
      const { role } = req.body;

      // Validate input
      if (!role) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Role is required',
        });
        return;
      }

      // Validate role
      if (!['owner', 'admin', 'member'].includes(role)) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid role. Must be owner, admin, or member',
        });
        return;
      }

      // Check if team exists
      const team = await this.teamService.findById(id);

      if (!team) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Team not found',
        });
        return;
      }

      // Check if member exists
      const member = await this.teamService.getMember(id, userId);

      if (!member) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Team member not found',
        });
        return;
      }

      // Only admins/owners or system admins can update roles
      const isAdminOrOwner = await this.teamService.isAdminOrOwner(
        id,
        authenticatedReq.user.userId
      );

      if (!isAdminOrOwner && authenticatedReq.user.role !== 'admin') {
        res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have permission to update team member roles',
        });
        return;
      }

      // Prevent changing the owner role (unless system admin)
      if (member.role === 'owner' && authenticatedReq.user.role !== 'admin') {
        res.status(403).json({
          error: 'Forbidden',
          message: 'Cannot change the role of the team owner',
        });
        return;
      }

      // Update role
      const updatedMember = await this.teamService.updateMemberRole(
        id,
        userId,
        role
      );

      res.status(200).json({
        message: 'Team member role updated successfully',
        member: updatedMember?.toJSON(),
      });
    } catch (error) {
      console.error('Update team member role error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to update team member role',
      });
    }
  };
}
