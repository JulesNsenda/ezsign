import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Button from './Button';

/**
 * Tests for Button component
 */

describe('Button', () => {
  it('should render children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeDefined();
  });

  it('should call onClick when clicked', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click me</Button>);

    fireEvent.click(screen.getByText('Click me'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('should be disabled when disabled prop is true', () => {
    const handleClick = vi.fn();
    render(
      <Button disabled onClick={handleClick}>
        Click me
      </Button>,
    );

    const button = screen.getByText('Click me') as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    fireEvent.click(button);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('should show loading text when loading', () => {
    render(<Button loading>Click me</Button>);
    expect(screen.getByText('Loading...')).toBeDefined();
  });

  it('should apply variant classes', () => {
    const { rerender } = render(<Button variant="primary">Primary</Button>);
    let button = screen.getByText('Primary') as HTMLButtonElement;
    expect(button.className).toContain('bg-neutral');

    rerender(<Button variant="danger">Danger</Button>);
    button = screen.getByText('Danger') as HTMLButtonElement;
    expect(button.className).toContain('bg-error');
  });

  it('should apply size classes', () => {
    const { rerender } = render(<Button size="sm">Small</Button>);
    let button = screen.getByText('Small') as HTMLButtonElement;
    expect(button.className).toContain('text-sm');

    rerender(<Button size="lg">Large</Button>);
    button = screen.getByText('Large') as HTMLButtonElement;
    expect(button.className).toContain('text-lg');
  });

  it('should have full width when fullWidth is true', () => {
    render(<Button fullWidth>Full Width</Button>);
    const button = screen.getByText('Full Width') as HTMLButtonElement;
    expect(button.className).toContain('w-full');
  });
});
