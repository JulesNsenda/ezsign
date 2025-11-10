import { Template, TemplateData, TemplateField, TemplateFieldData } from './Template';

describe('Template Model', () => {
  const mockTemplateData: TemplateData = {
    id: 'template-123',
    user_id: 'user-123',
    team_id: null,
    name: 'Test Template',
    description: 'A test template',
    original_document_id: 'doc-123',
    file_path: '/storage/templates/test.pdf',
    file_size: 50000,
    mime_type: 'application/pdf',
    page_count: 3,
    created_at: new Date(),
    updated_at: new Date(),
  };

  describe('Constructor', () => {
    it('should create a Template instance with valid data', () => {
      const template = new Template(mockTemplateData);
      expect(template.id).toBe(mockTemplateData.id);
      expect(template.name).toBe(mockTemplateData.name);
      expect(template.user_id).toBe(mockTemplateData.user_id);
      expect(template.team_id).toBe(mockTemplateData.team_id);
    });
  });

  describe('isTeamTemplate', () => {
    it('should return false for personal template', () => {
      const template = new Template(mockTemplateData);
      expect(template.isTeamTemplate()).toBe(false);
    });

    it('should return true for team template', () => {
      const template = new Template({ ...mockTemplateData, team_id: 'team-123' });
      expect(template.isTeamTemplate()).toBe(true);
    });
  });

  describe('isPersonalTemplate', () => {
    it('should return true for personal template', () => {
      const template = new Template(mockTemplateData);
      expect(template.isPersonalTemplate()).toBe(true);
    });

    it('should return false for team template', () => {
      const template = new Template({ ...mockTemplateData, team_id: 'team-123' });
      expect(template.isPersonalTemplate()).toBe(false);
    });
  });

  describe('isPdf', () => {
    it('should return true for PDF mime type', () => {
      const template = new Template(mockTemplateData);
      expect(template.isPdf()).toBe(true);
    });

    it('should return false for non-PDF mime type', () => {
      const template = new Template({ ...mockTemplateData, mime_type: 'image/png' });
      expect(template.isPdf()).toBe(false);
    });
  });

  describe('getFormattedFileSize', () => {
    it('should format bytes correctly', () => {
      const template = new Template({ ...mockTemplateData, file_size: 0 });
      expect(template.getFormattedFileSize()).toBe('0 Bytes');
    });

    it('should format KB correctly', () => {
      const template = new Template({ ...mockTemplateData, file_size: 2048 });
      expect(template.getFormattedFileSize()).toBe('2 KB');
    });

    it('should format MB correctly', () => {
      const template = new Template({ ...mockTemplateData, file_size: 2097152 });
      expect(template.getFormattedFileSize()).toBe('2 MB');
    });
  });

  describe('canUserAccess', () => {
    it('should allow owner to access', () => {
      const template = new Template(mockTemplateData);
      expect(template.canUserAccess('user-123', [])).toBe(true);
    });

    it('should deny non-owner without team access', () => {
      const template = new Template(mockTemplateData);
      expect(template.canUserAccess('user-456', [])).toBe(false);
    });

    it('should allow team member to access team template', () => {
      const template = new Template({ ...mockTemplateData, team_id: 'team-123' });
      expect(template.canUserAccess('user-456', ['team-123'])).toBe(true);
    });

    it('should deny team member without matching team', () => {
      const template = new Template({ ...mockTemplateData, team_id: 'team-123' });
      expect(template.canUserAccess('user-456', ['team-456'])).toBe(false);
    });
  });

  describe('canUserEdit', () => {
    it('should allow owner to edit', () => {
      const template = new Template(mockTemplateData);
      expect(template.canUserEdit('user-123')).toBe(true);
    });

    it('should deny non-owner from editing', () => {
      const template = new Template(mockTemplateData);
      expect(template.canUserEdit('user-456')).toBe(false);
    });
  });

  describe('canUserDelete', () => {
    it('should allow owner to delete', () => {
      const template = new Template(mockTemplateData);
      expect(template.canUserDelete('user-123')).toBe(true);
    });

    it('should deny non-owner from deleting', () => {
      const template = new Template(mockTemplateData);
      expect(template.canUserDelete('user-456')).toBe(false);
    });
  });

  describe('toJSON', () => {
    it('should convert template to JSON', () => {
      const template = new Template(mockTemplateData);
      const json = template.toJSON();
      expect(json).toEqual(mockTemplateData);
    });
  });

  describe('toPublicJSON', () => {
    it('should exclude file_path from public JSON', () => {
      const template = new Template(mockTemplateData);
      const publicJson = template.toPublicJSON();
      expect(publicJson).not.toHaveProperty('file_path');
      expect(publicJson).toHaveProperty('file_size_formatted');
    });
  });
});

describe('TemplateField Model', () => {
  const mockFieldData: TemplateFieldData = {
    id: 'field-123',
    template_id: 'template-123',
    type: 'signature',
    page: 0,
    x: 100,
    y: 200,
    width: 150,
    height: 50,
    required: true,
    signer_role: 'Client',
    properties: null,
    created_at: new Date(),
  };

  describe('Constructor', () => {
    it('should create a TemplateField instance with valid data', () => {
      const field = new TemplateField(mockFieldData);
      expect(field.id).toBe(mockFieldData.id);
      expect(field.type).toBe(mockFieldData.type);
      expect(field.signer_role).toBe(mockFieldData.signer_role);
    });
  });

  describe('hasSignerRole', () => {
    it('should return true when signer role is assigned', () => {
      const field = new TemplateField(mockFieldData);
      expect(field.hasSignerRole()).toBe(true);
    });

    it('should return false when signer role is null', () => {
      const field = new TemplateField({ ...mockFieldData, signer_role: null });
      expect(field.hasSignerRole()).toBe(false);
    });

    it('should return false when signer role is empty string', () => {
      const field = new TemplateField({ ...mockFieldData, signer_role: '' });
      expect(field.hasSignerRole()).toBe(false);
    });
  });

  describe('toJSON', () => {
    it('should convert field to JSON', () => {
      const field = new TemplateField(mockFieldData);
      const json = field.toJSON();
      expect(json).toEqual(mockFieldData);
    });
  });
});
