/**
 * Branding model for team customization
 */

export interface BrandingData {
  id: string;
  team_id: string;
  // Logo settings
  logo_path?: string | null;
  logo_url?: string | null;
  favicon_path?: string | null;
  // Color settings
  primary_color: string;
  secondary_color: string;
  accent_color?: string | null;
  // Text settings
  company_name?: string | null;
  tagline?: string | null;
  email_footer_text?: string | null;
  // Page customization
  custom_page_title?: string | null;
  support_email?: string | null;
  support_url?: string | null;
  privacy_url?: string | null;
  terms_url?: string | null;
  // Display options
  show_powered_by: boolean;
  hide_ezsign_branding: boolean;
  // Timestamps
  created_at: Date;
  updated_at: Date;
}

export interface CreateBrandingData {
  team_id: string;
  logo_path?: string;
  logo_url?: string;
  favicon_path?: string;
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
  company_name?: string;
  tagline?: string;
  email_footer_text?: string;
  custom_page_title?: string;
  support_email?: string;
  support_url?: string;
  privacy_url?: string;
  terms_url?: string;
  show_powered_by?: boolean;
  hide_ezsign_branding?: boolean;
}

export interface UpdateBrandingData {
  logo_path?: string | null;
  logo_url?: string | null;
  favicon_path?: string | null;
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string | null;
  company_name?: string | null;
  tagline?: string | null;
  email_footer_text?: string | null;
  custom_page_title?: string | null;
  support_email?: string | null;
  support_url?: string | null;
  privacy_url?: string | null;
  terms_url?: string | null;
  show_powered_by?: boolean;
  hide_ezsign_branding?: boolean;
}

/**
 * Default branding values
 */
export const DEFAULT_BRANDING = {
  primary_color: '#4F46E5',
  secondary_color: '#10B981',
  show_powered_by: true,
  hide_ezsign_branding: false,
};

/**
 * Branding class for team customization
 */
export class Branding {
  id: string;
  team_id: string;
  logo_path?: string | null;
  logo_url?: string | null;
  favicon_path?: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color?: string | null;
  company_name?: string | null;
  tagline?: string | null;
  email_footer_text?: string | null;
  custom_page_title?: string | null;
  support_email?: string | null;
  support_url?: string | null;
  privacy_url?: string | null;
  terms_url?: string | null;
  show_powered_by: boolean;
  hide_ezsign_branding: boolean;
  created_at: Date;
  updated_at: Date;

  constructor(data: BrandingData) {
    this.id = data.id;
    this.team_id = data.team_id;
    this.logo_path = data.logo_path;
    this.logo_url = data.logo_url;
    this.favicon_path = data.favicon_path;
    this.primary_color = data.primary_color || DEFAULT_BRANDING.primary_color;
    this.secondary_color = data.secondary_color || DEFAULT_BRANDING.secondary_color;
    this.accent_color = data.accent_color;
    this.company_name = data.company_name;
    this.tagline = data.tagline;
    this.email_footer_text = data.email_footer_text;
    this.custom_page_title = data.custom_page_title;
    this.support_email = data.support_email;
    this.support_url = data.support_url;
    this.privacy_url = data.privacy_url;
    this.terms_url = data.terms_url;
    this.show_powered_by = data.show_powered_by ?? DEFAULT_BRANDING.show_powered_by;
    this.hide_ezsign_branding = data.hide_ezsign_branding ?? DEFAULT_BRANDING.hide_ezsign_branding;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  /**
   * Check if custom logo is configured
   */
  hasLogo(): boolean {
    return !!(this.logo_path || this.logo_url);
  }

  /**
   * Get the logo URL (prefer logo_url if set, otherwise construct from path)
   */
  getLogoUrl(baseUrl: string): string | null {
    if (this.logo_url) {
      return this.logo_url;
    }
    if (this.logo_path) {
      return `${baseUrl}/api/branding/logo/${this.team_id}`;
    }
    return null;
  }

  /**
   * Check if custom branding is configured
   */
  hasCustomBranding(): boolean {
    return !!(
      this.company_name ||
      this.logo_path ||
      this.logo_url ||
      this.primary_color !== DEFAULT_BRANDING.primary_color ||
      this.secondary_color !== DEFAULT_BRANDING.secondary_color
    );
  }

  /**
   * Get display name (company name or default)
   */
  getDisplayName(defaultName: string = 'EzSign'): string {
    return this.company_name || defaultName;
  }

  /**
   * Validate hex color format
   */
  static isValidHexColor(color: string): boolean {
    return /^#[0-9A-Fa-f]{6}$/.test(color);
  }

  /**
   * Validate branding data
   */
  static validate(data: CreateBrandingData | UpdateBrandingData): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if ('primary_color' in data && data.primary_color && !Branding.isValidHexColor(data.primary_color)) {
      errors.push('Invalid primary color format. Use hex format (e.g., #4F46E5)');
    }

    if ('secondary_color' in data && data.secondary_color && !Branding.isValidHexColor(data.secondary_color)) {
      errors.push('Invalid secondary color format. Use hex format (e.g., #10B981)');
    }

    if ('accent_color' in data && data.accent_color && !Branding.isValidHexColor(data.accent_color)) {
      errors.push('Invalid accent color format. Use hex format');
    }

    if ('support_email' in data && data.support_email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(data.support_email)) {
        errors.push('Invalid support email format');
      }
    }

    if ('company_name' in data && data.company_name && data.company_name.length > 255) {
      errors.push('Company name must be 255 characters or less');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Convert to JSON
   */
  toJSON(): BrandingData {
    return {
      id: this.id,
      team_id: this.team_id,
      logo_path: this.logo_path,
      logo_url: this.logo_url,
      favicon_path: this.favicon_path,
      primary_color: this.primary_color,
      secondary_color: this.secondary_color,
      accent_color: this.accent_color,
      company_name: this.company_name,
      tagline: this.tagline,
      email_footer_text: this.email_footer_text,
      custom_page_title: this.custom_page_title,
      support_email: this.support_email,
      support_url: this.support_url,
      privacy_url: this.privacy_url,
      terms_url: this.terms_url,
      show_powered_by: this.show_powered_by,
      hide_ezsign_branding: this.hide_ezsign_branding,
      created_at: this.created_at,
      updated_at: this.updated_at,
    };
  }

  /**
   * Convert to public-facing JSON (excludes internal paths)
   */
  toPublicJSON(baseUrl: string): Record<string, unknown> {
    return {
      team_id: this.team_id,
      logo_url: this.getLogoUrl(baseUrl),
      primary_color: this.primary_color,
      secondary_color: this.secondary_color,
      accent_color: this.accent_color,
      company_name: this.company_name,
      tagline: this.tagline,
      custom_page_title: this.custom_page_title,
      support_email: this.support_email,
      support_url: this.support_url,
      privacy_url: this.privacy_url,
      terms_url: this.terms_url,
      show_powered_by: this.show_powered_by,
      hide_ezsign_branding: this.hide_ezsign_branding,
    };
  }
}
