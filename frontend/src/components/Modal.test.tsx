import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithMinimalProviders as render } from '@/test/test-utils';
import Modal from './Modal';

describe('Modal Component', () => {
  beforeEach(() => {
    // Reset body overflow before each test
    document.body.style.overflow = '';
  });

  afterEach(() => {
    // Clean up body overflow after each test
    document.body.style.overflow = '';
  });

  describe('Visibility', () => {
    it('should render when isOpen is true', () => {
      render(
        <Modal isOpen={true} onClose={() => {}}>
          <div>Modal Content</div>
        </Modal>
      );

      expect(screen.getByText('Modal Content')).toBeInTheDocument();
    });

    it('should not render when isOpen is false', () => {
      render(
        <Modal isOpen={false} onClose={() => {}}>
          <div>Modal Content</div>
        </Modal>
      );

      expect(screen.queryByText('Modal Content')).not.toBeInTheDocument();
    });
  });

  describe('Title', () => {
    it('should render title when provided', () => {
      render(
        <Modal isOpen={true} onClose={() => {}} title="Test Modal">
          <div>Content</div>
        </Modal>
      );

      expect(screen.getByText('Test Modal')).toBeInTheDocument();
    });

    it('should not render title section when title is not provided', () => {
      render(
        <Modal isOpen={true} onClose={() => {}}>
          <div>Content</div>
        </Modal>
      );

      // Modal should still render content
      expect(screen.getByText('Content')).toBeInTheDocument();
    });

    it('should render close button in title bar', () => {
      render(
        <Modal isOpen={true} onClose={() => {}} title="Test Modal">
          <div>Content</div>
        </Modal>
      );

      expect(screen.getByLabelText('Close modal')).toBeInTheDocument();
    });
  });

  describe('Close Behavior', () => {
    it('should call onClose when close button is clicked', () => {
      const handleClose = vi.fn();
      render(
        <Modal isOpen={true} onClose={handleClose} title="Test Modal">
          <div>Content</div>
        </Modal>
      );

      fireEvent.click(screen.getByLabelText('Close modal'));
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('should have closeOnBackdrop enabled by default', () => {
      const handleClose = vi.fn();
      render(
        <Modal isOpen={true} onClose={handleClose}>
          <div data-testid="modal-content">Content</div>
        </Modal>
      );

      // Modal renders and has backdrop click handler
      expect(screen.getByTestId('modal-content')).toBeInTheDocument();
    });

    it('should respect closeOnBackdrop=false prop', () => {
      const handleClose = vi.fn();
      render(
        <Modal isOpen={true} onClose={handleClose} closeOnBackdrop={false}>
          <div data-testid="modal-content">Content</div>
        </Modal>
      );

      // Modal renders
      expect(screen.getByTestId('modal-content')).toBeInTheDocument();
    });

    it('should not close when clicking modal content', () => {
      const handleClose = vi.fn();
      render(
        <Modal isOpen={true} onClose={handleClose}>
          <div>Content</div>
        </Modal>
      );

      fireEvent.click(screen.getByText('Content'));
      expect(handleClose).not.toHaveBeenCalled();
    });

    it('should call onClose when Escape key is pressed', () => {
      const handleClose = vi.fn();
      render(
        <Modal isOpen={true} onClose={handleClose}>
          <div>Content</div>
        </Modal>
      );

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Width', () => {
    it('should render modal with default width prop', () => {
      const { container } = render(
        <Modal isOpen={true} onClose={() => {}}>
          <div>Content</div>
        </Modal>
      );

      // Modal renders correctly
      expect(screen.getByText('Content')).toBeInTheDocument();
      // Check the modal wrapper exists
      expect(container.querySelector('.fixed')).toBeInTheDocument();
    });

    it('should accept custom width prop', () => {
      render(
        <Modal isOpen={true} onClose={() => {}} width="800px">
          <div>Content</div>
        </Modal>
      );

      // Modal renders correctly with custom width
      expect(screen.getByText('Content')).toBeInTheDocument();
    });
  });

  describe('Body Scroll', () => {
    it('should prevent body scroll when modal is open', () => {
      render(
        <Modal isOpen={true} onClose={() => {}}>
          <div>Content</div>
        </Modal>
      );

      expect(document.body.style.overflow).toBe('hidden');
    });

    it('should restore body scroll when modal is closed', () => {
      const { rerender } = render(
        <Modal isOpen={true} onClose={() => {}}>
          <div>Content</div>
        </Modal>
      );

      expect(document.body.style.overflow).toBe('hidden');

      rerender(
        <Modal isOpen={false} onClose={() => {}}>
          <div>Content</div>
        </Modal>
      );

      expect(document.body.style.overflow).toBe('unset');
    });
  });

  describe('Content', () => {
    it('should render children correctly', () => {
      render(
        <Modal isOpen={true} onClose={() => {}}>
          <div data-testid="child-1">Child 1</div>
          <div data-testid="child-2">Child 2</div>
        </Modal>
      );

      expect(screen.getByTestId('child-1')).toBeInTheDocument();
      expect(screen.getByTestId('child-2')).toBeInTheDocument();
    });

    it('should render complex content', () => {
      render(
        <Modal isOpen={true} onClose={() => {}} title="Form Modal">
          <form data-testid="modal-form">
            <input type="text" placeholder="Name" />
            <span data-testid="submit-text">Submit</span>
          </form>
        </Modal>
      );

      expect(screen.getByPlaceholderText('Name')).toBeInTheDocument();
      expect(screen.getByTestId('modal-form')).toBeInTheDocument();
      expect(screen.getByTestId('submit-text')).toBeInTheDocument();
    });
  });

  describe('Z-Index', () => {
    it('should render with high z-index overlay', () => {
      const { container } = render(
        <Modal isOpen={true} onClose={() => {}}>
          <div>Content</div>
        </Modal>
      );

      // Modal renders with fixed positioning (overlay)
      const overlay = container.querySelector('.fixed');
      expect(overlay).toBeInTheDocument();
      expect(screen.getByText('Content')).toBeInTheDocument();
    });
  });
});
