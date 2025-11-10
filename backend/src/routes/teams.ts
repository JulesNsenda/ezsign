import { Router } from 'express';
import { Pool } from 'pg';
import { TeamController } from '@/controllers/teamController';
import { authenticate } from '@/middleware/auth';

export const createTeamsRouter = (pool: Pool): Router => {
  const router = Router();
  const teamController = new TeamController(pool);

  // All routes require authentication
  router.use(authenticate);

  // Get all teams for authenticated user
  router.get('/', teamController.getTeams);

  // Create a new team
  router.post('/', teamController.createTeam);

  // Get a specific team
  router.get('/:id', teamController.getTeam);

  // Update a team
  router.put('/:id', teamController.updateTeam);

  // Delete a team
  router.delete('/:id', teamController.deleteTeam);

  // Get team members
  router.get('/:id/members', teamController.getTeamMembers);

  // Add team member
  router.post('/:id/members', teamController.addTeamMember);

  // Update team member role
  router.put('/:id/members/:userId', teamController.updateTeamMemberRole);

  // Remove team member
  router.delete('/:id/members/:userId', teamController.removeTeamMember);

  return router;
};
