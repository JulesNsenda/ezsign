import React, { memo, useCallback } from 'react';
import PositionableField from './PositionableField';
import type { Field } from '@/types';

interface FieldsLayerProps {
  fields: Field[];
  selectedFieldId: string | null;
  scale: number;
  onSelectField: (fieldId: string) => void;
  onClearSelection: () => void;
  onDeleteField: (fieldId: string) => void;
  onPositionChange: (fieldId: string, x: number, y: number) => void;
  onSizeChange: (fieldId: string, width: number, height: number) => void;
  getFieldColor: (field: Field) => string;
}

/**
 * Isolated fields layer component - renders fields on top of PDF
 * Memoized to prevent re-renders when parent state changes
 */
const FieldsLayerComponent: React.FC<FieldsLayerProps> = ({
  fields,
  selectedFieldId,
  scale,
  onSelectField,
  onClearSelection,
  onDeleteField,
  onPositionChange,
  onSizeChange,
  getFieldColor,
}) => {
  const handleBackgroundClick = useCallback((e: React.MouseEvent) => {
    // Only clear selection if clicking directly on the background, not on a field
    if (e.target === e.currentTarget) {
      onClearSelection();
    }
  }, [onClearSelection]);

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'auto',
      }}
      onClick={handleBackgroundClick}
    >
      {fields.map((field) => (
        <PositionableField
          key={field.id}
          field={field}
          scale={scale}
          isSelected={selectedFieldId === field.id}
          borderColor={getFieldColor(field)}
          onClick={() => onSelectField(field.id)}
          onDelete={() => onDeleteField(field.id)}
          onPositionChange={(x, y) => onPositionChange(field.id, x, y)}
          onSizeChange={(width, height) => onSizeChange(field.id, width, height)}
          gridSnap={5}
        />
      ))}
    </div>
  );
};

// Custom comparison to prevent unnecessary re-renders
export const FieldsLayer = memo(FieldsLayerComponent, (prevProps, nextProps) => {
  // Only re-render if these specific props change
  if (prevProps.selectedFieldId !== nextProps.selectedFieldId) return false;
  if (prevProps.scale !== nextProps.scale) return false;
  if (prevProps.fields.length !== nextProps.fields.length) return false;

  // Deep compare fields
  for (let i = 0; i < prevProps.fields.length; i++) {
    const prev = prevProps.fields[i];
    const next = nextProps.fields[i];
    if (
      prev.id !== next.id ||
      prev.x !== next.x ||
      prev.y !== next.y ||
      prev.width !== next.width ||
      prev.height !== next.height ||
      prev.type !== next.type ||
      prev.required !== next.required ||
      prev.signer_email !== next.signer_email
    ) {
      return false;
    }
  }

  return true;
});

export default FieldsLayer;
