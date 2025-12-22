import React, { useState } from 'react';
import Button from './Button';

interface CheckboxFieldInputProps {
  onSave: (checked: boolean) => void;
  onCancel?: () => void;
  label?: string;
  initialValue?: boolean;
}

/**
 * Input component for checkbox fields during signing
 */
export const CheckboxFieldInput: React.FC<CheckboxFieldInputProps> = ({
  onSave,
  onCancel,
  label = 'I confirm this selection',
  initialValue = false,
}) => {
  const [checked, setChecked] = useState(initialValue);

  const handleSave = () => {
    onSave(checked);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="text-sm text-base-content/60 mb-2">
        Check the box below to confirm:
      </div>

      <label
        className={`
          flex items-center gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all duration-200
          ${checked
            ? 'border-accent bg-accent/10'
            : 'border-base-300 bg-base-100 hover:border-base-content/30 hover:bg-base-200'
          }
        `}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="checkbox checkbox-accent checkbox-lg"
        />
        <span className="text-base font-medium text-base-content">
          {label}
        </span>
      </label>

      <div className="flex items-center gap-2 text-sm">
        <span className={`font-medium ${checked ? 'text-success' : 'text-base-content/50'}`}>
          {checked ? 'Checked' : 'Unchecked'}
        </span>
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
        >
          Confirm
        </Button>
      </div>
    </div>
  );
};

export default CheckboxFieldInput;
