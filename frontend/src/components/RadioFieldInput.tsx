import React, { useState } from 'react';
import Button from './Button';
import type { RadioOption } from '@/types';

interface RadioFieldInputProps {
  options: RadioOption[];
  orientation?: 'horizontal' | 'vertical';
  onSave: (selectedValue: string) => void;
  onCancel?: () => void;
  fieldName?: string;
}

/**
 * Input component for radio button fields during signing
 */
export const RadioFieldInput: React.FC<RadioFieldInputProps> = ({
  options,
  orientation = 'vertical',
  onSave,
  onCancel,
  fieldName = 'radio-field',
}) => {
  const [selectedValue, setSelectedValue] = useState<string>('');

  const handleSave = () => {
    if (!selectedValue) {
      return;
    }
    onSave(selectedValue);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="text-sm text-base-content/60 mb-2">
        Select one option:
      </div>

      <div
        className={`flex ${orientation === 'vertical' ? 'flex-col space-y-3' : 'flex-row flex-wrap gap-4'}`}
        role="radiogroup"
        aria-label={fieldName}
      >
        {options.map((option) => (
          <label
            key={option.value}
            className={`
              flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all duration-200
              ${selectedValue === option.value
                ? 'border-accent bg-accent/10'
                : 'border-base-300 bg-base-100 hover:border-base-content/30 hover:bg-base-200'
              }
            `}
          >
            <input
              type="radio"
              name={fieldName}
              value={option.value}
              checked={selectedValue === option.value}
              onChange={(e) => setSelectedValue(e.target.value)}
              className="radio radio-accent"
            />
            <span className="text-sm font-medium text-base-content">
              {option.label}
            </span>
          </label>
        ))}
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
          disabled={!selectedValue}
        >
          Confirm Selection
        </Button>
      </div>
    </div>
  );
};

export default RadioFieldInput;
