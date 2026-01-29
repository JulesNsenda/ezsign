import { useQuery, useMutation } from '@tanstack/react-query';
import { useState, useCallback, useMemo } from 'react';
import { validationService } from '@/services/validationService';
import type {
  ValidationPatternPreset,
  ValidationPatternInfo,
  ValidationConfig,
} from '@/types';

/**
 * Hook to fetch and manage validation patterns
 */
export function useValidationPatterns() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['validationPatterns'],
    queryFn: () => validationService.getPatterns(),
    staleTime: 1000 * 60 * 60, // 1 hour - patterns rarely change
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
  });

  return {
    patterns: data?.patterns ?? [],
    byCategory: data?.byCategory ?? {},
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook to validate a custom regex pattern
 */
export function useValidateRegex() {
  return useMutation({
    mutationFn: (pattern: string) => validationService.validateRegex(pattern),
  });
}

/**
 * Hook to test a value against a validation pattern (server-side)
 */
export function useTestValidation() {
  return useMutation({
    mutationFn: ({
      value,
      patternId,
      customRegex,
    }: {
      value: string;
      patternId: ValidationPatternPreset;
      customRegex?: string;
    }) => validationService.testValidation(value, patternId, customRegex),
  });
}

/**
 * Hook for real-time field validation
 * Provides local validation state for a field value
 */
export function useFieldValidation(config?: ValidationConfig) {
  const [error, setError] = useState<string | undefined>(undefined);
  const [isValid, setIsValid] = useState(true);

  const validate = useCallback(
    (value: string): { valid: boolean; message?: string } => {
      const result = validationService.validateValueLocally(value, config);
      setIsValid(result.valid);
      setError(result.valid ? undefined : result.message);
      return result;
    },
    [config]
  );

  const clearError = useCallback(() => {
    setError(undefined);
    setIsValid(true);
  }, []);

  const mask = useMemo(() => {
    return config?.mask || validationService.getMask(config?.pattern);
  }, [config]);

  const example = useMemo(() => {
    return validationService.getExample(config?.pattern);
  }, [config?.pattern]);

  return {
    error,
    isValid,
    validate,
    clearError,
    mask,
    example,
  };
}

/**
 * Hook for managing validation config in field properties
 */
export function useValidationConfig(
  initialConfig?: ValidationConfig,
  onChange?: (config: ValidationConfig | undefined) => void
) {
  const [config, setConfig] = useState<ValidationConfig | undefined>(initialConfig);

  const setPattern = useCallback(
    (pattern: ValidationPatternPreset | undefined) => {
      if (!pattern) {
        setConfig(undefined);
        onChange?.(undefined);
        return;
      }

      const newConfig: ValidationConfig = {
        ...config,
        pattern,
        // Clear custom regex if not custom pattern
        customRegex: pattern === 'custom' ? config?.customRegex : undefined,
      };
      setConfig(newConfig);
      onChange?.(newConfig);
    },
    [config, onChange]
  );

  const setCustomRegex = useCallback(
    (customRegex: string) => {
      const newConfig: ValidationConfig = {
        ...config,
        pattern: 'custom',
        customRegex,
      };
      setConfig(newConfig);
      onChange?.(newConfig);
    },
    [config, onChange]
  );

  const setMessage = useCallback(
    (message: string | undefined) => {
      if (!config?.pattern) return;

      const newConfig: ValidationConfig = {
        ...config,
        message: message || undefined,
      };
      setConfig(newConfig);
      onChange?.(newConfig);
    },
    [config, onChange]
  );

  const setMask = useCallback(
    (mask: string | undefined) => {
      if (!config?.pattern) return;

      const newConfig: ValidationConfig = {
        ...config,
        mask: mask || undefined,
      };
      setConfig(newConfig);
      onChange?.(newConfig);
    },
    [config, onChange]
  );

  const reset = useCallback(() => {
    setConfig(initialConfig);
    onChange?.(initialConfig);
  }, [initialConfig, onChange]);

  const clear = useCallback(() => {
    setConfig(undefined);
    onChange?.(undefined);
  }, [onChange]);

  return {
    config,
    setPattern,
    setCustomRegex,
    setMessage,
    setMask,
    reset,
    clear,
    hasValidation: !!config?.pattern,
  };
}

/**
 * Get grouped patterns for display in a selector
 */
export function useGroupedPatterns() {
  const { patterns, isLoading } = useValidationPatterns();

  const grouped = useMemo(() => {
    const categories: {
      label: string;
      key: string;
      patterns: ValidationPatternInfo[];
    }[] = [
      { label: 'Contact', key: 'contact', patterns: [] },
      { label: 'Identity', key: 'identity', patterns: [] },
      { label: 'Location', key: 'location', patterns: [] },
      { label: 'Format', key: 'format', patterns: [] },
      { label: 'General', key: 'general', patterns: [] },
    ];

    for (const pattern of patterns) {
      const category = categories.find((c) => c.key === pattern.category);
      if (category && pattern.id !== 'custom') {
        category.patterns.push(pattern);
      }
    }

    // Filter out empty categories
    return categories.filter((c) => c.patterns.length > 0);
  }, [patterns]);

  return { grouped, isLoading };
}
