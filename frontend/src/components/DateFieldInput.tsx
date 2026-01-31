import React, { useState } from 'react';
import Button from './Button';

interface DateFieldInputProps {
  onSave: (value: string, formattedValue: string) => void;
  onCancel?: () => void;
  dateFormat?: string;
  initialValue?: string;
}

/**
 * Input component for date fields during signing
 */
export const DateFieldInput: React.FC<DateFieldInputProps> = ({
  onSave,
  onCancel,
  dateFormat = 'MM/DD/YYYY',
  initialValue = '',
}) => {
  // Default to today's date if no initial value
  const today = new Date().toISOString().split('T')[0];
  const [value, setValue] = useState(initialValue || today);

  const formatDate = (dateStr: string, format: string): string => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = String(date.getFullYear());

    switch (format) {
      case 'MM/DD/YYYY':
        return `${month}/${day}/${year}`;
      case 'DD/MM/YYYY':
        return `${day}/${month}/${year}`;
      case 'YYYY-MM-DD':
        return `${year}-${month}-${day}`;
      case 'MM-DD-YYYY':
        return `${month}-${day}-${year}`;
      case 'DD-MM-YYYY':
        return `${day}-${month}-${year}`;
      default:
        return `${month}/${day}/${year}`;
    }
  };

  const handleSave = () => {
    if (!value) {
      return;
    }
    const formatted = formatDate(value, dateFormat);
    onSave(value, formatted);
  };

  return (
    <div className="flex flex-col gap-4">
      <label htmlFor="date-input" className="text-sm text-base-content/60 mb-2">
        Select a date:
      </label>

      <input
        id="date-input"
        type="date"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="input input-bordered w-full text-lg"
        autoFocus
        aria-describedby={value ? 'date-preview' : undefined}
      />

      {value && (
        <div
          id="date-preview"
          className="text-sm text-base-content/70 bg-base-200 p-3 rounded-lg"
          aria-live="polite"
          aria-atomic="true"
        >
          <span className="font-medium">Preview:</span>{' '}
          <span className="text-primary font-semibold">
            {formatDate(value, dateFormat)}
          </span>
          <span className="text-xs text-base-content/50 ml-2">
            (Format: {dateFormat})
          </span>
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
          disabled={!value}
        >
          Confirm Date
        </Button>
      </div>
    </div>
  );
};

export default DateFieldInput;
