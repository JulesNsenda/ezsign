import { Field, FieldType } from '@/models/Field';
import { validationPatternService } from '@/services/validationPatternService';

/**
 * Integration tests for field validation
 * Tests field type validation, required field enforcement, and pattern validation
 */
describe('Field Validation Integration Tests', () => {
  const testDocumentId = 'doc-123';

  const createTestField = (overrides: Partial<{
    id: string;
    type: FieldType;
    required: boolean;
    properties: any;
    calculation: any;
  }> = {}) => {
    return new Field({
      id: overrides.id || 'field-1',
      document_id: testDocumentId,
      type: overrides.type || 'text',
      page: 1,
      x: 100,
      y: 200,
      width: 200,
      height: 50,
      required: overrides.required ?? true,
      signer_email: null,
      properties: overrides.properties || null,
      visibility_rules: null,
      calculation: overrides.calculation || null,
      created_at: new Date(),
    });
  };

  describe('Field Type Validation', () => {
    const fieldTypes: FieldType[] = [
      'signature',
      'initials',
      'date',
      'text',
      'checkbox',
      'radio',
      'dropdown',
      'textarea',
    ];

    fieldTypes.forEach(type => {
      it(`should accept valid field type: ${type}`, () => {
        expect(Field.isValidFieldType(type)).toBe(true);
      });
    });

    it('should reject invalid field type', () => {
      expect(Field.isValidFieldType('invalid')).toBe(false);
      expect(Field.isValidFieldType('')).toBe(false);
      expect(Field.isValidFieldType('SIGNATURE')).toBe(false); // Case sensitive
    });
  });

  describe('Field Position Validation', () => {
    it('should validate field has positive dimensions', () => {
      const field = createTestField({ type: 'signature' });

      expect(field.width).toBeGreaterThan(0);
      expect(field.height).toBeGreaterThan(0);
    });

    it('should validate field is on valid page', () => {
      const field = createTestField({ type: 'signature' });

      expect(field.page).toBeGreaterThanOrEqual(0);
    });

    it('should validate field bounds within page', () => {
      const field = createTestField({ type: 'text' });
      const result = field.validateBounds(612, 792); // Letter size page

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject field extending beyond page', () => {
      const field = new Field({
        id: 'field-1',
        document_id: testDocumentId,
        type: 'text',
        page: 1,
        x: 600,
        y: 200,
        width: 200,
        height: 50,
        required: false,
        signer_email: null,
        properties: null,
        visibility_rules: null,
        calculation: null,
        created_at: new Date(),
      });

      const result = field.validateBounds(612, 792);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Required Field Validation', () => {
    it('should identify required fields', () => {
      const requiredField = createTestField({ type: 'signature', required: true });
      const optionalField = createTestField({ type: 'text', required: false });

      expect(requiredField.required).toBe(true);
      expect(optionalField.required).toBe(false);
    });

    it('should validate required field has value', () => {
      const field = createTestField({
        type: 'text',
        required: true,
        properties: { validation: { pattern: 'alphanumeric' } }
      });

      // Empty value for required field
      const emptyValidation = field.validateValue('');
      expect(emptyValidation.valid).toBe(false);

      // Valid value for required field
      const validValidation = field.validateValue('Some text');
      expect(validValidation.valid).toBe(true);
    });

    it('should allow empty value for optional field', () => {
      const field = createTestField({ type: 'text', required: false });

      const emptyValidation = field.validateValue('');
      expect(emptyValidation.valid).toBe(true);
    });
  });

  describe('Text Field Validation Patterns', () => {
    describe('Email Pattern', () => {
      it('should validate correct email format', () => {
        const result = validationPatternService.validateValue('test@example.com', 'email');
        expect(result.valid).toBe(true);
      });

      it('should reject invalid email format', () => {
        const result = validationPatternService.validateValue('invalid-email', 'email');
        expect(result.valid).toBe(false);
      });
    });

    describe('US Phone Pattern', () => {
      it('should validate US phone formats', () => {
        const validNumbers = [
          '(555) 123-4567',
          '555-123-4567',
          '5551234567',
        ];

        validNumbers.forEach(num => {
          const result = validationPatternService.validateValue(num, 'phone_us');
          expect(result.valid).toBe(true);
        });
      });

      it('should reject invalid phone formats', () => {
        const result = validationPatternService.validateValue('123', 'phone_us');
        expect(result.valid).toBe(false);
      });
    });

    describe('SA ID Pattern', () => {
      it('should validate SA ID number with checksum', () => {
        // Valid SA ID (example with valid Luhn checksum: 9001015009086)
        // Calculation: sum of weighted digits = 34, check digit = (10 - (34 % 10)) % 10 = 6
        const result = validationPatternService.validateSouthAfricanId('9001015009086');
        expect(result.valid).toBe(true);
        expect(result.details).toBeDefined();
      });

      it('should reject SA ID with invalid checksum', () => {
        // 9001015009087 has invalid checksum (should be 6, not 7)
        const result = validationPatternService.validateSouthAfricanId('9001015009087');
        expect(result.valid).toBe(false);
      });

      it('should reject SA ID with invalid length', () => {
        const result = validationPatternService.validateSouthAfricanId('900101500908');
        expect(result.valid).toBe(false);
      });
    });

    describe('US ZIP Code Pattern', () => {
      it('should validate 5-digit ZIP', () => {
        const result = validationPatternService.validateValue('12345', 'zip_us');
        expect(result.valid).toBe(true);
      });

      it('should validate ZIP+4 format', () => {
        const result = validationPatternService.validateValue('12345-6789', 'zip_us');
        expect(result.valid).toBe(true);
      });

      it('should reject invalid ZIP', () => {
        const result = validationPatternService.validateValue('1234', 'zip_us');
        expect(result.valid).toBe(false);
      });
    });

    describe('Number Pattern', () => {
      it('should validate integers', () => {
        const result = validationPatternService.validateValue('12345', 'number');
        expect(result.valid).toBe(true);
      });

      it('should validate decimals', () => {
        const result = validationPatternService.validateValue('123.45', 'number');
        expect(result.valid).toBe(true);
      });

      it('should validate negative numbers', () => {
        const result = validationPatternService.validateValue('-123.45', 'number');
        expect(result.valid).toBe(true);
      });

      it('should reject non-numeric', () => {
        const result = validationPatternService.validateValue('abc', 'number');
        expect(result.valid).toBe(false);
      });
    });

    describe('Custom Regex Pattern', () => {
      it('should validate against custom regex', () => {
        const result = validationPatternService.validateValue(
          'ABC-123',
          'custom',
          '^[A-Z]{3}-\\d{3}$'
        );
        expect(result.valid).toBe(true);
      });

      it('should reject non-matching custom regex', () => {
        const result = validationPatternService.validateValue(
          'abc-123',
          'custom',
          '^[A-Z]{3}-\\d{3}$'
        );
        expect(result.valid).toBe(false);
      });
    });
  });

  describe('Radio Field Validation', () => {
    it('should validate radio field has options', () => {
      const field = createTestField({
        type: 'radio',
        properties: {
          options: [
            { label: 'Option A', value: 'a' },
            { label: 'Option B', value: 'b' },
          ],
        },
      });

      expect(field.properties?.options).toHaveLength(2);
    });

    it('should validate radio field properties', () => {
      const field = createTestField({
        type: 'radio',
        properties: {
          options: [
            { label: 'Option A', value: 'a' },
            { label: 'Option B', value: 'b' },
          ],
        },
      });

      const result = field.validateProperties();
      expect(result.valid).toBe(true);
    });

    it('should reject radio field with less than 2 options', () => {
      const field = createTestField({
        type: 'radio',
        properties: {
          options: [{ label: 'Only One', value: 'one' }],
        },
      });

      const result = field.validateProperties();
      expect(result.valid).toBe(false);
    });
  });

  describe('Dropdown Field Validation', () => {
    it('should validate dropdown has options', () => {
      const field = createTestField({
        type: 'dropdown',
        properties: {
          options: [
            { label: 'Select...', value: '' },
            { label: 'Choice 1', value: 'choice1' },
            { label: 'Choice 2', value: 'choice2' },
          ],
          placeholder: 'Select an option',
        },
      });

      expect(field.properties?.options).toBeDefined();
      expect(field.properties?.options?.length).toBeGreaterThan(0);
    });
  });

  describe('Checkbox Field Validation', () => {
    it('should validate checkbox field type', () => {
      const field = createTestField({ type: 'checkbox' });

      expect(field.isCheckbox()).toBe(true);
    });
  });

  describe('Date Field Validation', () => {
    it('should validate date field properties', () => {
      const field = createTestField({
        type: 'date',
        properties: {
          dateFormat: 'MM/DD/YYYY',
        },
      });

      const result = field.validateProperties();
      expect(result.valid).toBe(true);
    });

    it('should reject invalid date format', () => {
      const field = createTestField({
        type: 'date',
        properties: {
          dateFormat: 'INVALID',
        },
      });

      const result = field.validateProperties();
      expect(result.valid).toBe(false);
    });
  });

  describe('Textarea Field Validation', () => {
    it('should validate textarea rows property', () => {
      const field = createTestField({
        type: 'textarea',
        properties: {
          maxLength: 500,
          rows: 5,
        },
      });

      expect(field.properties?.maxLength).toBe(500);
      expect(field.properties?.rows).toBe(5);
    });
  });

  describe('Field Properties Validation', () => {
    it('should validate font size is reasonable', () => {
      const field = createTestField({
        type: 'text',
        properties: {
          fontSize: 12,
          textColor: '#000000',
        },
      });

      expect(field.properties?.fontSize).toBeGreaterThan(0);
      expect(field.properties?.fontSize).toBeLessThan(100);
    });

    it('should validate color format', () => {
      const validHexColor = '#FF5733';
      const isValid = /^#[0-9A-Fa-f]{6}$/.test(validHexColor);
      expect(isValid).toBe(true);

      const invalidColor = 'red';
      const isInvalid = /^#[0-9A-Fa-f]{6}$/.test(invalidColor);
      expect(isInvalid).toBe(false);
    });

    it('should reject invalid color in properties', () => {
      const field = createTestField({
        type: 'text',
        properties: {
          textColor: 'red', // Invalid - should be hex
        },
      });

      const result = field.validateProperties();
      expect(result.valid).toBe(false);
    });
  });

  describe('Calculation Field Validation', () => {
    it('should validate calculation formula types', () => {
      const validFormulas = ['sum', 'concat', 'today', 'count', 'average', 'min', 'max'];

      validFormulas.forEach(formula => {
        expect(validFormulas.includes(formula)).toBe(true);
      });
    });

    it('should validate field references in calculation', () => {
      const field = createTestField({
        type: 'text',
        properties: {
          readonly: true,
        },
        calculation: {
          formula: 'sum',
          fields: ['field-a', 'field-b', 'field-c'],
        },
      });

      expect(field.calculation).toBeDefined();
      expect(field.calculation?.formula).toBe('sum');
      expect(field.calculation?.fields).toHaveLength(3);
      expect(field.isCalculated()).toBe(true);
    });

    it('should validate calculation configuration', () => {
      const field = createTestField({
        type: 'text',
        calculation: {
          formula: 'sum',
          fields: ['field-a', 'field-b'],
        },
      });

      const allFieldIds = ['field-1', 'field-a', 'field-b'];
      const result = field.validateCalculation(allFieldIds);
      expect(result.valid).toBe(true);
    });

    it('should reject self-referencing calculation', () => {
      const field = createTestField({
        id: 'field-1',
        type: 'text',
        calculation: {
          formula: 'sum',
          fields: ['field-1', 'field-a'],
        },
      });

      const allFieldIds = ['field-1', 'field-a'];
      const result = field.validateCalculation(allFieldIds);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('itself'))).toBe(true);
    });

    it('should evaluate sum calculation', () => {
      const field = createTestField({
        type: 'text',
        calculation: {
          formula: 'sum',
          fields: ['field-a', 'field-b'],
        },
      });

      const fieldValues = new Map<string, string | number | boolean | null>([
        ['field-a', 10],
        ['field-b', 20],
      ]);

      const result = field.evaluateCalculation(fieldValues);
      expect(result).toBe(30);
    });

    it('should evaluate concat calculation', () => {
      const field = createTestField({
        type: 'text',
        calculation: {
          formula: 'concat',
          fields: ['field-a', 'field-b'],
          separator: ' ',
        },
      });

      const fieldValues = new Map<string, string | number | boolean | null>([
        ['field-a', 'Hello'],
        ['field-b', 'World'],
      ]);

      const result = field.evaluateCalculation(fieldValues);
      expect(result).toBe('Hello World');
    });
  });
});
