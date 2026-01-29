import React, { useState, useCallback } from 'react';
import {
  useValidationPatterns,
  useGroupedPatterns,
  useValidateRegex,
} from '@/hooks/useValidationPatterns';
import type { ValidationConfig, ValidationPatternPreset } from '@/types';

export interface PatternSelectorProps {
  value?: ValidationConfig;
  onChange: (config: ValidationConfig | undefined) => void;
  fieldType: 'text' | 'textarea';
}

/**
 * Pattern selector for configuring field validation
 */
const PatternSelector: React.FC<PatternSelectorProps> = ({
  value,
  onChange,
  fieldType,
}) => {
  const { grouped, isLoading } = useGroupedPatterns();
  const { patterns } = useValidationPatterns();
  const validateRegex = useValidateRegex();

  const [showCustom, setShowCustom] = useState(value?.pattern === 'custom');
  const [customRegexError, setCustomRegexError] = useState<string | null>(null);

  const handlePatternChange = useCallback(
    (patternId: string) => {
      if (!patternId) {
        onChange(undefined);
        setShowCustom(false);
        return;
      }

      if (patternId === 'custom') {
        setShowCustom(true);
        onChange({
          pattern: 'custom',
          customRegex: value?.customRegex || '',
        });
        return;
      }

      setShowCustom(false);
      const pattern = patterns.find((p) => p.id === patternId);
      onChange({
        pattern: patternId as ValidationPatternPreset,
        mask: pattern?.mask,
      });
    },
    [onChange, patterns, value?.customRegex]
  );

  const handleCustomRegexChange = useCallback(
    async (regex: string) => {
      setCustomRegexError(null);

      if (!regex) {
        onChange({
          ...value,
          pattern: 'custom',
          customRegex: '',
        });
        return;
      }

      // Validate regex
      try {
        const result = await validateRegex.mutateAsync(regex);
        if (!result.valid) {
          setCustomRegexError(result.message);
        }
      } catch {
        // Try local validation
        try {
          new RegExp(regex);
        } catch {
          setCustomRegexError('Invalid regex pattern');
        }
      }

      onChange({
        ...value,
        pattern: 'custom',
        customRegex: regex,
      });
    },
    [onChange, validateRegex, value]
  );

  const handleMessageChange = useCallback(
    (message: string) => {
      if (!value?.pattern) return;

      onChange({
        ...value,
        message: message || undefined,
      });
    },
    [onChange, value]
  );

  const selectedPattern = patterns.find((p) => p.id === value?.pattern);

  if (isLoading) {
    return (
      <div className="animate-pulse bg-base-200 h-10 rounded-lg" />
    );
  }

  return (
    <div className="space-y-3">
      {/* Pattern Dropdown */}
      <div>
        <label className="block text-xs font-semibold text-base-content/70 mb-2 uppercase tracking-wide">
          Validation Pattern
        </label>
        <select
          value={value?.pattern || ''}
          onChange={(e) => handlePatternChange(e.target.value)}
          className="input-docuseal text-sm w-full"
        >
          <option value="">No validation</option>

          {grouped.map((category) => (
            <optgroup key={category.key} label={category.label}>
              {category.patterns.map((pattern) => (
                <option key={pattern.id} value={pattern.id}>
                  {pattern.name}
                </option>
              ))}
            </optgroup>
          ))}

          <optgroup label="Advanced">
            <option value="custom">Custom Pattern...</option>
          </optgroup>
        </select>
      </div>

      {/* Pattern Info */}
      {selectedPattern && selectedPattern.id !== 'custom' && (
        <div className="bg-base-100 border border-base-300 rounded-lg p-3 text-xs">
          <div className="text-base-content/70 mb-1">{selectedPattern.description}</div>
          <div className="flex items-center gap-2">
            <span className="text-base-content/50">Example:</span>
            <code className="bg-base-200 px-1.5 py-0.5 rounded font-mono">
              {selectedPattern.example}
            </code>
          </div>
          {selectedPattern.mask && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-base-content/50">Format:</span>
              <code className="bg-base-200 px-1.5 py-0.5 rounded font-mono">
                {selectedPattern.mask}
              </code>
            </div>
          )}
        </div>
      )}

      {/* Custom Regex Input */}
      {showCustom && (
        <div>
          <label className="block text-xs font-semibold text-base-content/70 mb-2 uppercase tracking-wide">
            Custom Regex Pattern
          </label>
          <input
            type="text"
            value={value?.customRegex || ''}
            onChange={(e) => handleCustomRegexChange(e.target.value)}
            placeholder="^[A-Za-z]+$"
            className={`input-docuseal text-sm font-mono w-full ${
              customRegexError ? 'border-error' : ''
            }`}
          />
          {customRegexError && (
            <p className="text-xs text-error mt-1">{customRegexError}</p>
          )}
          <p className="text-xs text-base-content/50 mt-1">
            Enter a JavaScript-compatible regular expression
          </p>
        </div>
      )}

      {/* Custom Error Message */}
      {value?.pattern && (
        <div>
          <label className="block text-xs font-semibold text-base-content/70 mb-2 uppercase tracking-wide">
            Custom Error Message
            <span className="font-normal text-base-content/50 ml-1">(optional)</span>
          </label>
          <input
            type="text"
            value={value?.message || ''}
            onChange={(e) => handleMessageChange(e.target.value)}
            placeholder={selectedPattern ? `Please enter a valid ${selectedPattern.name.toLowerCase()}` : 'Invalid format'}
            className="input-docuseal text-sm w-full"
          />
          <p className="text-xs text-base-content/50 mt-1">
            Shown when validation fails
          </p>
        </div>
      )}

      {/* Input Mask Info */}
      {fieldType === 'text' && value?.pattern && value.pattern !== 'custom' && selectedPattern?.mask && (
        <div className="bg-info/10 border border-info/30 rounded-lg p-3 text-xs">
          <div className="flex items-center gap-2 text-info">
            <span>ℹ️</span>
            <span className="font-medium">Input hint shown to user:</span>
          </div>
          <code className="text-info/80 font-mono block mt-1">
            {selectedPattern.mask}
          </code>
        </div>
      )}
    </div>
  );
};

export default PatternSelector;
