import React, { useState, useCallback, useEffect } from 'react';
import Button from './Button';
import { useFieldValidation } from '@/hooks/useValidationPatterns';
import type { ValidationConfig } from '@/types';

interface TextFieldInputProps {
  onSave: (value: string) => void;
  onCancel?: () => void;
  placeholder?: string;
  maxLength?: number;
  initialValue?: string;
  validation?: ValidationConfig;
}

/**
 * Input component for text fields during signing
 * Supports validation patterns with real-time feedback
 */
export const TextFieldInput: React.FC<TextFieldInputProps> = ({
  onSave,
  onCancel,
  placeholder = 'Enter text...',
  maxLength = 255,
  initialValue = '',
  validation,
}) => {
  const [value, setValue] = useState(initialValue);
  const [touched, setTouched] = useState(false);

  const { error, isValid, validate, clearError, mask, example } = useFieldValidation(validation);

  // Validate on value change after first interaction
  useEffect(() => {
    if (touched && value) {
      validate(value);
    } else if (!value) {
      clearError();
    }
  }, [value, touched, validate, clearError]);

  const handleBlur = useCallback(() => {
    setTouched(true);
    if (value) {
      validate(value);
    }
  }, [value, validate]);

  const handleSave = () => {
    // Validate before saving
    if (!value.trim()) {
      return;
    }

    const result = validate(value.trim());
    if (!result.valid) {
      setTouched(true);
      return;
    }

    onSave(value.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && value.trim()) {
      handleSave();
    }
  };

  const canSave = value.trim() && isValid;

  const inputId = 'text-field-input';
  const errorId = 'text-field-error';
  const descriptionId = 'text-field-description';

  return (
    <div className="flex flex-col gap-4" role="group" aria-labelledby={descriptionId}>
      <label id={descriptionId} htmlFor={inputId} className="text-sm text-base-content/60 mb-2">
        Enter your text below:
        {validation?.pattern && example && (
          <span className="block text-xs text-base-content/40 mt-1">
            Example: {example}
          </span>
        )}
      </label>

      <div className="relative">
        <input
          id={inputId}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder={mask || placeholder}
          maxLength={maxLength}
          className={`input input-bordered w-full text-lg ${
            touched && error ? 'border-error focus:border-error' : ''
          }`}
          autoFocus
          aria-invalid={touched && !!error}
          aria-describedby={touched && error ? errorId : undefined}
          aria-required="true"
        />

        {/* Validation error - announced by screen readers */}
        {touched && error && (
          <div
            id={errorId}
            className="absolute -bottom-5 left-0 text-xs text-error"
            role="alert"
            aria-live="polite"
          >
            {error}
          </div>
        )}
      </div>

      {/* Character counter */}
      <div className="flex justify-between items-center">
        {validation?.pattern && !error && value && (
          <span className="text-xs text-success flex items-center gap-1">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            Valid format
          </span>
        )}
        {!validation?.pattern && <span />}
        {maxLength && (
          <span className="text-xs text-base-content/50">
            {value.length} / {maxLength}
          </span>
        )}
      </div>

      <div className="flex gap-2 justify-end pt-4 border-t border-base-300">
        {onCancel && (
          <Button variant="outline" size="md" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          variant="primary"
          size="md"
          onClick={handleSave}
          disabled={!canSave}
        >
          Confirm
        </Button>
      </div>
    </div>
  );
};

export default TextFieldInput;
