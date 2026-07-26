import { TeamInvitation, TeamInvitationData } from './TeamInvitation';

/**
 * Covers the two invariants the registration-gate exemption
 * (authController.hasInvitationExemption) relies on but never itself
 * verifies, since its own tests stub `isValid()`/`.email` directly:
 *
 *  1. `email` is always normalized to lowercase by the model, regardless of
 *     what casing was stored - so `invitation.email === normalizedEmail`
 *     (a plain JS `===`) is safe even against a mixed-case invitation row.
 *  2. `isValid()` is false for every non-"still pending and unexpired"
 *     state - cancelled, accepted, and expired-by-timestamp - which is the
 *     real discriminator behind the exemption's "expired / cancelled /
 *     already-accepted -> 403" cases (the authController tests stub the
 *     answer rather than exercising the model that produces it).
 */
describe('TeamInvitation', () => {
  const baseData: TeamInvitationData = {
    id: 'inv-1',
    team_id: 'team-1',
    email: 'invitee@example.com',
    role: 'member',
    token: 'a'.repeat(64),
    invited_by: 'user-1',
    status: 'pending',
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1 day from now
    accepted_at: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
  };

  describe('email normalization', () => {
    it('lowercases a mixed-case stored email', () => {
      const invitation = new TeamInvitation({ ...baseData, email: 'Invitee@Example.com' });
      expect(invitation.email).toBe('invitee@example.com');
    });

    it('lowercases an all-uppercase stored email', () => {
      const invitation = new TeamInvitation({ ...baseData, email: 'INVITEE@EXAMPLE.COM' });
      expect(invitation.email).toBe('invitee@example.com');
    });

    it('leaves an already-lowercase stored email unchanged', () => {
      const invitation = new TeamInvitation({ ...baseData, email: 'invitee@example.com' });
      expect(invitation.email).toBe('invitee@example.com');
    });
  });

  describe('isValid / isExpired / canAccept', () => {
    it('is valid for a pending, unexpired invitation', () => {
      const invitation = new TeamInvitation(baseData);
      expect(invitation.isExpired()).toBe(false);
      expect(invitation.isValid()).toBe(true);
      expect(invitation.canAccept()).toBe(true);
    });

    it('is invalid once cancelled, even though not expired', () => {
      const invitation = new TeamInvitation({ ...baseData, status: 'cancelled' });
      expect(invitation.isExpired()).toBe(false);
      expect(invitation.isValid()).toBe(false);
      expect(invitation.canAccept()).toBe(false);
    });

    it('is invalid once already accepted, even though not expired', () => {
      const invitation = new TeamInvitation({
        ...baseData,
        status: 'accepted',
        accepted_at: new Date(),
      });
      expect(invitation.isExpired()).toBe(false);
      expect(invitation.isValid()).toBe(false);
      expect(invitation.canAccept()).toBe(false);
    });

    it('is invalid when its own status is "expired", even if expires_at has not technically passed', () => {
      const invitation = new TeamInvitation({
        ...baseData,
        status: 'expired',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      expect(invitation.isValid()).toBe(false);
    });

    it('is invalid when still "pending" but expires_at is in the past', () => {
      const invitation = new TeamInvitation({
        ...baseData,
        status: 'pending',
        expires_at: new Date(Date.now() - 1000),
      });
      expect(invitation.isExpired()).toBe(true);
      expect(invitation.isValid()).toBe(false);
      expect(invitation.canAccept()).toBe(false);
    });
  });

  describe('toPublicJSON', () => {
    it('omits the token', () => {
      const invitation = new TeamInvitation(baseData);
      const json = invitation.toPublicJSON();
      expect(json).not.toHaveProperty('token');
      expect(json.email).toBe('invitee@example.com');
    });
  });
});
