import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SignaturePad from './SignaturePad';

// Mock signature_pad
vi.mock('signature_pad', () => ({
  default: vi.fn(() => ({
    isEmpty: vi.fn(() => false),
    toDataURL: vi.fn(() => 'data:image/png;base64,test'),
    clear: vi.fn(),
    off: vi.fn(),
  })),
}));

describe('SignaturePad Component', () => {
  it('should render signature pad with modes', () => {
    render(<SignaturePad onSave={vi.fn()} />);
    expect(screen.getByText('Draw')).toBeInTheDocument();
    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(screen.getByText('Upload')).toBeInTheDocument();
  });

  it('should render clear button', () => {
    render(<SignaturePad onSave={vi.fn()} />);
    expect(screen.getByText('Clear')).toBeInTheDocument();
  });

  it('should render save signature button', () => {
    render(<SignaturePad onSave={vi.fn()} />);
    expect(screen.getByText('Save Signature')).toBeInTheDocument();
  });

  it('should render cancel button when onCancel is provided', () => {
    render(<SignaturePad onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('should switch to typed mode when clicked', () => {
    render(<SignaturePad onSave={vi.fn()} />);
    const typeButton = screen.getByText('Type');
    fireEvent.click(typeButton);
    expect(screen.getByPlaceholderText('Type your name')).toBeInTheDocument();
  });

  it('should switch to upload mode when clicked', () => {
    render(<SignaturePad onSave={vi.fn()} />);
    const uploadButton = screen.getByText('Upload');
    fireEvent.click(uploadButton);
    expect(screen.getByText(/Upload PNG or JPG image/)).toBeInTheDocument();
  });

  it('should call onCancel when cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(<SignaturePad onSave={vi.fn()} onCancel={onCancel} />);
    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
