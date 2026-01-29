import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { ThemeProvider } from '@/contexts/ThemeContext';
import DraggableField from './DraggableField';
import type { Field } from '@/types';

const renderWithDnd = (component: React.ReactElement) => {
  return render(
    <ThemeProvider>
      <DndContext>{component}</DndContext>
    </ThemeProvider>
  );
};

const createMockField = (overrides: Partial<Field> = {}): Field => ({
  id: 'field-1',
  document_id: 'doc-1',
  type: 'signature',
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

describe('DraggableField Component', () => {
  describe('Basic Rendering', () => {
    it('should render field with correct label', () => {
      const field = createMockField({ type: 'signature' });
      renderWithDnd(<DraggableField field={field} />);
      expect(screen.getByText('Signature')).toBeInTheDocument();
    });

    it('should render different field type labels', () => {
      const fieldTypes = [
        { type: 'signature', label: 'Signature' },
        { type: 'initials', label: 'Initials' },
        { type: 'date', label: 'Date' },
        { type: 'text', label: 'Text' },
        { type: 'textarea', label: 'Textarea' },
        { type: 'checkbox', label: 'Checkbox' },
        { type: 'radio', label: 'Radio' },
        { type: 'dropdown', label: 'Dropdown' },
      ] as const;

      fieldTypes.forEach(({ type, label }) => {
        const field = createMockField({ type, id: `field-${type}` });
        const { unmount } = renderWithDnd(<DraggableField field={field} />);
        expect(screen.getByText(label)).toBeInTheDocument();
        unmount();
      });
    });

    it('should show required indicator when field is required', () => {
      const field = createMockField({ required: true });
      renderWithDnd(<DraggableField field={field} />);
      expect(screen.getByText('*')).toBeInTheDocument();
    });

    it('should not show required indicator when field is not required', () => {
      const field = createMockField({ required: false });
      renderWithDnd(<DraggableField field={field} />);
      expect(screen.queryByText('*')).not.toBeInTheDocument();
    });

    it('should display signer email username when assigned', () => {
      const field = createMockField({ signer_email: 'john.doe@example.com' });
      renderWithDnd(<DraggableField field={field} />);
      expect(screen.getByText('john.doe')).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('should show delete button when selected', () => {
      const field = createMockField();
      renderWithDnd(
        <DraggableField field={field} isSelected={true} />
      );

      // When selected, delete button is visible
      expect(screen.getByTitle('Delete field')).toBeInTheDocument();
    });

    it('should hide delete button when not selected', () => {
      const field = createMockField();
      renderWithDnd(
        <DraggableField field={field} isSelected={false} />
      );

      // When not selected, delete button should not be visible
      expect(screen.queryByTitle('Delete field')).not.toBeInTheDocument();
    });

    it('should accept custom border color prop', () => {
      const field = createMockField();
      const customColor = '#ff0000';
      renderWithDnd(
        <DraggableField field={field} borderColor={customColor} />
      );

      // Component should render correctly with custom color
      expect(screen.getByText('Signature')).toBeInTheDocument();
    });

    it('should scale position and dimensions correctly', () => {
      const field = createMockField({ x: 100, y: 200, width: 200, height: 50 });
      const scale = 1.5;
      const { container } = renderWithDnd(
        <DraggableField field={field} scale={scale} />
      );

      const fieldElement = container.firstChild as HTMLElement;
      expect(fieldElement.style.left).toBe('150px'); // 100 * 1.5
      expect(fieldElement.style.top).toBe('300px'); // 200 * 1.5
      expect(fieldElement.style.width).toBe('300px'); // 200 * 1.5
      expect(fieldElement.style.height).toBe('75px'); // 50 * 1.5
    });
  });

  describe('Interactions', () => {
    it('should call onClick when clicked', () => {
      const handleClick = vi.fn();
      const field = createMockField();
      const { container } = renderWithDnd(
        <DraggableField field={field} onClick={handleClick} />
      );

      fireEvent.click(container.firstChild as HTMLElement);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('should show delete button when selected', () => {
      const field = createMockField();
      renderWithDnd(<DraggableField field={field} isSelected={true} />);

      expect(screen.getByTitle('Delete field')).toBeInTheDocument();
    });

    it('should not show delete button when not selected', () => {
      const field = createMockField();
      renderWithDnd(<DraggableField field={field} isSelected={false} />);

      expect(screen.queryByTitle('Delete field')).not.toBeInTheDocument();
    });

    it('should call onDelete when delete button is clicked', () => {
      const handleDelete = vi.fn();
      const field = createMockField();
      renderWithDnd(
        <DraggableField field={field} isSelected={true} onDelete={handleDelete} />
      );

      fireEvent.click(screen.getByTitle('Delete field'));
      expect(handleDelete).toHaveBeenCalledTimes(1);
    });

    it('should show resize handles when selected and onResize is provided', () => {
      const handleResize = vi.fn();
      const field = createMockField();
      renderWithDnd(
        <DraggableField field={field} isSelected={true} onResize={handleResize} />
      );

      // Should have resize handles (bottom-right, right, bottom)
      expect(screen.getByTitle('Resize field')).toBeInTheDocument();
    });

    it('should not show resize handles when not selected', () => {
      const handleResize = vi.fn();
      const field = createMockField();
      renderWithDnd(
        <DraggableField field={field} isSelected={false} onResize={handleResize} />
      );

      expect(screen.queryByTitle('Resize field')).not.toBeInTheDocument();
    });
  });

  describe('Field Type Colors', () => {
    it('should render signature field with correct label', () => {
      const field = createMockField({ type: 'signature' });
      renderWithDnd(<DraggableField field={field} />);

      expect(screen.getByText('Signature')).toBeInTheDocument();
    });

    it('should render text field with correct label', () => {
      const field = createMockField({ type: 'text' });
      renderWithDnd(<DraggableField field={field} />);

      expect(screen.getByText('Text')).toBeInTheDocument();
    });

    it('should render checkbox field with correct label', () => {
      const field = createMockField({ type: 'checkbox' });
      renderWithDnd(<DraggableField field={field} />);

      expect(screen.getByText('Checkbox')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have cursor grab style', () => {
      const field = createMockField();
      const { container } = renderWithDnd(<DraggableField field={field} />);

      const fieldElement = container.firstChild as HTMLElement;
      expect(fieldElement.style.cursor).toBe('grab');
    });

    it('should prevent text selection', () => {
      const field = createMockField();
      const { container } = renderWithDnd(<DraggableField field={field} />);

      const fieldElement = container.firstChild as HTMLElement;
      expect(fieldElement.style.userSelect).toBe('none');
    });
  });
});
