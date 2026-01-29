import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import FieldPalette from './FieldPalette';

const renderWithDnd = (component: React.ReactElement) => {
  return render(<DndContext>{component}</DndContext>);
};

describe('FieldPalette Component', () => {
  it('should render field palette title', () => {
    renderWithDnd(<FieldPalette />);
    expect(screen.getByText('Field Types')).toBeInTheDocument();
  });

  it('should render all 5 field types', () => {
    renderWithDnd(<FieldPalette />);
    expect(screen.getByText('Signature')).toBeInTheDocument();
    expect(screen.getByText('Initials')).toBeInTheDocument();
    expect(screen.getByText('Date')).toBeInTheDocument();
    expect(screen.getByText('Text')).toBeInTheDocument();
    expect(screen.getByText('Checkbox')).toBeInTheDocument();
  });

  it('should render help text', () => {
    renderWithDnd(<FieldPalette />);
    // Each field item has "Drag to place" text
    expect(screen.getAllByText('Drag to place').length).toBeGreaterThan(0);
  });

  it('should render field icons', () => {
    renderWithDnd(<FieldPalette />);
    expect(screen.getByText('✍️')).toBeInTheDocument(); // Signature
    expect(screen.getByText('✓')).toBeInTheDocument(); // Initials
    expect(screen.getByText('📅')).toBeInTheDocument(); // Date
    expect(screen.getByText('📝')).toBeInTheDocument(); // Text
    expect(screen.getByText('☑')).toBeInTheDocument(); // Checkbox
  });
});
