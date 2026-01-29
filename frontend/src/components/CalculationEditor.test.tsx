import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CalculationEditor from './CalculationEditor';
import type { CalculationConfig, Field } from '@/types';

/**
 * Tests for CalculationEditor component
 */

describe('CalculationEditor', () => {
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
      properties: { placeholder: 'Amount 1' },
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
      properties: { placeholder: 'Amount 2' },
      created_at: new Date().toISOString(),
    },
    {
      id: 'field3',
      document_id: 'doc1',
      type: 'text',
      page: 0,
      x: 0,
      y: 100,
      width: 100,
      height: 30,
      required: false,
      properties: { placeholder: 'Total' },
      created_at: new Date().toISOString(),
    },
  ];

  const currentFieldId = 'field3';

  it('should render enable calculation checkbox', () => {
    const onChange = vi.fn();

    render(
      <CalculationEditor
        calculation={null}
        fields={mockFields}
        currentFieldId={currentFieldId}
        onChange={onChange}
      />
    );

    expect(screen.getByText('Enable Calculation')).toBeDefined();
    expect(screen.getByRole('checkbox')).toBeDefined();
  });

  it('should not show options when calculation is disabled', () => {
    const onChange = vi.fn();

    render(
      <CalculationEditor
        calculation={null}
        fields={mockFields}
        currentFieldId={currentFieldId}
        onChange={onChange}
      />
    );

    expect(screen.queryByText('Formula')).toBeNull();
    expect(screen.queryByText('Source Fields')).toBeNull();
  });

  it('should show options when calculation is enabled', () => {
    const onChange = vi.fn();
    const calculation: CalculationConfig = {
      formula: 'sum',
      fields: ['field1'],
    };

    render(
      <CalculationEditor
        calculation={calculation}
        fields={mockFields}
        currentFieldId={currentFieldId}
        onChange={onChange}
      />
    );

    expect(screen.getByText('Formula')).toBeDefined();
    expect(screen.getByText('Source Fields')).toBeDefined();
  });

  it('should call onChange with null when calculation is disabled', () => {
    const onChange = vi.fn();
    const calculation: CalculationConfig = {
      formula: 'sum',
      fields: ['field1'],
    };

    render(
      <CalculationEditor
        calculation={calculation}
        fields={mockFields}
        currentFieldId={currentFieldId}
        onChange={onChange}
      />
    );

    // Find the enable/disable checkbox by its label
    const enableLabel = screen.getByText('Enable Calculation');
    const enableCheckbox = enableLabel.closest('label')?.querySelector('input[type="checkbox"]');

    if (enableCheckbox) {
      fireEvent.click(enableCheckbox);
      expect(onChange).toHaveBeenCalledWith(null);
    }
  });

  it('should call onChange with config when calculation is enabled', () => {
    const onChange = vi.fn();

    render(
      <CalculationEditor
        calculation={null}
        fields={mockFields}
        currentFieldId={currentFieldId}
        onChange={onChange}
      />
    );

    // Find the enable/disable checkbox by its label
    const enableLabel = screen.getByText('Enable Calculation');
    const enableCheckbox = enableLabel.closest('label')?.querySelector('input[type="checkbox"]');

    if (enableCheckbox) {
      fireEvent.click(enableCheckbox);
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
        formula: 'sum',
      }));
    }
  });

  it('should display all formula options', () => {
    const onChange = vi.fn();
    const calculation: CalculationConfig = {
      formula: 'sum',
      fields: [],
    };

    render(
      <CalculationEditor
        calculation={calculation}
        fields={mockFields}
        currentFieldId={currentFieldId}
        onChange={onChange}
      />
    );

    const select = screen.getByRole('combobox');
    expect(select).toBeDefined();

    // Check that options exist
    const options = screen.getAllByRole('option');
    const optionValues = options.map((opt) => (opt as HTMLOptionElement).value);

    expect(optionValues).toContain('sum');
    expect(optionValues).toContain('average');
    expect(optionValues).toContain('min');
    expect(optionValues).toContain('max');
    expect(optionValues).toContain('count');
    expect(optionValues).toContain('concat');
    expect(optionValues).toContain('today');
  });

  it('should update formula when changed', () => {
    const onChange = vi.fn();
    const calculation: CalculationConfig = {
      formula: 'sum',
      fields: ['field1'],
    };

    render(
      <CalculationEditor
        calculation={calculation}
        fields={mockFields}
        currentFieldId={currentFieldId}
        onChange={onChange}
      />
    );

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'average' } });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      formula: 'average',
    }));
  });

  it('should not show current field in field list', () => {
    const onChange = vi.fn();
    const calculation: CalculationConfig = {
      formula: 'sum',
      fields: [],
    };

    render(
      <CalculationEditor
        calculation={calculation}
        fields={mockFields}
        currentFieldId={currentFieldId}
        onChange={onChange}
      />
    );

    // field3 (currentFieldId) should not appear in the list
    expect(screen.queryByText('Total')).toBeNull();
    // But other fields should be visible
    expect(screen.getByText('Amount 1')).toBeDefined();
    expect(screen.getByText('Amount 2')).toBeDefined();
  });

  it('should toggle field selection', () => {
    const onChange = vi.fn();
    const calculation: CalculationConfig = {
      formula: 'sum',
      fields: [],
    };

    render(
      <CalculationEditor
        calculation={calculation}
        fields={mockFields}
        currentFieldId={currentFieldId}
        onChange={onChange}
      />
    );

    // Find checkbox for field1 by finding the label text first
    const field1Label = screen.getByText('Amount 1');
    const field1Checkbox = field1Label.closest('label')?.querySelector('input[type="checkbox"]');

    if (field1Checkbox) {
      fireEvent.click(field1Checkbox);

      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
        fields: expect.arrayContaining(['field1']),
      }));
    }
  });

  it('should show separator input for concat formula', () => {
    const onChange = vi.fn();
    const calculation: CalculationConfig = {
      formula: 'concat',
      fields: ['field1', 'field2'],
      separator: ', ',
    };

    render(
      <CalculationEditor
        calculation={calculation}
        fields={mockFields}
        currentFieldId={currentFieldId}
        onChange={onChange}
      />
    );

    expect(screen.getByText('Separator')).toBeDefined();
    const separatorInput = screen.getByPlaceholderText('Space by default');
    expect(separatorInput).toBeDefined();
    expect((separatorInput as HTMLInputElement).value).toBe(', ');
  });

  it('should update separator value', () => {
    const onChange = vi.fn();
    const calculation: CalculationConfig = {
      formula: 'concat',
      fields: ['field1'],
      separator: ' ',
    };

    render(
      <CalculationEditor
        calculation={calculation}
        fields={mockFields}
        currentFieldId={currentFieldId}
        onChange={onChange}
      />
    );

    const separatorInput = screen.getByPlaceholderText('Space by default');
    fireEvent.change(separatorInput, { target: { value: ' - ' } });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      separator: ' - ',
    }));
  });

  it('should show precision input for numeric formulas', () => {
    const onChange = vi.fn();
    const calculation: CalculationConfig = {
      formula: 'sum',
      fields: ['field1'],
      precision: 2,
    };

    render(
      <CalculationEditor
        calculation={calculation}
        fields={mockFields}
        currentFieldId={currentFieldId}
        onChange={onChange}
      />
    );

    expect(screen.getByText('Decimal Places')).toBeDefined();
    const precisionInput = screen.getByPlaceholderText('Auto');
    expect(precisionInput).toBeDefined();
    expect((precisionInput as HTMLInputElement).value).toBe('2');
  });

  it('should show date format selector for today formula', () => {
    const onChange = vi.fn();
    const calculation: CalculationConfig = {
      formula: 'today',
      format: 'iso',
    };

    render(
      <CalculationEditor
        calculation={calculation}
        fields={mockFields}
        currentFieldId={currentFieldId}
        onChange={onChange}
      />
    );

    expect(screen.getByText('Date Format')).toBeDefined();
    // Should not show source fields for today formula
    expect(screen.queryByText('Source Fields')).toBeNull();
  });

  it('should not show separator for non-concat formulas', () => {
    const onChange = vi.fn();
    const calculation: CalculationConfig = {
      formula: 'sum',
      fields: ['field1'],
    };

    render(
      <CalculationEditor
        calculation={calculation}
        fields={mockFields}
        currentFieldId={currentFieldId}
        onChange={onChange}
      />
    );

    expect(screen.queryByText('Separator')).toBeNull();
  });

  it('should not show precision for non-numeric formulas', () => {
    const onChange = vi.fn();
    const calculation: CalculationConfig = {
      formula: 'concat',
      fields: ['field1'],
    };

    render(
      <CalculationEditor
        calculation={calculation}
        fields={mockFields}
        currentFieldId={currentFieldId}
        onChange={onChange}
      />
    );

    expect(screen.queryByText('Decimal Places')).toBeNull();
  });

  it('should show preview section', () => {
    const onChange = vi.fn();
    const calculation: CalculationConfig = {
      formula: 'sum',
      fields: ['field1'],
    };

    render(
      <CalculationEditor
        calculation={calculation}
        fields={mockFields}
        currentFieldId={currentFieldId}
        onChange={onChange}
      />
    );

    expect(screen.getByText('Preview:')).toBeDefined();
  });

  it('should show formula preview with field count', () => {
    const onChange = vi.fn();
    const calculation: CalculationConfig = {
      formula: 'sum',
      fields: ['field1', 'field2'],
    };

    render(
      <CalculationEditor
        calculation={calculation}
        fields={mockFields}
        currentFieldId={currentFieldId}
        onChange={onChange}
      />
    );

    expect(screen.getByText(/SUM\(2 fields\)/)).toBeDefined();
  });

  it('should show date preview for today formula', () => {
    const onChange = vi.fn();
    const calculation: CalculationConfig = {
      formula: 'today',
      format: 'iso',
    };

    render(
      <CalculationEditor
        calculation={calculation}
        fields={mockFields}
        currentFieldId={currentFieldId}
        onChange={onChange}
      />
    );

    // Should show today's date in ISO format
    const today = new Date().toISOString().split('T')[0];
    expect(screen.getByText(today)).toBeDefined();
  });

  it('should show warning when no fields selected', () => {
    const onChange = vi.fn();
    const calculation: CalculationConfig = {
      formula: 'sum',
      fields: [],
    };

    render(
      <CalculationEditor
        calculation={calculation}
        fields={mockFields}
        currentFieldId={currentFieldId}
        onChange={onChange}
      />
    );

    expect(screen.getByText('Select at least one field for the calculation.')).toBeDefined();
  });

  it('should show message when no other fields available', () => {
    const onChange = vi.fn();
    const calculation: CalculationConfig = {
      formula: 'sum',
      fields: [],
    };

    // Only the current field exists
    const singleField: Field[] = [mockFields[2]];

    render(
      <CalculationEditor
        calculation={calculation}
        fields={singleField}
        currentFieldId={currentFieldId}
        onChange={onChange}
      />
    );

    expect(screen.getByText('No other fields available. Add more fields to the document first.')).toBeDefined();
  });
});
