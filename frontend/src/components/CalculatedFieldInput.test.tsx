import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CalculatedFieldInput, { evaluateCalculation } from './CalculatedFieldInput';
import type { CalculationConfig, Field } from '@/types';

/**
 * Tests for CalculatedFieldInput component and evaluateCalculation function
 */

describe('evaluateCalculation', () => {
  describe('sum formula', () => {
    it('should calculate sum of numeric values', () => {
      const config: CalculationConfig = {
        formula: 'sum',
        fields: ['field1', 'field2', 'field3'],
      };
      const values = new Map<string, string | number | boolean | null>([
        ['field1', 10],
        ['field2', 20],
        ['field3', 30],
      ]);

      expect(evaluateCalculation(config, values)).toBe(60);
    });

    it('should handle string numbers', () => {
      const config: CalculationConfig = {
        formula: 'sum',
        fields: ['field1', 'field2'],
      };
      const values = new Map<string, string | number | boolean | null>([
        ['field1', '15.5'],
        ['field2', '24.5'],
      ]);

      expect(evaluateCalculation(config, values)).toBe(40);
    });

    it('should skip non-numeric values', () => {
      const config: CalculationConfig = {
        formula: 'sum',
        fields: ['field1', 'field2', 'field3'],
      };
      const values = new Map<string, string | number | boolean | null>([
        ['field1', 10],
        ['field2', 'not a number'],
        ['field3', 20],
      ]);

      expect(evaluateCalculation(config, values)).toBe(30);
    });

    it('should apply precision', () => {
      const config: CalculationConfig = {
        formula: 'sum',
        fields: ['field1', 'field2'],
        precision: 2,
      };
      const values = new Map<string, string | number | boolean | null>([
        ['field1', 10.1234],
        ['field2', 20.5678],
      ]);

      expect(evaluateCalculation(config, values)).toBe(30.69);
    });

    it('should return 0 for empty fields array', () => {
      const config: CalculationConfig = {
        formula: 'sum',
        fields: [],
      };
      const values = new Map<string, string | number | boolean | null>();

      expect(evaluateCalculation(config, values)).toBe(0);
    });
  });

  describe('average formula', () => {
    it('should calculate average of numeric values', () => {
      const config: CalculationConfig = {
        formula: 'average',
        fields: ['field1', 'field2', 'field3'],
      };
      const values = new Map<string, string | number | boolean | null>([
        ['field1', 10],
        ['field2', 20],
        ['field3', 30],
      ]);

      expect(evaluateCalculation(config, values)).toBe(20);
    });

    it('should only count valid numeric values', () => {
      const config: CalculationConfig = {
        formula: 'average',
        fields: ['field1', 'field2', 'field3'],
      };
      const values = new Map<string, string | number | boolean | null>([
        ['field1', 10],
        ['field2', 'invalid'],
        ['field3', 20],
      ]);

      expect(evaluateCalculation(config, values)).toBe(15); // (10+20)/2
    });

    it('should return 0 for no valid values', () => {
      const config: CalculationConfig = {
        formula: 'average',
        fields: ['field1'],
      };
      const values = new Map<string, string | number | boolean | null>([
        ['field1', 'not a number'],
      ]);

      expect(evaluateCalculation(config, values)).toBe(0);
    });
  });

  describe('min formula', () => {
    it('should find minimum value', () => {
      const config: CalculationConfig = {
        formula: 'min',
        fields: ['field1', 'field2', 'field3'],
      };
      const values = new Map<string, string | number | boolean | null>([
        ['field1', 30],
        ['field2', 10],
        ['field3', 20],
      ]);

      expect(evaluateCalculation(config, values)).toBe(10);
    });

    it('should handle negative numbers', () => {
      const config: CalculationConfig = {
        formula: 'min',
        fields: ['field1', 'field2'],
      };
      const values = new Map<string, string | number | boolean | null>([
        ['field1', -5],
        ['field2', 10],
      ]);

      expect(evaluateCalculation(config, values)).toBe(-5);
    });

    it('should return null for empty fields', () => {
      const config: CalculationConfig = {
        formula: 'min',
        fields: [],
      };
      const values = new Map<string, string | number | boolean | null>();

      expect(evaluateCalculation(config, values)).toBeNull();
    });
  });

  describe('max formula', () => {
    it('should find maximum value', () => {
      const config: CalculationConfig = {
        formula: 'max',
        fields: ['field1', 'field2', 'field3'],
      };
      const values = new Map<string, string | number | boolean | null>([
        ['field1', 30],
        ['field2', 10],
        ['field3', 20],
      ]);

      expect(evaluateCalculation(config, values)).toBe(30);
    });
  });

  describe('count formula', () => {
    it('should count non-empty values', () => {
      const config: CalculationConfig = {
        formula: 'count',
        fields: ['field1', 'field2', 'field3', 'field4'],
      };
      const values = new Map<string, string | number | boolean | null>([
        ['field1', 'value'],
        ['field2', ''],
        ['field3', 123],
        ['field4', null],
      ]);

      expect(evaluateCalculation(config, values)).toBe(2);
    });

    it('should count boolean values', () => {
      const config: CalculationConfig = {
        formula: 'count',
        fields: ['field1', 'field2'],
      };
      const values = new Map<string, string | number | boolean | null>([
        ['field1', true],
        ['field2', false],
      ]);

      expect(evaluateCalculation(config, values)).toBe(2);
    });
  });

  describe('concat formula', () => {
    it('should concatenate values with default separator', () => {
      const config: CalculationConfig = {
        formula: 'concat',
        fields: ['field1', 'field2', 'field3'],
      };
      const values = new Map<string, string | number | boolean | null>([
        ['field1', 'Hello'],
        ['field2', 'World'],
        ['field3', '!'],
      ]);

      expect(evaluateCalculation(config, values)).toBe('Hello World !');
    });

    it('should use custom separator', () => {
      const config: CalculationConfig = {
        formula: 'concat',
        fields: ['field1', 'field2'],
        separator: ', ',
      };
      const values = new Map<string, string | number | boolean | null>([
        ['field1', 'John'],
        ['field2', 'Doe'],
      ]);

      expect(evaluateCalculation(config, values)).toBe('John, Doe');
    });

    it('should skip empty values', () => {
      const config: CalculationConfig = {
        formula: 'concat',
        fields: ['field1', 'field2', 'field3'],
        separator: '-',
      };
      const values = new Map<string, string | number | boolean | null>([
        ['field1', 'A'],
        ['field2', ''],
        ['field3', 'B'],
      ]);

      expect(evaluateCalculation(config, values)).toBe('A-B');
    });

    it('should convert numbers to strings', () => {
      const config: CalculationConfig = {
        formula: 'concat',
        fields: ['field1', 'field2'],
        separator: ': ',
      };
      const values = new Map<string, string | number | boolean | null>([
        ['field1', 'Total'],
        ['field2', 100],
      ]);

      expect(evaluateCalculation(config, values)).toBe('Total: 100');
    });
  });

  describe('today formula', () => {
    it('should return ISO formatted date by default', () => {
      const config: CalculationConfig = {
        formula: 'today',
      };
      const values = new Map<string, string | number | boolean | null>();

      const result = evaluateCalculation(config, values);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should return ISO formatted date with iso format', () => {
      const config: CalculationConfig = {
        formula: 'today',
        format: 'iso',
      };
      const values = new Map<string, string | number | boolean | null>();

      const result = evaluateCalculation(config, values);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should return short formatted date', () => {
      const config: CalculationConfig = {
        formula: 'today',
        format: 'short',
      };
      const values = new Map<string, string | number | boolean | null>();

      const result = evaluateCalculation(config, values);
      expect(result).toMatch(/^\d{1,2}\/\d{1,2}\/\d{4}$/);
    });

    it('should return locale formatted date', () => {
      const config: CalculationConfig = {
        formula: 'today',
        format: 'locale',
      };
      const values = new Map<string, string | number | boolean | null>();

      const result = evaluateCalculation(config, values);
      expect(typeof result).toBe('string');
      expect((result as string).length).toBeGreaterThan(0);
    });
  });

  describe('unknown formula', () => {
    it('should return null for unknown formula', () => {
      const config = {
        formula: 'unknown' as any,
        fields: ['field1'],
      };
      const values = new Map<string, string | number | boolean | null>([
        ['field1', 'value'],
      ]);

      expect(evaluateCalculation(config, values)).toBeNull();
    });
  });
});

describe('CalculatedFieldInput component', () => {
  const mockFields: Field[] = [
    {
      id: 'field1',
      document_id: 'doc1',
      type: 'text',
      page: 0,
      x: 0,
      y: 0,
      width: 100,
      height: 30,
      required: false,
      properties: { placeholder: 'Field 1' },
      created_at: new Date().toISOString(),
    },
    {
      id: 'field2',
      document_id: 'doc1',
      type: 'text',
      page: 0,
      x: 0,
      y: 50,
      width: 100,
      height: 30,
      required: false,
      properties: { placeholder: 'Field 2' },
      created_at: new Date().toISOString(),
    },
  ];

  it('should display calculated sum value', () => {
    const config: CalculationConfig = {
      formula: 'sum',
      fields: ['field1', 'field2'],
    };
    const values = new Map<string, string | number | boolean | null>([
      ['field1', 10],
      ['field2', 20],
    ]);

    render(
      <CalculatedFieldInput
        calculation={config}
        fields={mockFields}
        fieldValues={values}
      />
    );

    expect(screen.getByText('30')).toBeDefined();
    expect(screen.getByText('Sum of selected fields')).toBeDefined();
  });

  it('should display today date value', () => {
    const config: CalculationConfig = {
      formula: 'today',
      format: 'iso',
    };
    const values = new Map<string, string | number | boolean | null>();

    render(
      <CalculatedFieldInput
        calculation={config}
        fields={mockFields}
        fieldValues={values}
      />
    );

    expect(screen.getByText("Today's date")).toBeDefined();
    expect(screen.getByText('TODAY')).toBeDefined();
  });

  it('should call onSave when Accept button is clicked', () => {
    const onSave = vi.fn();
    const config: CalculationConfig = {
      formula: 'sum',
      fields: ['field1', 'field2'],
    };
    const values = new Map<string, string | number | boolean | null>([
      ['field1', 10],
      ['field2', 20],
    ]);

    render(
      <CalculatedFieldInput
        calculation={config}
        fields={mockFields}
        fieldValues={values}
        onSave={onSave}
      />
    );

    const acceptButton = screen.getByText('Accept Value');
    fireEvent.click(acceptButton);

    expect(onSave).toHaveBeenCalledWith(30);
  });

  it('should call onClose when Cancel button is clicked', () => {
    const onClose = vi.fn();
    const config: CalculationConfig = {
      formula: 'sum',
      fields: ['field1'],
    };
    const values = new Map<string, string | number | boolean | null>();

    render(
      <CalculatedFieldInput
        calculation={config}
        fields={mockFields}
        fieldValues={values}
        onClose={onClose}
      />
    );

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should display formula type badge', () => {
    const config: CalculationConfig = {
      formula: 'average',
      fields: ['field1', 'field2'],
    };
    const values = new Map<string, string | number | boolean | null>([
      ['field1', 10],
      ['field2', 20],
    ]);

    render(
      <CalculatedFieldInput
        calculation={config}
        fields={mockFields}
        fieldValues={values}
      />
    );

    expect(screen.getByText('AVERAGE')).toBeDefined();
  });

  it('should display dash for null result', () => {
    const config: CalculationConfig = {
      formula: 'min',
      fields: [],
    };
    const values = new Map<string, string | number | boolean | null>();

    render(
      <CalculatedFieldInput
        calculation={config}
        fields={mockFields}
        fieldValues={values}
      />
    );

    expect(screen.getByText('—')).toBeDefined();
  });

  it('should display separator info for concat formula', () => {
    const config: CalculationConfig = {
      formula: 'concat',
      fields: ['field1', 'field2'],
      separator: ', ',
    };
    const values = new Map<string, string | number | boolean | null>([
      ['field1', 'John'],
      ['field2', 'Doe'],
    ]);

    render(
      <CalculatedFieldInput
        calculation={config}
        fields={mockFields}
        fieldValues={values}
      />
    );

    expect(screen.getByText('Separator:')).toBeDefined();
    expect(screen.getByText('", "')).toBeDefined();
  });

  it('should display precision info for numeric formulas', () => {
    const config: CalculationConfig = {
      formula: 'sum',
      fields: ['field1'],
      precision: 2,
    };
    const values = new Map<string, string | number | boolean | null>([
      ['field1', 10.555],
    ]);

    render(
      <CalculatedFieldInput
        calculation={config}
        fields={mockFields}
        fieldValues={values}
      />
    );

    expect(screen.getByText('Decimal places:')).toBeDefined();
    expect(screen.getByText('2')).toBeDefined();
  });

  it('should display referenced field names', () => {
    const config: CalculationConfig = {
      formula: 'sum',
      fields: ['field1', 'field2'],
    };
    const values = new Map<string, string | number | boolean | null>([
      ['field1', 10],
      ['field2', 20],
    ]);

    render(
      <CalculatedFieldInput
        calculation={config}
        fields={mockFields}
        fieldValues={values}
      />
    );

    expect(screen.getByText(/Based on:/)).toBeDefined();
    expect(screen.getByText(/Field 1/)).toBeDefined();
  });
});
