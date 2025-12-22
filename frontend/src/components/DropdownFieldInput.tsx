import React, { useState } from 'react';
import Button from './Button';
import type { RadioOption } from '@/types';

interface DropdownFieldInputProps {
  options: RadioOption[];
  placeholder?: string;
  onSave: (selectedValue: string) => void;
  onCancel?: () => void;
  fieldName?: string;
}

/**
 * Input component for dropdown/select fields during signing
 */
export const DropdownFieldInput: React.FC<DropdownFieldInputProps> = ({
  options,
  placeholder = 'Select an option',
  onSave,
  onCancel,
  fieldName = 'dropdown-field',
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
        Select an option from the list:
      </div>

      <select
        id={fieldName}
        value={selectedValue}
        onChange={(e) => setSelectedValue(e.target.value)}
        className={`
          w-full px-4 py-3 border-2 rounded-lg text-base
          bg-base-100 transition-all duration-200
          focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent
          ${!selectedValue ? 'text-base-content/50 border-base-300' : 'text-base-content border-accent'}
        `}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {selectedValue && (
        <div className="p-3 bg-accent/10 border border-accent/30 rounded-lg">
          <div className="flex items-center gap-2">
            <span className="text-accent font-bold">Selected:</span>
            <span className="text-base-content font-medium">
              {options.find((o) => o.value === selectedValue)?.label}
            </span>
          </div>
        </div>
      )}

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

export default DropdownFieldInput;
