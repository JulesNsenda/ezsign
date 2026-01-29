import React, { useState, useEffect } from 'react';
import type { FieldGroup } from '@/types';
import Button from './Button';

export interface GroupEditorProps {
  group: FieldGroup | null;
  onSave: (data: { name: string; description?: string; color?: string }) => void;
  onClose: () => void;
}

const PRESET_COLORS = [
  '#3B82F6', // Blue
  '#10B981', // Green
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#F97316', // Orange
];

/**
 * Modal for creating/editing field groups
 */
const GroupEditor: React.FC<GroupEditorProps> = ({ group, onSave, onClose }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (group) {
      setName(group.name);
      setDescription(group.description || '');
      setColor(group.color);
    } else {
      setName('');
      setDescription('');
      setColor(PRESET_COLORS[0]);
    }
  }, [group]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Group name is required');
      return;
    }

    if (name.length > 100) {
      setError('Group name must be 100 characters or less');
      return;
    }

    onSave({
      name: name.trim(),
      description: description.trim() || undefined,
      color: color || undefined,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-base-200">
          <h3 className="text-lg font-bold text-neutral">
            {group ? 'Edit Group' : 'Create Group'}
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-base-200 text-base-content/60 hover:text-base-content transition-all text-xl"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="bg-error/10 text-error text-sm px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-base-content/70 mb-2 uppercase tracking-wide">
              Name <span className="text-error">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-docuseal w-full"
              placeholder="e.g., Personal Information"
              maxLength={100}
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-base-content/70 mb-2 uppercase tracking-wide">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-docuseal w-full min-h-[80px] resize-none"
              placeholder="Optional description for this group"
              maxLength={500}
            />
          </div>

          {/* Color */}
          <div>
            <label className="block text-xs font-semibold text-base-content/70 mb-2 uppercase tracking-wide">
              Color
            </label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((presetColor) => (
                <button
                  key={presetColor}
                  type="button"
                  onClick={() => setColor(presetColor)}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${
                    color === presetColor
                      ? 'border-base-content scale-110'
                      : 'border-transparent hover:scale-105'
                  }`}
                  style={{ backgroundColor: presetColor }}
                  title={presetColor}
                />
              ))}
              <button
                type="button"
                onClick={() => setColor(null)}
                className={`w-8 h-8 rounded-full border-2 transition-all flex items-center justify-center bg-base-100 ${
                  color === null
                    ? 'border-base-content scale-110'
                    : 'border-base-300 hover:scale-105'
                }`}
                title="No color"
              >
                <span className="text-xs text-base-content/50">×</span>
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              {group ? 'Save Changes' : 'Create Group'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default GroupEditor;
