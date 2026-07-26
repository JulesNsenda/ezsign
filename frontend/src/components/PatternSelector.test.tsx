import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import PatternSelector from './PatternSelector';
import type { ValidationPatternInfo } from '@/types';

/**
 * PatternSelector had no test file at all before this change. The 400-handling
 * branch in `handleCustomRegexChange` carries real logic worth covering on
 * its own:
 *   - error state set from the server's rejection message
 *   - `onChange` suppressed (never called) for a rejected pattern
 *   - error cleared when the dropdown selection changes
 *   - a stale (superseded) response must not clobber a newer one
 *   - `customRegexDraft` lets typing continue uninterrupted even when the
 *     server ends up rejecting what was typed
 *
 * The hooks module is mocked wholesale (same pattern as
 * `DocumentUpload.test.tsx`), so no QueryClientProvider is needed - none of
 * the mocked hooks touch react-query.
 */

const mockUseValidationPatterns = vi.fn();
const mockUseGroupedPatterns = vi.fn();
const mockUseValidateRegex = vi.fn();

vi.mock('@/hooks/useValidationPatterns', () => ({
  useValidationPatterns: () => mockUseValidationPatterns(),
  useGroupedPatterns: () => mockUseGroupedPatterns(),
  useValidateRegex: () => mockUseValidateRegex(),
}));

const emailPattern: ValidationPatternInfo = {
  id: 'email',
  name: 'Email Address',
  description: 'Standard email address format',
  regex: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
  example: 'user@example.com',
  category: 'contact',
};

const mockPatterns: ValidationPatternInfo[] = [emailPattern];
const mockGrouped = [{ key: 'contact', label: 'Contact', patterns: mockPatterns }];

/** A promise plus its resolve/reject, for controlling async order in tests. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Flush the microtask queue enough times for chained awaits to settle. */
async function flushMicrotasks(times = 3) {
  await act(async () => {
    for (let i = 0; i < times; i++) {
      await Promise.resolve();
    }
  });
}

describe('PatternSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseValidationPatterns.mockReturnValue({ patterns: mockPatterns });
    mockUseGroupedPatterns.mockReturnValue({ grouped: mockGrouped, isLoading: false });
    mockUseValidateRegex.mockReturnValue({ mutateAsync: vi.fn() });
  });

  const getCustomRegexInput = () =>
    screen.getByPlaceholderText('^[A-Za-z]+$') as HTMLInputElement;

  describe('server-rejected (400) custom regex', () => {
    it('sets the error state from the server-provided message', async () => {
      const onChange = vi.fn();
      const mutateAsync = vi.fn().mockRejectedValue({
        response: { status: 400, data: { message: 'Custom pattern rejected: nested quantifiers can cause catastrophic backtracking' } },
      });
      mockUseValidateRegex.mockReturnValue({ mutateAsync });

      render(
        <PatternSelector
          value={{ pattern: 'custom', customRegex: '' }}
          onChange={onChange}
          fieldType="text"
        />
      );

      fireEvent.change(getCustomRegexInput(), { target: { value: '(a+)+$' } });

      await waitFor(() =>
        expect(
          screen.getByText('Custom pattern rejected: nested quantifiers can cause catastrophic backtracking')
        ).toBeInTheDocument()
      );
    });

    it('does not call onChange for a pattern the server rejected', async () => {
      const onChange = vi.fn();
      const mutateAsync = vi.fn().mockRejectedValue({
        response: { status: 400, data: { message: 'Pattern rejected' } },
      });
      mockUseValidateRegex.mockReturnValue({ mutateAsync });

      render(
        <PatternSelector
          value={{ pattern: 'custom', customRegex: '' }}
          onChange={onChange}
          fieldType="text"
        />
      );

      fireEvent.change(getCustomRegexInput(), { target: { value: '(a+)+$' } });

      await waitFor(() => expect(screen.getByText('Pattern rejected')).toBeInTheDocument());

      expect(onChange).not.toHaveBeenCalled();
    });

    it('keeps the typed draft in the input instead of reverting to the last-accepted value', async () => {
      // Fixed `value` prop (not piped back through a stateful wrapper): the
      // draft-resync effect only fires when `value.customRegex` itself
      // changes, so with a fixed prop the only thing that can change what's
      // displayed is `customRegexDraft` - which is exactly what's under test.
      const onChange = vi.fn();
      const mutateAsync = vi.fn().mockRejectedValue({
        response: { status: 400, data: { message: 'Pattern rejected' } },
      });
      mockUseValidateRegex.mockReturnValue({ mutateAsync });

      render(
        <PatternSelector
          value={{ pattern: 'custom', customRegex: 'old-accepted-regex' }}
          onChange={onChange}
          fieldType="text"
        />
      );

      const input = getCustomRegexInput();
      expect(input.value).toBe('old-accepted-regex');

      fireEvent.change(input, { target: { value: 'newly-typed-rejected-regex' } });

      await waitFor(() => expect(screen.getByText('Pattern rejected')).toBeInTheDocument());

      // The input must still show what was typed, not snap back to the
      // last value the parent/server accepted.
      expect(getCustomRegexInput().value).toBe('newly-typed-rejected-regex');
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('error cleared on dropdown change', () => {
    it('clears the custom-regex error when a preset pattern is selected from the dropdown', async () => {
      const onChange = vi.fn();
      const mutateAsync = vi.fn().mockRejectedValue({
        response: { status: 400, data: { message: 'Pattern rejected' } },
      });
      mockUseValidateRegex.mockReturnValue({ mutateAsync });

      render(
        <PatternSelector
          value={{ pattern: 'custom', customRegex: '' }}
          onChange={onChange}
          fieldType="text"
        />
      );

      fireEvent.change(getCustomRegexInput(), { target: { value: '(a+)+$' } });
      await waitFor(() => expect(screen.getByText('Pattern rejected')).toBeInTheDocument());

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'email' } });

      expect(screen.queryByText('Pattern rejected')).not.toBeInTheDocument();
      expect(onChange).toHaveBeenLastCalledWith({ pattern: 'email', mask: undefined });
    });
  });

  describe('stale-response sequencing', () => {
    it('ignores an older response that resolves after a newer one, and does not resurrect its error', async () => {
      const onChange = vi.fn();
      const first = deferred<{ valid: boolean; message?: string }>();
      const second = deferred<{ valid: boolean; message?: string }>();
      const mutateAsync = vi
        .fn()
        .mockImplementationOnce(() => first.promise)
        .mockImplementationOnce(() => second.promise);
      mockUseValidateRegex.mockReturnValue({ mutateAsync });

      render(
        <PatternSelector
          value={{ pattern: 'custom', customRegex: '' }}
          onChange={onChange}
          fieldType="text"
        />
      );

      const input = getCustomRegexInput();
      fireEvent.change(input, { target: { value: 'first-pattern' } });
      fireEvent.change(input, { target: { value: 'second-pattern' } });

      expect(mutateAsync).toHaveBeenCalledTimes(2);

      // Resolve the NEWER request first: it should commit.
      await act(async () => {
        second.resolve({ valid: true, message: 'Valid regex pattern' });
      });
      await waitFor(() =>
        expect(onChange).toHaveBeenCalledWith({
          pattern: 'custom',
          customRegex: 'second-pattern',
        })
      );
      expect(onChange).toHaveBeenCalledTimes(1);

      // Now resolve the OLDER, superseded request - even though it reports
      // a rejection, it must be ignored entirely: no error text, no second
      // onChange call for the stale value.
      await act(async () => {
        first.resolve({ valid: false, message: 'stale-rejection-should-never-appear' });
      });
      await flushMicrotasks();

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(
        screen.queryByText('stale-rejection-should-never-appear')
      ).not.toBeInTheDocument();
    });
  });

  describe('accepted custom regex (happy path baseline)', () => {
    it('commits the pattern via onChange once the server confirms it is valid', async () => {
      const onChange = vi.fn();
      const mutateAsync = vi.fn().mockResolvedValue({ valid: true, message: 'Valid regex pattern' });
      mockUseValidateRegex.mockReturnValue({ mutateAsync });

      render(
        <PatternSelector
          value={{ pattern: 'custom', customRegex: '' }}
          onChange={onChange}
          fieldType="text"
        />
      );

      fireEvent.change(getCustomRegexInput(), { target: { value: '^[A-Z]{3}-\\d{3}$' } });

      await waitFor(() =>
        expect(onChange).toHaveBeenCalledWith({
          pattern: 'custom',
          customRegex: '^[A-Z]{3}-\\d{3}$',
        })
      );
    });
  });
});
