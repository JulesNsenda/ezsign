import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithMinimalProviders as render } from '@/test/test-utils';
import FieldProperties from './FieldProperties';
import type { Field, FieldGroup } from '@/types';

// Mock child components that might cause issues
vi.mock('./PatternSelector', () => ({
  default: ({ onChange }: { onChange: (val: any) => void }) => (
    <div data-testid="pattern-selector">
      <button onClick={() => onChange({ pattern: 'email' })}>Set Pattern</button>
    </div>
  ),
}));

vi.mock('./CalculationEditor', () => ({
  default: ({ onChange }: { onChange: (val: any) => void }) => (
    <div data-testid="calculation-editor">
      <button onClick={() => onChange({ formula: 'sum', fields: [] })}>Set Calculation</button>
    </div>
  ),
}));

vi.mock('./RadioOptionsEditor', () => ({
  default: ({ onChange }: { onChange: (val: any) => void }) => (
    <div data-testid="radio-options-editor">
      <button onClick={() => onChange([{ label: 'Test', value: 'test' }])}>Set Options</button>
    </div>
  ),
}));

const createMockField = (overrides: Partial<Field> = {}): Field => ({
  id: 'field-1',
  document_id: 'doc-1',
  type: 'text',
  page: 0,
  x: 100,
  y: 200,
  width: 200,
  height: 50,
  required: false,
  signer_email: undefined,
  properties: undefined,
  visibility_rules: null,
  calculation: null,
  group_id: null,
  group_sort_order: null,
  created_at: new Date().toISOString(),
  ...overrides,
});

const mockSigners = [
  { id: 'signer-1', email: 'john@example.com', name: 'John Doe' },
  { id: 'signer-2', email: 'jane@example.com', name: 'Jane Smith' },
];

const mockGroups: FieldGroup[] = [
  { id: 'group-1', document_id: 'doc-1', name: 'Group 1', description: null, sort_order: 0, collapsed: false, color: null, created_at: '', updated_at: '' },
  { id: 'group-2', document_id: 'doc-1', name: 'Group 2', description: null, sort_order: 1, collapsed: false, color: null, created_at: '', updated_at: '' },
];

describe('FieldProperties Component', () => {
  describe('No Field Selected', () => {
    it('should show placeholder when no field is selected', () => {
      render(
        <FieldProperties
          field={null}
          signers={mockSigners}
          onUpdate={() => {}}
          onDelete={() => {}}
          onClose={() => {}}
        />
      );

      expect(screen.getByText('Select a field')).toBeInTheDocument();
      expect(screen.getByText('Click on a field to edit')).toBeInTheDocument();
    });
  });

  describe('Basic Field Properties', () => {
    it('should display field type', () => {
      const field = createMockField({ type: 'signature' });
      render(
        <FieldProperties
          field={field}
          signers={mockSigners}
          onUpdate={() => {}}
          onDelete={() => {}}
          onClose={() => {}}
        />
      );

      expect(screen.getByText('signature')).toBeInTheDocument();
    });

    it('should display page number (1-indexed)', () => {
      const field = createMockField({ page: 2 });
      render(
        <FieldProperties
          field={field}
          signers={mockSigners}
          onUpdate={() => {}}
          onDelete={() => {}}
          onClose={() => {}}
        />
      );

      expect(screen.getByText('Page 3')).toBeInTheDocument();
    });

    it('should display position inputs', () => {
      const field = createMockField({ x: 150, y: 250 });
      render(
        <FieldProperties
          field={field}
          signers={mockSigners}
          onUpdate={() => {}}
          onDelete={() => {}}
          onClose={() => {}}
        />
      );

      const xInput = screen.getByDisplayValue('150');
      const yInput = screen.getByDisplayValue('250');
      expect(xInput).toBeInTheDocument();
      expect(yInput).toBeInTheDocument();
    });

    it('should display size inputs', () => {
      const field = createMockField({ width: 180, height: 45 });
      render(
        <FieldProperties
          field={field}
          signers={mockSigners}
          onUpdate={() => {}}
          onDelete={() => {}}
          onClose={() => {}}
        />
      );

      const widthInput = screen.getByDisplayValue('180');
      const heightInput = screen.getByDisplayValue('45');
      expect(widthInput).toBeInTheDocument();
      expect(heightInput).toBeInTheDocument();
    });

    it('should display required checkbox', () => {
      const field = createMockField({ required: true });
      render(
        <FieldProperties
          field={field}
          signers={mockSigners}
          onUpdate={() => {}}
          onDelete={() => {}}
          onClose={() => {}}
        />
      );

      expect(screen.getByText('Required field')).toBeInTheDocument();
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeChecked();
    });
  });

  describe('Update Handlers', () => {
    it('should call onUpdate when position X changes', () => {
      const handleUpdate = vi.fn();
      const field = createMockField({ x: 100 });
      render(
        <FieldProperties
          field={field}
          signers={mockSigners}
          onUpdate={handleUpdate}
          onDelete={() => {}}
          onClose={() => {}}
        />
      );

      const xInput = screen.getByDisplayValue('100');
      fireEvent.change(xInput, { target: { value: '150' } });
      expect(handleUpdate).toHaveBeenCalledWith({ x: 150 });
    });

    it('should call onUpdate when position Y changes', () => {
      const handleUpdate = vi.fn();
      const field = createMockField({ x: 111, y: 222, width: 333, height: 44 });
      render(
        <FieldProperties
          field={field}
          signers={mockSigners}
          onUpdate={handleUpdate}
          onDelete={() => {}}
          onClose={() => {}}
        />
      );

      const yInput = screen.getByDisplayValue('222');
      fireEvent.change(yInput, { target: { value: '250' } });
      expect(handleUpdate).toHaveBeenCalledWith({ y: 250 });
    });

    it('should call onUpdate when width changes', () => {
      const handleUpdate = vi.fn();
      const field = createMockField({ x: 101, y: 201, width: 301, height: 51 });
      render(
        <FieldProperties
          field={field}
          signers={mockSigners}
          onUpdate={handleUpdate}
          onDelete={() => {}}
          onClose={() => {}}
        />
      );

      const widthInput = screen.getByDisplayValue('301');
      fireEvent.change(widthInput, { target: { value: '350' } });
      expect(handleUpdate).toHaveBeenCalledWith({ width: 350 });
    });

    it('should call onUpdate when height changes', () => {
      const handleUpdate = vi.fn();
      const field = createMockField({ x: 102, y: 202, width: 302, height: 52 });
      render(
        <FieldProperties
          field={field}
          signers={mockSigners}
          onUpdate={handleUpdate}
          onDelete={() => {}}
          onClose={() => {}}
        />
      );

      const heightInput = screen.getByDisplayValue('52');
      fireEvent.change(heightInput, { target: { value: '75' } });
      expect(handleUpdate).toHaveBeenCalledWith({ height: 75 });
    });

    it('should call onUpdate when required checkbox changes', () => {
      const handleUpdate = vi.fn();
      const field = createMockField({ required: false });
      render(
        <FieldProperties
          field={field}
          signers={mockSigners}
          onUpdate={handleUpdate}
          onDelete={() => {}}
          onClose={() => {}}
        />
      );

      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);
      expect(handleUpdate).toHaveBeenCalledWith({ required: true });
    });
  });

  describe('Signer Assignment', () => {
    it('should display signer dropdown', () => {
      const field = createMockField();
      render(
        <FieldProperties
          field={field}
          signers={mockSigners}
          onUpdate={() => {}}
          onDelete={() => {}}
          onClose={() => {}}
        />
      );

      expect(screen.getByText('Assign to Signer')).toBeInTheDocument();
      expect(screen.getByText('John Doe (john@example.com)')).toBeInTheDocument();
      expect(screen.getByText('Jane Smith (jane@example.com)')).toBeInTheDocument();
    });

    it('should call onUpdate when signer is selected', () => {
      const handleUpdate = vi.fn();
      const field = createMockField();
      render(
        <FieldProperties
          field={field}
          signers={mockSigners}
          onUpdate={handleUpdate}
          onDelete={() => {}}
          onClose={() => {}}
        />
      );

      const select = screen.getByRole('combobox', { name: /assign field to signer/i });
      fireEvent.change(select, { target: { value: 'john@example.com' } });
      expect(handleUpdate).toHaveBeenCalledWith({ signer_email: 'john@example.com' });
    });

    it('should show warning when no signers', () => {
      const field = createMockField();
      render(
        <FieldProperties
          field={field}
          signers={[]}
          onUpdate={() => {}}
          onDelete={() => {}}
          onClose={() => {}}
        />
      );

      expect(screen.getByText('Add signers first to assign fields')).toBeInTheDocument();
    });
  });

  describe('Group Assignment', () => {
    it('should display group dropdown when groups exist', () => {
      const field = createMockField();
      render(
        <FieldProperties
          field={field}
          signers={mockSigners}
          groups={mockGroups}
          onUpdate={() => {}}
          onDelete={() => {}}
          onClose={() => {}}
          onGroupChange={() => {}}
        />
      );

      expect(screen.getByText('Field Group')).toBeInTheDocument();
      expect(screen.getByText('Group 1')).toBeInTheDocument();
      expect(screen.getByText('Group 2')).toBeInTheDocument();
    });

    it('should call onGroupChange when group is selected', () => {
      const handleGroupChange = vi.fn();
      const field = createMockField();
      render(
        <FieldProperties
          field={field}
          signers={mockSigners}
          groups={mockGroups}
          onUpdate={() => {}}
          onDelete={() => {}}
          onClose={() => {}}
          onGroupChange={handleGroupChange}
        />
      );

      const selects = screen.getAllByRole('combobox');
      const groupSelect = selects[selects.length - 1]; // Group select is the last one
      fireEvent.change(groupSelect, { target: { value: 'group-1' } });
      expect(handleGroupChange).toHaveBeenCalledWith('field-1', 'group-1');
    });

    it('should not display group dropdown when no groups', () => {
      const field = createMockField();
      render(
        <FieldProperties
          field={field}
          signers={mockSigners}
          groups={[]}
          onUpdate={() => {}}
          onDelete={() => {}}
          onClose={() => {}}
        />
      );

      expect(screen.queryByText('Field Group')).not.toBeInTheDocument();
    });
  });

  describe('Text Field Options', () => {
    it('should display text field specific options', () => {
      const field = createMockField({ type: 'text' });
      render(
        <FieldProperties
          field={field}
          signers={mockSigners}
          onUpdate={() => {}}
          onDelete={() => {}}
          onClose={() => {}}
        />
      );

      expect(screen.getByText('Placeholder Text')).toBeInTheDocument();
      expect(screen.getByText('Max Characters')).toBeInTheDocument();
      expect(screen.getByTestId('pattern-selector')).toBeInTheDocument();
      expect(screen.getByTestId('calculation-editor')).toBeInTheDocument();
    });
  });

  describe('Checkbox Field Options', () => {
    it('should display checkbox field specific options', () => {
      const field = createMockField({ type: 'checkbox' });
      render(
        <FieldProperties
          field={field}
          signers={mockSigners}
          onUpdate={() => {}}
          onDelete={() => {}}
          onClose={() => {}}
        />
      );

      expect(screen.getByText('Check Style')).toBeInTheDocument();
      expect(screen.getByText('Checkmark (✓)')).toBeInTheDocument();
    });
  });

  describe('Radio Field Options', () => {
    it('should display radio field specific options', () => {
      const field = createMockField({ type: 'radio' });
      render(
        <FieldProperties
          field={field}
          signers={mockSigners}
          onUpdate={() => {}}
          onDelete={() => {}}
          onClose={() => {}}
        />
      );

      expect(screen.getByTestId('radio-options-editor')).toBeInTheDocument();
      expect(screen.getByText('Layout')).toBeInTheDocument();
      expect(screen.getByText('Font Size')).toBeInTheDocument();
      expect(screen.getByText('Option Spacing (px)')).toBeInTheDocument();
    });
  });

  describe('Dropdown Field Options', () => {
    it('should display dropdown field specific options', () => {
      const field = createMockField({ type: 'dropdown' });
      render(
        <FieldProperties
          field={field}
          signers={mockSigners}
          onUpdate={() => {}}
          onDelete={() => {}}
          onClose={() => {}}
        />
      );

      expect(screen.getByTestId('radio-options-editor')).toBeInTheDocument();
      expect(screen.getByText('Placeholder Text')).toBeInTheDocument();
      expect(screen.getByText('Font Size')).toBeInTheDocument();
    });
  });

  describe('Textarea Field Options', () => {
    it('should display textarea field specific options', () => {
      const field = createMockField({ type: 'textarea' });
      render(
        <FieldProperties
          field={field}
          signers={mockSigners}
          onUpdate={() => {}}
          onDelete={() => {}}
          onClose={() => {}}
        />
      );

      expect(screen.getByText('Placeholder Text')).toBeInTheDocument();
      expect(screen.getByText('Visible Rows')).toBeInTheDocument();
      expect(screen.getByText('Max Characters')).toBeInTheDocument();
      expect(screen.getByText('Font Size')).toBeInTheDocument();
      expect(screen.getByTestId('pattern-selector')).toBeInTheDocument();
    });
  });

  describe('Delete and Close', () => {
    it('should call onDelete when delete button is clicked', () => {
      const handleDelete = vi.fn();
      const field = createMockField();
      render(
        <FieldProperties
          field={field}
          signers={mockSigners}
          onUpdate={() => {}}
          onDelete={handleDelete}
          onClose={() => {}}
        />
      );

      fireEvent.click(screen.getByText('Delete Field'));
      expect(handleDelete).toHaveBeenCalledTimes(1);
    });

    it('should call onClose when close button is clicked', () => {
      const handleClose = vi.fn();
      const field = createMockField();
      render(
        <FieldProperties
          field={field}
          signers={mockSigners}
          onUpdate={() => {}}
          onDelete={() => {}}
          onClose={handleClose}
        />
      );

      fireEvent.click(screen.getByText('×'));
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });
});
