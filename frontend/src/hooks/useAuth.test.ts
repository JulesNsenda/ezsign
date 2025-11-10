import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAuth } from './useAuth';

/**
 * Tests for useAuth hook
 */

describe('useAuth', () => {
  it('should throw error when used outside AuthProvider', () => {
    // Mock console.error to suppress error output in tests
    const consoleError = console.error;
    console.error = () => {};

    expect(() => {
      renderHook(() => useAuth());
    }).toThrow('useAuth must be used within an AuthProvider');

    // Restore console.error
    console.error = consoleError;
  });
});
