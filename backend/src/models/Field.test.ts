import { Field, FieldType, FieldProperties } from './Field';

describe('Field Model', () => {
  const mockFieldData = {
    id: 'field-123',
    document_id: 'doc-123',
    type: 'signature' as FieldType,
    page: 0,
    x: 100,
    y: 100,
    width: 200,
    height: 50,
    required: true,
    signer_email: 'test@example.com',
    properties: null,
    visibility_rules: null,
    calculation: null,
    created_at: new Date(),
  };

  describe('Constructor', () => {
    it('should create a Field instance with valid data', () => {
      const field = new Field(mockFieldData);
      expect(field.id).toBe(mockFieldData.id);
      expect(field.type).toBe(mockFieldData.type);
      expect(field.page).toBe(mockFieldData.page);
      expect(field.x).toBe(mockFieldData.x);
      expect(field.y).toBe(mockFieldData.y);
    });
  });

  describe('Field Type Checks', () => {
    it('should correctly identify signature fields', () => {
      const field = new Field({ ...mockFieldData, type: 'signature' });
      expect(field.isSignature()).toBe(true);
      expect(field.isInitials()).toBe(false);
      expect(field.requiresSignature()).toBe(true);
    });

    it('should correctly identify initials fields', () => {
      const field = new Field({ ...mockFieldData, type: 'initials' });
      expect(field.isInitials()).toBe(true);
      expect(field.isSignature()).toBe(false);
      expect(field.requiresSignature()).toBe(true);
    });

    it('should correctly identify date fields', () => {
      const field = new Field({ ...mockFieldData, type: 'date' });
      expect(field.isDate()).toBe(true);
      expect(field.requiresSignature()).toBe(false);
    });

    it('should correctly identify text fields', () => {
      const field = new Field({ ...mockFieldData, type: 'text' });
      expect(field.isText()).toBe(true);
      expect(field.requiresSignature()).toBe(false);
    });

    it('should correctly identify checkbox fields', () => {
      const field = new Field({ ...mockFieldData, type: 'checkbox' });
      expect(field.isCheckbox()).toBe(true);
      expect(field.requiresSignature()).toBe(false);
    });
  });

  describe('hasAssignedSigner', () => {
    it('should return true when signer email is assigned', () => {
      const field = new Field(mockFieldData);
      expect(field.hasAssignedSigner()).toBe(true);
    });

    it('should return false when signer email is null', () => {
      const field = new Field({ ...mockFieldData, signer_email: null });
      expect(field.hasAssignedSigner()).toBe(false);
    });

    it('should return false when signer email is empty string', () => {
      const field = new Field({ ...mockFieldData, signer_email: '' });
      expect(field.hasAssignedSigner()).toBe(false);
    });
  });

  describe('validateBounds', () => {
    it('should validate field within page bounds', () => {
      const field = new Field(mockFieldData);
      const result = field.validateBounds(612, 792); // US Letter size

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject negative x coordinate', () => {
      const field = new Field({ ...mockFieldData, x: -10 });
      const result = field.validateBounds(612, 792);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('X coordinate must be 0 or greater');
    });

    it('should reject negative y coordinate', () => {
      const field = new Field({ ...mockFieldData, y: -10 });
      const result = field.validateBounds(612, 792);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Y coordinate must be 0 or greater');
    });

    it('should reject non-positive width', () => {
      const field = new Field({ ...mockFieldData, width: 0 });
      const result = field.validateBounds(612, 792);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Width must be greater than 0');
    });

    it('should reject non-positive height', () => {
      const field = new Field({ ...mockFieldData, height: -5 });
      const result = field.validateBounds(612, 792);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Height must be greater than 0');
    });

    it('should reject field extending beyond page width', () => {
      const field = new Field({ ...mockFieldData, x: 500, width: 200 });
      const result = field.validateBounds(612, 792);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('extends beyond page width');
    });

    it('should reject field extending beyond page height', () => {
      const field = new Field({ ...mockFieldData, y: 750, height: 100 });
      const result = field.validateBounds(612, 792);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('extends beyond page height');
    });

    it('should reject negative page number', () => {
      const field = new Field({ ...mockFieldData, page: -1 });
      const result = field.validateBounds(612, 792);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Page number must be 0 or greater');
    });
  });

  describe('validateProperties', () => {
    it('should validate valid text field properties', () => {
      const properties: FieldProperties = {
        fontSize: 12,
        maxLength: 100,
        textColor: '#000000',
      };
      const field = new Field({ ...mockFieldData, type: 'text', properties });
      const result = field.validateProperties();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid maxLength for text fields', () => {
      const properties: FieldProperties = {
        maxLength: -1,
      };
      const field = new Field({ ...mockFieldData, type: 'text', properties });
      const result = field.validateProperties();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('maxLength must be greater than 0');
    });

    it('should reject invalid fontSize', () => {
      const properties: FieldProperties = {
        fontSize: 0,
      };
      const field = new Field({ ...mockFieldData, type: 'text', properties });
      const result = field.validateProperties();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('fontSize must be greater than 0');
    });

    it('should reject invalid hex color format', () => {
      const properties: FieldProperties = {
        textColor: 'red',
      };
      const field = new Field({ ...mockFieldData, type: 'text', properties });
      const result = field.validateProperties();

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should accept valid hex color format', () => {
      const properties: FieldProperties = {
        textColor: '#FF0000',
        backgroundColor: '#FFFFFF',
      };
      const field = new Field({ ...mockFieldData, type: 'text', properties });
      const result = field.validateProperties();

      expect(result.valid).toBe(true);
    });

    it('should reject invalid date format', () => {
      const properties: FieldProperties = {
        dateFormat: 'INVALID',
      };
      const field = new Field({ ...mockFieldData, type: 'date', properties });
      const result = field.validateProperties();

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should accept valid date format', () => {
      const properties: FieldProperties = {
        dateFormat: 'MM/DD/YYYY',
      };
      const field = new Field({ ...mockFieldData, type: 'date', properties });
      const result = field.validateProperties();

      expect(result.valid).toBe(true);
    });

    it('should reject negative borderWidth', () => {
      const properties: FieldProperties = {
        borderWidth: -1,
      };
      const field = new Field({ ...mockFieldData, properties });
      const result = field.validateProperties();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('borderWidth must be 0 or greater');
    });

    describe('validation config (customRegex ReDoS guard, write path)', () => {
      it('rejects a nested-quantifier customRegex at ingress, before it can be persisted', () => {
        const field = new Field({
          ...mockFieldData,
          type: 'text',
          properties: { validation: { pattern: 'custom', customRegex: '(a+)+$' } },
        });

        const result = field.validateProperties();

        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => /nested quantifier/i.test(e))).toBe(true);
      });

      it('rejects an over-length customRegex at ingress', () => {
        const oversizedRegex = `^(${'a'.repeat(260)})$`; // > 256 chars
        const field = new Field({
          ...mockFieldData,
          type: 'text',
          properties: { validation: { pattern: 'custom', customRegex: oversizedRegex } },
        });

        const result = field.validateProperties();

        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => /maximum length/i.test(e))).toBe(true);
      });

      it('still accepts an ordinary customRegex', () => {
        const field = new Field({
          ...mockFieldData,
          type: 'text',
          properties: { validation: { pattern: 'custom', customRegex: '^[A-Z]{3}-\\d{3}$' } },
        });

        const result = field.validateProperties();

        expect(result.valid).toBe(true);
      });
    });
  });

  describe('validateValue - ReDoS guards', () => {
    it('does not hang on the url preset - regression for a nested-quantifier group inside a built-in pattern', () => {
      // The `url` preset's trailing group used to be `([/\w .-]*)*` - a
      // group quantified by `*` repeated by an outer `*`, the same
      // catastrophic-backtracking shape `hasNestedQuantifier` rejects for
      // custom patterns. A short value well under any length cap is enough
      // to wedge the old pattern for a very long time.
      //
      // The boolean assertion alone doesn't detect a regression: the old,
      // vulnerable regex returns this same `false` eventually, just after a
      // very long time, and Jest's per-test timeout can't interrupt
      // synchronous backtracking. Assert elapsed wall-clock too.
      const field = new Field({
        ...mockFieldData,
        type: 'text',
        properties: { validation: { pattern: 'url' } },
      });
      const craftedValue = 'a.aa/' + 'a'.repeat(40) + '!';

      const t0 = Date.now();
      const result = field.validateValue(craftedValue);
      expect(Date.now() - t0).toBeLessThan(50);

      expect(result.valid).toBe(false);
    }, 1000);

    it('resolves the url preset fast enough to fail on a revert instead of hanging on one', () => {
      // The 40-char crafted value above is a dramatic reproduction of the
      // reported ReDoS, but at that size a *reverted* fix (the old
      // `([\/\w .-]*)*` suffix) doesn't fail this test quickly - `.test()`
      // still eventually returns, just after a very long time, during which
      // this test (and the whole suite) hangs instead of going red.
      //
      // A 19-char run against the same crafted shape keeps the fixed regex
      // instant while making the old, vulnerable regex slow enough to clear
      // the 50ms bound in well under a second - independently measured at
      // ~180ms cold for this exact shape and length - so a revert here
      // shows up as a fast, clean failure instead of a wedged test run.
      // Growth is exponential; do not enlarge without re-measuring.
      const field = new Field({
        ...mockFieldData,
        type: 'text',
        properties: { validation: { pattern: 'url' } },
      });
      const craftedValue = 'a.aa/' + 'a'.repeat(19) + '!';

      const t0 = Date.now();
      const result = field.validateValue(craftedValue);
      expect(Date.now() - t0).toBeLessThan(50);

      expect(result.valid).toBe(false);
    });

    it('rejects a nested-quantifier customRegex instead of compiling/testing it', () => {
      // Same catastrophic-backtracking shape as the ReDoS guard added to
      // validationPatternService, applied here so this model can't
      // reintroduce it if `validateValue` gains callers later. Fails
      // *closed*: a configured-but-refused pattern must not silently accept
      // the value (see `getValidationRegex`'s `refused` branch) - a required
      // field with a rejected pattern should not accept anything.
      const field = new Field({
        ...mockFieldData,
        type: 'text',
        properties: {
          validation: { pattern: 'custom', customRegex: '(a+)+$' },
        },
      });
      const craftedValue = 'a'.repeat(30) + '!';

      const t0 = Date.now();
      const result = field.validateValue(craftedValue);
      expect(Date.now() - t0).toBeLessThan(50);

      expect(result.valid).toBe(false);
      expect(result.message).toBeTruthy();
    }, 1000);

    it('rejects an oversized value before compiling/testing any pattern', () => {
      const field = new Field({
        ...mockFieldData,
        type: 'text',
        properties: { validation: { pattern: 'email' } },
      });
      const oversized = 'a'.repeat(513) + '@example.com';

      const result = field.validateValue(oversized);

      expect(result.valid).toBe(false);
    });
  });

  describe('Static Methods', () => {
    describe('getPresetPatternRegex', () => {
      it('resolves the url preset promptly on the previously-hanging input', () => {
        // See the elapsed-time note above - the boolean result alone can't
        // tell "fixed" apart from "still vulnerable, just slow".
        const craftedValue = 'a.aa/' + 'a'.repeat(40) + '!';
        const regex = Field.getPresetPatternRegex('url');

        const t0 = Date.now();
        const matched = regex?.test(craftedValue);
        expect(Date.now() - t0).toBeLessThan(50);

        expect(matched).toBe(false);
      }, 1000);

      it('preserves url preset semantics after dropping the redundant outer quantifier', () => {
        const regex = Field.getPresetPatternRegex('url');

        expect(regex?.test('https://example.com')).toBe(true);
        expect(regex?.test('http://example.com/path/to/page')).toBe(true);
        expect(regex?.test('example.com')).toBe(true);
        expect(regex?.test('not a url at all')).toBe(false);
      });
    });

    describe('isValidFieldType', () => {
      it('should return true for valid field types', () => {
        expect(Field.isValidFieldType('signature')).toBe(true);
        expect(Field.isValidFieldType('initials')).toBe(true);
        expect(Field.isValidFieldType('date')).toBe(true);
        expect(Field.isValidFieldType('text')).toBe(true);
        expect(Field.isValidFieldType('checkbox')).toBe(true);
      });

      it('should return false for invalid field types', () => {
        expect(Field.isValidFieldType('invalid')).toBe(false);
        expect(Field.isValidFieldType('')).toBe(false);
      });
    });

    describe('getDefaultProperties', () => {
      it('should return signature default properties', () => {
        const props = Field.getDefaultProperties('signature');
        expect(props.signatureColor).toBe('#000000');
        expect(props.backgroundColor).toBe('#FFFFFF');
        expect(props.borderWidth).toBe(1);
      });

      it('should return date default properties', () => {
        const props = Field.getDefaultProperties('date');
        expect(props.dateFormat).toBe('MM/DD/YYYY');
        expect(props.fontSize).toBe(12);
        expect(props.fontFamily).toBe('Helvetica');
      });

      it('should return text default properties', () => {
        const props = Field.getDefaultProperties('text');
        expect(props.placeholder).toBe('');
        expect(props.fontSize).toBe(12);
        expect(props.maxLength).toBe(255);
      });

      it('should return checkbox default properties', () => {
        const props = Field.getDefaultProperties('checkbox');
        expect(props.checked).toBe(false);
        expect(props.backgroundColor).toBe('#FFFFFF');
      });
    });

    describe('getMinimumDimensions', () => {
      it('should return correct minimum dimensions for signature', () => {
        const dims = Field.getMinimumDimensions('signature');
        expect(dims.width).toBe(150);
        expect(dims.height).toBe(50);
      });

      it('should return correct minimum dimensions for initials', () => {
        const dims = Field.getMinimumDimensions('initials');
        expect(dims.width).toBe(50);
        expect(dims.height).toBe(50);
      });

      it('should return correct minimum dimensions for checkbox', () => {
        const dims = Field.getMinimumDimensions('checkbox');
        expect(dims.width).toBe(15);
        expect(dims.height).toBe(15);
      });
    });
  });

  describe('meetsMinimumSize', () => {
    it('should return true for signature meeting minimum size', () => {
      const field = new Field({
        ...mockFieldData,
        type: 'signature',
        width: 150,
        height: 50,
      });
      expect(field.meetsMinimumSize()).toBe(true);
    });

    it('should return false for signature below minimum size', () => {
      const field = new Field({
        ...mockFieldData,
        type: 'signature',
        width: 100,
        height: 30,
      });
      expect(field.meetsMinimumSize()).toBe(false);
    });
  });

  describe('getDescription', () => {
    it('should return correct description for each field type', () => {
      expect(new Field({ ...mockFieldData, type: 'signature' }).getDescription()).toBe('Signature');
      expect(new Field({ ...mockFieldData, type: 'initials' }).getDescription()).toBe('Initials');
      expect(new Field({ ...mockFieldData, type: 'date' }).getDescription()).toBe('Date');
      expect(new Field({ ...mockFieldData, type: 'text' }).getDescription()).toBe('Text Input');
      expect(new Field({ ...mockFieldData, type: 'checkbox' }).getDescription()).toBe('Checkbox');
    });
  });

  describe('toJSON', () => {
    it('should convert field to JSON', () => {
      const field = new Field(mockFieldData);
      const json = field.toJSON();

      expect(json).toEqual(mockFieldData);
    });
  });

  describe('toPublicJSON', () => {
    it('should return same as toJSON for fields', () => {
      const field = new Field(mockFieldData);
      const publicJson = field.toPublicJSON();
      const json = field.toJSON();

      expect(publicJson).toEqual(json);
    });
  });
});
