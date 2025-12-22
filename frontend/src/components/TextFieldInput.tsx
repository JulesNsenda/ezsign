import React, { useState } from 'react';
import Button from './Button';

interface TextFieldInputProps {
  onSave: (value: string) => void;
  onCancel?: () => void;
  placeholder?: string;
  maxLength?: number;
  initialValue?: string;
}

/**
 * Input component for text fields during signing
 */
export const TextFieldInput: React.FC<TextFieldInputProps> = ({
  onSave,
  onCancel,
  placeholder = 'Enter text...',
  maxLength = 255,
  initialValue = '',
}) => {
  const [value, setValue] = useState(initialValue);

  const handleSave = () => {
    if (!value.trim()) {
      return;
    }
    onSave(value.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && value.trim()) {
      handleSave();
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="text-sm text-base-content/60 mb-2">
        Enter your text below:
      </div>

      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        maxLength={maxLength}
        className="input input-bordered w-full text-lg"
        autoFocus
      />

      {maxLength && (
        <div className="text-xs text-base-content/50 text-right">
          {value.length} / {maxLength}
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
          disabled={!value.trim()}
        >
          Confirm
        </Button>
      </div>
    </div>
  );
};

export default TextFieldInput;
