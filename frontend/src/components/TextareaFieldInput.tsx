import React, { useState } from 'react';
import Button from './Button';

interface TextareaFieldInputProps {
  placeholder?: string;
  maxLength?: number;
  rows?: number;
  onSave: (value: string) => void;
  onCancel?: () => void;
}

/**
 * Input component for multi-line text fields during signing
 */
export const TextareaFieldInput: React.FC<TextareaFieldInputProps> = ({
  placeholder = 'Enter your text here...',
  maxLength = 1000,
  rows = 4,
  onSave,
  onCancel,
}) => {
  const [value, setValue] = useState('');

  const handleSave = () => {
    if (!value.trim()) {
      return;
    }
    onSave(value);
  };

  const remainingChars = maxLength - value.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="text-sm text-base-content/60 mb-2">
        Enter your text below:
      </div>

      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, maxLength))}
          placeholder={placeholder}
          rows={rows}
          className={`
            w-full px-4 py-3 border-2 rounded-lg text-base resize-none
            bg-base-100 transition-all duration-200
            focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent
            ${value ? 'border-accent' : 'border-base-300'}
          `}
          autoFocus
        />
        <div
          className={`absolute bottom-2 right-3 text-xs ${
            remainingChars < 50 ? 'text-warning' : 'text-base-content/40'
          } ${remainingChars < 10 ? 'text-error font-semibold' : ''}`}
        >
          {remainingChars} characters remaining
        </div>
      </div>

      {value.trim() && (
        <div className="p-3 bg-accent/10 border border-accent/30 rounded-lg">
          <div className="text-xs text-accent font-semibold mb-1">Preview:</div>
          <div className="text-sm text-base-content whitespace-pre-wrap break-words max-h-24 overflow-y-auto">
            {value}
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
          disabled={!value.trim()}
        >
          Confirm Text
        </Button>
      </div>
    </div>
  );
};

export default TextareaFieldInput;
