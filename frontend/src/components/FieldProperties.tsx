import React from 'react';
import type { Field, RadioOption } from '@/types';
import Button from './Button';
import RadioOptionsEditor from './RadioOptionsEditor';

export interface FieldPropertiesProps {
  field: Field | null;
  signers: Array<{ id: string; email: string; name: string }>;
  onUpdate: (updates: Partial<Field>) => void;
  onDelete: () => void;
  onClose: () => void;
}

/**
 * Field properties panel for editing field settings
 */
const FieldProperties: React.FC<FieldPropertiesProps> = ({
  field,
  signers,
  onUpdate,
  onDelete,
  onClose,
}) => {
  if (!field) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-base-300 p-5 min-h-[200px] flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-3 opacity-40">⚙️</div>
          <p className="text-sm text-base-content/60">Select a field</p>
          <p className="text-xs text-base-content/50 mt-1">Click on a field to edit</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-base-300 p-5 h-fit sticky top-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-neutral flex items-center gap-2">
          <span className="text-lg">⚙️</span>
          Properties
        </h3>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-base-200 text-base-content/60 hover:text-base-content transition-all text-xl"
        >
          ×
        </button>
      </div>

      <div className="flex flex-col gap-4">
        {/* Field Type */}
        <div>
          <label className="block text-xs font-semibold text-base-content/70 mb-2 uppercase tracking-wide">
            Field Type
          </label>
          <div className="input-docuseal bg-base-200 text-base-content font-medium capitalize cursor-not-allowed">
            {field.type}
          </div>
        </div>

        {/* Page */}
        <div>
          <label className="block text-xs font-semibold text-base-content/70 mb-2 uppercase tracking-wide">
            Page
          </label>
          <div className="input-docuseal bg-base-200 text-base-content font-medium cursor-not-allowed">
            Page {field.page + 1}
          </div>
        </div>

        {/* Position */}
        <div>
          <label className="block text-xs font-semibold text-base-content/70 mb-2 uppercase tracking-wide">
            Position (X, Y)
          </label>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              value={Math.round(field.x)}
              onChange={(e) => onUpdate({ x: Number(e.target.value) })}
              className="input-docuseal text-sm"
              placeholder="X"
            />
            <input
              type="number"
              value={Math.round(field.y)}
              onChange={(e) => onUpdate({ y: Number(e.target.value) })}
              className="input-docuseal text-sm"
              placeholder="Y"
            />
          </div>
        </div>

        {/* Size */}
        <div>
          <label className="block text-xs font-semibold text-base-content/70 mb-2 uppercase tracking-wide">
            Size (W × H)
          </label>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              value={Math.round(field.width)}
              onChange={(e) => onUpdate({ width: Number(e.target.value) })}
              min={50}
              className="input-docuseal text-sm"
              placeholder="Width"
            />
            <input
              type="number"
              value={Math.round(field.height)}
              onChange={(e) => onUpdate({ height: Number(e.target.value) })}
              min={30}
              className="input-docuseal text-sm"
              placeholder="Height"
            />
          </div>
        </div>

        {/* Required */}
        <div className="pt-2">
          <label className="flex items-center gap-3 cursor-pointer group">
            <div className="relative">
              <input
                type="checkbox"
                checked={field.required}
                onChange={(e) => onUpdate({ required: e.target.checked })}
                className="w-5 h-5 cursor-pointer accent-secondary"
              />
            </div>
            <div>
              <span className="text-sm font-semibold text-neutral group-hover:text-secondary transition-colors">Required field</span>
              <div className="text-xs text-base-content/50">Must be filled by signer</div>
            </div>
          </label>
        </div>

        {/* Radio Field Options */}
        {field.type === 'radio' && (
          <>
            <div className="border-t border-base-300 pt-4">
              <RadioOptionsEditor
                options={(field.properties?.options as RadioOption[]) || [
                  { label: 'Option 1', value: 'option1' },
                  { label: 'Option 2', value: 'option2' },
                ]}
                onChange={(options) =>
                  onUpdate({
                    properties: {
                      ...field.properties,
                      options,
                    },
                  })
                }
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-base-content/70 mb-2 uppercase tracking-wide">
                Layout
              </label>
              <select
                value={(field.properties?.orientation as string) || 'vertical'}
                onChange={(e) =>
                  onUpdate({
                    properties: {
                      ...field.properties,
                      orientation: e.target.value as 'horizontal' | 'vertical',
                    },
                  })
                }
                className="input-docuseal text-sm"
              >
                <option value="vertical">Vertical</option>
                <option value="horizontal">Horizontal</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-base-content/70 mb-2 uppercase tracking-wide">
                Font Size
              </label>
              <input
                type="number"
                value={(field.properties?.fontSize as number) || 12}
                onChange={(e) =>
                  onUpdate({
                    properties: {
                      ...field.properties,
                      fontSize: Number(e.target.value),
                    },
                  })
                }
                min={8}
                max={24}
                className="input-docuseal text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-base-content/70 mb-2 uppercase tracking-wide">
                Option Spacing (px)
              </label>
              <input
                type="number"
                value={(field.properties?.optionSpacing as number) || 20}
                onChange={(e) =>
                  onUpdate({
                    properties: {
                      ...field.properties,
                      optionSpacing: Number(e.target.value),
                    },
                  })
                }
                min={10}
                max={50}
                className="input-docuseal text-sm"
              />
            </div>
          </>
        )}

        {/* Assign to Signer */}
        <div>
          <label className="block text-xs font-semibold text-base-content/70 mb-2 uppercase tracking-wide">
            Assign to Signer
          </label>
          <select
            value={field.signer_email || ''}
            onChange={(e) => {
              const value = e.target.value;
              onUpdate({ signer_email: value === '' ? undefined : value });
            }}
            className="input-docuseal text-sm"
          >
            <option value="">Unassigned</option>
            {signers.map((signer) => (
              <option key={signer.id} value={signer.email}>
                {signer.name} ({signer.email})
              </option>
            ))}
          </select>
          {signers.length === 0 && (
            <p className="text-xs text-amber-600 mt-2">
              Add signers first to assign fields
            </p>
          )}
        </div>

        {/* Delete Button */}
        <div className="mt-2 pt-4 border-t border-base-300">
          <Button variant="danger" onClick={onDelete} style={{ width: '100%' }}>
            Delete Field
          </Button>
        </div>
      </div>
    </div>
  );
};

export default FieldProperties;
