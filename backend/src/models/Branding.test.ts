import { Branding, DEFAULT_BRANDING, BrandingData } from './Branding';

describe('Branding Model', () => {
  const mockBrandingData: BrandingData = {
    id: 'branding-123',
    team_id: 'team-123',
    logo_path: null,
    logo_url: null,
    favicon_path: null,
    primary_color: '#4F46E5',
    secondary_color: '#10B981',
    accent_color: null,
    company_name: 'Acme Inc',
    tagline: null,
    email_footer_text: null,
    custom_page_title: null,
    support_email: null,
    support_url: null,
    privacy_url: null,
    terms_url: null,
    show_powered_by: true,
    hide_ezsign_branding: false,
    created_at: new Date(),
    updated_at: new Date(),
  };

  describe('Constructor', () => {
    it('should create a Branding instance with provided data', () => {
      const branding = new Branding(mockBrandingData);
      expect(branding.id).toBe(mockBrandingData.id);
      expect(branding.team_id).toBe(mockBrandingData.team_id);
      expect(branding.company_name).toBe(mockBrandingData.company_name);
    });

    it('should fall back to default colors when not provided', () => {
      const branding = new Branding({ ...mockBrandingData, primary_color: '', secondary_color: '' });
      expect(branding.primary_color).toBe(DEFAULT_BRANDING.primary_color);
      expect(branding.secondary_color).toBe(DEFAULT_BRANDING.secondary_color);
    });
  });

  describe('isValidHexColor', () => {
    it('should accept a valid 6-digit hex color', () => {
      expect(Branding.isValidHexColor('#4F46E5')).toBe(true);
    });

    it('should reject a non-hex value', () => {
      expect(Branding.isValidHexColor('red')).toBe(false);
    });

    it('should reject a 3-digit shorthand hex color', () => {
      expect(Branding.isValidHexColor('#FFF')).toBe(false);
    });
  });

  describe('isValidHttpUrl', () => {
    it('should accept a valid https URL', () => {
      expect(Branding.isValidHttpUrl('https://example.com/logo.png')).toBe(true);
    });

    it('should accept a valid http URL', () => {
      expect(Branding.isValidHttpUrl('http://example.com')).toBe(true);
    });

    it('should reject a javascript: URL', () => {
      expect(Branding.isValidHttpUrl('javascript:alert(1)')).toBe(false);
    });

    it('should reject a data: URL', () => {
      expect(Branding.isValidHttpUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    });

    it('should reject a protocol-relative URL', () => {
      expect(Branding.isValidHttpUrl('//evil.com')).toBe(false);
    });

    it('should reject an unparseable value', () => {
      expect(Branding.isValidHttpUrl('not a url')).toBe(false);
    });
  });

  describe('validate', () => {
    it('should return valid for correct data', () => {
      const result = Branding.validate({
        team_id: 'team-123',
        primary_color: '#4F46E5',
        secondary_color: '#10B981',
        accent_color: '#FFFFFF',
        support_email: 'support@example.com',
        company_name: 'Acme Inc',
        logo_url: 'https://cdn.example.com/logo.png',
        support_url: 'https://example.com/support',
        privacy_url: 'https://example.com/privacy',
        terms_url: 'https://example.com/terms',
        email_footer_text: 'Thanks for using our service.',
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject an invalid primary color', () => {
      const result = Branding.validate({ team_id: 'team-123', primary_color: 'not-a-color' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid primary color format. Use hex format (e.g., #4F46E5)');
    });

    it('should reject an invalid support email', () => {
      const result = Branding.validate({ team_id: 'team-123', support_email: 'not-an-email' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid support email format');
    });

    it('should reject a support email with mailto header-injection characters (bcc/subject smuggling)', () => {
      const result = Branding.validate({
        team_id: 'team-123',
        support_email: 'a@b.c?bcc=attacker@x&subject=Urgent',
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid support email format');
    });

    it('should reject a company name over 255 characters', () => {
      const result = Branding.validate({ team_id: 'team-123', company_name: 'a'.repeat(256) });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Company name must be 255 characters or less');
    });

    it('should reject a javascript: logo_url', () => {
      const result = Branding.validate({ team_id: 'team-123', logo_url: 'javascript:alert(1)' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid logo URL. Must be a valid http or https URL');
    });

    it('should reject a javascript: support_url', () => {
      const result = Branding.validate({ team_id: 'team-123', support_url: 'javascript:alert(1)' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid support URL. Must be a valid http or https URL');
    });

    it('should reject a data: privacy_url', () => {
      const result = Branding.validate({ team_id: 'team-123', privacy_url: 'data:text/html,<script>alert(1)</script>' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid privacy URL. Must be a valid http or https URL');
    });

    it('should reject a protocol-relative terms_url', () => {
      const result = Branding.validate({ team_id: 'team-123', terms_url: '//evil.com' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid terms URL. Must be a valid http or https URL');
    });

    it('should reject email_footer_text over 1000 characters', () => {
      const result = Branding.validate({ team_id: 'team-123', email_footer_text: 'a'.repeat(1001) });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Email footer text must be 1000 characters or less');
    });

    it('should accept email_footer_text at exactly 1000 characters', () => {
      const result = Branding.validate({ team_id: 'team-123', email_footer_text: 'a'.repeat(1000) });
      expect(result.valid).toBe(true);
    });

    it('should collect multiple validation errors at once', () => {
      const result = Branding.validate({
        team_id: 'team-123',
        primary_color: 'bad',
        logo_url: 'javascript:alert(1)',
        support_email: 'not-an-email',
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(3);
    });

    it('should ignore fields that are not present on the input', () => {
      const result = Branding.validate({ team_id: 'team-123' });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('hasLogo', () => {
    it('should return true when logo_url is set', () => {
      const branding = new Branding({ ...mockBrandingData, logo_url: 'https://example.com/logo.png' });
      expect(branding.hasLogo()).toBe(true);
    });

    it('should return false when neither logo_path nor logo_url is set', () => {
      const branding = new Branding(mockBrandingData);
      expect(branding.hasLogo()).toBe(false);
    });
  });

  describe('getDisplayName', () => {
    it('should return the company name when set', () => {
      const branding = new Branding(mockBrandingData);
      expect(branding.getDisplayName()).toBe('Acme Inc');
    });

    it('should return the default name when company name is not set', () => {
      const branding = new Branding({ ...mockBrandingData, company_name: null });
      expect(branding.getDisplayName()).toBe('EzSign');
    });
  });
});
