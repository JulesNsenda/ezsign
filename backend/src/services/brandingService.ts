import { Pool } from 'pg';
import {
  Branding,
  BrandingData,
  CreateBrandingData,
  UpdateBrandingData,
  DEFAULT_BRANDING,
} from '@/models/Branding';

/**
 * Service for managing team branding settings
 */
export class BrandingService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Create branding settings for a team
   */
  async createBranding(data: CreateBrandingData): Promise<Branding> {
    // Validate the data
    const validation = Branding.validate(data);
    if (!validation.valid) {
      throw new Error(`Invalid branding data: ${validation.errors.join(', ')}`);
    }

    const query = `
      INSERT INTO team_branding (
        team_id,
        logo_path,
        logo_url,
        favicon_path,
        primary_color,
        secondary_color,
        accent_color,
        company_name,
        tagline,
        email_footer_text,
        custom_page_title,
        support_email,
        support_url,
        privacy_url,
        terms_url,
        show_powered_by,
        hide_ezsign_branding
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *
    `;

    const values = [
      data.team_id,
      data.logo_path || null,
      data.logo_url || null,
      data.favicon_path || null,
      data.primary_color || DEFAULT_BRANDING.primary_color,
      data.secondary_color || DEFAULT_BRANDING.secondary_color,
      data.accent_color || null,
      data.company_name || null,
      data.tagline || null,
      data.email_footer_text || null,
      data.custom_page_title || null,
      data.support_email || null,
      data.support_url || null,
      data.privacy_url || null,
      data.terms_url || null,
      data.show_powered_by ?? DEFAULT_BRANDING.show_powered_by,
      data.hide_ezsign_branding ?? DEFAULT_BRANDING.hide_ezsign_branding,
    ];

    const result = await this.pool.query<BrandingData>(query, values);

    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to create branding');
    }

    return new Branding(row);
  }

  /**
   * Get branding by team ID
   */
  async getByTeamId(teamId: string): Promise<Branding | null> {
    const query = `
      SELECT *
      FROM team_branding
      WHERE team_id = $1
    `;

    const result = await this.pool.query<BrandingData>(query, [teamId]);

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return new Branding(row);
  }

  /**
   * Get branding by ID
   */
  async getById(id: string): Promise<Branding | null> {
    const query = `
      SELECT *
      FROM team_branding
      WHERE id = $1
    `;

    const result = await this.pool.query<BrandingData>(query, [id]);

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return new Branding(row);
  }

  /**
   * Get or create default branding for a team
   * Returns existing branding or creates new one with defaults
   */
  async getOrCreateBranding(teamId: string): Promise<Branding> {
    const existing = await this.getByTeamId(teamId);
    if (existing) {
      return existing;
    }

    return this.createBranding({ team_id: teamId });
  }

  /**
   * Update branding settings
   */
  async updateBranding(
    teamId: string,
    data: UpdateBrandingData
  ): Promise<Branding | null> {
    // Validate the data
    const validation = Branding.validate(data);
    if (!validation.valid) {
      throw new Error(`Invalid branding data: ${validation.errors.join(', ')}`);
    }

    // Build dynamic update query
    const updates: string[] = [];
    const values: (string | boolean | null)[] = [];
    let paramIndex = 1;

    const addField = (
      field: string,
      value: string | boolean | null | undefined,
      allowNull = true
    ) => {
      if (value !== undefined) {
        updates.push(`${field} = $${paramIndex}`);
        values.push(allowNull && value === null ? null : value);
        paramIndex++;
      }
    };

    // Add all updatable fields
    addField('logo_path', data.logo_path);
    addField('logo_url', data.logo_url);
    addField('favicon_path', data.favicon_path);
    addField('primary_color', data.primary_color);
    addField('secondary_color', data.secondary_color);
    addField('accent_color', data.accent_color);
    addField('company_name', data.company_name);
    addField('tagline', data.tagline);
    addField('email_footer_text', data.email_footer_text);
    addField('custom_page_title', data.custom_page_title);
    addField('support_email', data.support_email);
    addField('support_url', data.support_url);
    addField('privacy_url', data.privacy_url);
    addField('terms_url', data.terms_url);

    if (data.show_powered_by !== undefined) {
      updates.push(`show_powered_by = $${paramIndex}`);
      values.push(data.show_powered_by);
      paramIndex++;
    }

    if (data.hide_ezsign_branding !== undefined) {
      updates.push(`hide_ezsign_branding = $${paramIndex}`);
      values.push(data.hide_ezsign_branding);
      paramIndex++;
    }

    if (updates.length === 0) {
      return this.getByTeamId(teamId);
    }

    // Add team_id as the last parameter
    values.push(teamId);

    const query = `
      UPDATE team_branding
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE team_id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.pool.query<BrandingData>(query, values);

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return new Branding(row);
  }

  /**
   * Delete branding settings for a team
   */
  async deleteBranding(teamId: string): Promise<boolean> {
    const query = `
      DELETE FROM team_branding
      WHERE team_id = $1
    `;

    const result = await this.pool.query(query, [teamId]);

    return result.rowCount !== null && result.rowCount > 0;
  }

  /**
   * Update logo path for a team
   */
  async updateLogoPath(
    teamId: string,
    logoPath: string | null
  ): Promise<Branding | null> {
    return this.updateBranding(teamId, { logo_path: logoPath });
  }

  /**
   * Update favicon path for a team
   */
  async updateFaviconPath(
    teamId: string,
    faviconPath: string | null
  ): Promise<Branding | null> {
    return this.updateBranding(teamId, { favicon_path: faviconPath });
  }

  /**
   * Reset branding to defaults
   */
  async resetToDefaults(teamId: string): Promise<Branding | null> {
    const query = `
      UPDATE team_branding
      SET
        logo_path = NULL,
        logo_url = NULL,
        favicon_path = NULL,
        primary_color = $1,
        secondary_color = $2,
        accent_color = NULL,
        company_name = NULL,
        tagline = NULL,
        email_footer_text = NULL,
        custom_page_title = NULL,
        support_email = NULL,
        support_url = NULL,
        privacy_url = NULL,
        terms_url = NULL,
        show_powered_by = $3,
        hide_ezsign_branding = $4,
        updated_at = CURRENT_TIMESTAMP
      WHERE team_id = $5
      RETURNING *
    `;

    const values = [
      DEFAULT_BRANDING.primary_color,
      DEFAULT_BRANDING.secondary_color,
      DEFAULT_BRANDING.show_powered_by,
      DEFAULT_BRANDING.hide_ezsign_branding,
      teamId,
    ];

    const result = await this.pool.query<BrandingData>(query, values);

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return new Branding(row);
  }

  /**
   * Check if a team has custom branding configured
   */
  async hasCustomBranding(teamId: string): Promise<boolean> {
    const branding = await this.getByTeamId(teamId);
    return branding ? branding.hasCustomBranding() : false;
  }
}
