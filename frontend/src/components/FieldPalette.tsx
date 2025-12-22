import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { FieldType } from '@/types';

/**
 * Field palette component for dragging new fields onto PDF
 */

interface FieldPaletteItemProps {
  type: FieldType;
  label: string;
  color: string;
  icon: string;
}

const FieldPaletteItem: React.FC<FieldPaletteItemProps> = ({
  type,
  label,
  color,
  icon,
}) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${type}`,
    data: { type, isNew: true },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="group"
      style={{
        padding: '1rem',
        backgroundColor: 'white',
        border: `2px solid ${color}30`,
        borderRadius: '12px',
        cursor: isDragging ? 'grabbing' : 'grab',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        fontSize: '0.875rem',
        fontWeight: '600',
        color: color,
        opacity: isDragging ? 0.5 : 1,
        transition: 'all 0.2s ease',
        userSelect: 'none',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
        e.currentTarget.style.borderColor = color;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
        e.currentTarget.style.borderColor = `${color}30`;
      }}
    >
      <div
        style={{
          width: '40px',
          height: '40px',
          backgroundColor: `${color}15`,
          borderRadius: '10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.5rem',
        }}
      >
        {icon}
      </div>
      <div className="flex-1">
        <div className="font-semibold">{label}</div>
        <div className="text-xs text-base-content/50 mt-0.5">Drag to place</div>
      </div>
    </div>
  );
};

export interface FieldPaletteProps {
  onFieldTypeSelect?: (type: FieldType) => void;
}

export const FieldPalette: React.FC<FieldPaletteProps> = () => {
  const fields: Array<{ type: FieldType; label: string; color: string; icon: string }> = [
    { type: 'signature', label: 'Signature', color: '#007bff', icon: '✍️' },
    { type: 'initials', label: 'Initials', color: '#28a745', icon: '✓' },
    { type: 'date', label: 'Date', color: '#ffc107', icon: '📅' },
    { type: 'text', label: 'Text', color: '#17a2b8', icon: '📝' },
    { type: 'checkbox', label: 'Checkbox', color: '#6c757d', icon: '☑' },
    { type: 'radio', label: 'Radio', color: '#9333ea', icon: '⊙' },
    { type: 'dropdown', label: 'Dropdown', color: '#0891b2', icon: '▼' },
  ];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-base-300 p-5 h-fit sticky top-6">
      <h3 className="text-base font-bold text-neutral mb-4 flex items-center gap-2">
        <span className="text-lg">🎨</span>
        Field Types
      </h3>
      <div className="flex flex-col gap-3">
        {fields.map((field) => (
          <FieldPaletteItem key={field.type} {...field} />
        ))}
      </div>
      <div className="mt-5 p-3 bg-blue-50 border border-blue-100 rounded-lg">
        <div className="flex items-start gap-2">
          <span className="text-lg">💡</span>
          <p className="text-xs text-blue-900 leading-relaxed">
            Drag and drop fields onto the PDF to add them
          </p>
        </div>
      </div>
    </div>
  );
};

export default FieldPalette;
