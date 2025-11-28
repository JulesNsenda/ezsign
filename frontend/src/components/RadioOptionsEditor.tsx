import React from 'react';
import Button from './Button';
import type { RadioOption } from '@/types';

interface RadioOptionsEditorProps {
  options: RadioOption[];
  onChange: (options: RadioOption[]) => void;
  maxOptions?: number;
}

/**
 * Editor component for managing radio button options
 */
export const RadioOptionsEditor: React.FC<RadioOptionsEditorProps> = ({
  options,
  onChange,
  maxOptions = 10,
}) => {
  const addOption = () => {
    if (options.length < maxOptions) {
      onChange([
        ...options,
        { label: `Option ${options.length + 1}`, value: `option${options.length + 1}` },
      ]);
    }
  };

  const removeOption = (index: number) => {
    if (options.length > 2) {
      onChange(options.filter((_, i) => i !== index));
    }
  };

  const updateOption = (index: number, field: 'label' | 'value', value: string) => {
    const updated = [...options];
    const option = updated[index];
    if (option) {
      updated[index] = { ...option, [field]: value };
      onChange(updated);
    }
  };

  const moveOption = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= options.length) return;

    const updated = [...options];
    const item = updated[index];
    if (item) {
      updated.splice(index, 1);
      updated.splice(newIndex, 0, item);
      onChange(updated);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-semibold text-base-content/70 uppercase tracking-wide">
          Options (min 2, max {maxOptions})
        </label>
        <span className="text-xs text-base-content/50">
          {options.length} / {maxOptions}
        </span>
      </div>

      <div className="space-y-2">
        {options.map((option, index) => (
          <div key={index} className="flex items-center gap-2 bg-base-100 border border-base-300 rounded-lg p-2">
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => moveOption(index, 'up')}
                disabled={index === 0}
                className="text-xs text-base-content/40 hover:text-base-content disabled:opacity-30 disabled:cursor-not-allowed"
                title="Move up"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => moveOption(index, 'down')}
                disabled={index === options.length - 1}
                className="text-xs text-base-content/40 hover:text-base-content disabled:opacity-30 disabled:cursor-not-allowed"
                title="Move down"
              >
                ▼
              </button>
            </div>
            <div className="flex-1 grid grid-cols-2 gap-2">
              <input
                type="text"
                value={option.label}
                onChange={(e) => updateOption(index, 'label', e.target.value)}
                placeholder="Label"
                className="input-docuseal text-sm"
              />
              <input
                type="text"
                value={option.value}
                onChange={(e) => updateOption(index, 'value', e.target.value)}
                placeholder="Value"
                className="input-docuseal text-sm"
              />
            </div>
            {options.length > 2 && (
              <button
                type="button"
                onClick={() => removeOption(index)}
                className="w-6 h-6 flex items-center justify-center text-error/70 hover:text-error hover:bg-error/10 rounded transition-colors"
                title="Remove option"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      {options.length < maxOptions && (
        <Button
          variant="ghost"
          size="sm"
          onClick={addOption}
          style={{ width: '100%' }}
        >
          + Add Option
        </Button>
      )}
    </div>
  );
};

export default RadioOptionsEditor;
