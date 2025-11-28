import React, { useCallback, memo } from 'react';
import { Rnd } from 'react-rnd';
import type { Field, FieldType } from '@/types';

/**
 * Positionable field component using react-rnd for smooth drag and resize
 */

export interface PositionableFieldProps {
  field: Field;
  /** Scale factor to convert PDF points to screen pixels */
  scale: number;
  /** Whether this field is currently selected */
  isSelected?: boolean;
  /** Custom border color (defaults to field type color) */
  borderColor?: string;
  /** Callback when field is clicked */
  onClick?: () => void;
  /** Callback when field is deleted */
  onDelete?: () => void;
  /** Callback when field position changes (x, y in PDF points) */
  onPositionChange?: (x: number, y: number) => void;
  /** Callback when field size changes (width, height in PDF points) */
  onSizeChange?: (width: number, height: number) => void;
  /** Grid snap size in pixels (0 = no snap) */
  gridSnap?: number;
  /** Bounds constraint (parent element selector or 'parent') */
  bounds?: string;
}

const FIELD_COLORS: Record<FieldType, string> = {
  signature: '#007bff',
  initials: '#28a745',
  date: '#ffc107',
  text: '#17a2b8',
  checkbox: '#6c757d',
  radio: '#9333ea',
};

const FIELD_LABELS: Record<FieldType, string> = {
  signature: 'Signature',
  initials: 'Initials',
  date: 'Date',
  text: 'Text',
  checkbox: 'Checkbox',
  radio: 'Radio',
};

// Minimum field sizes in pixels
const MIN_WIDTH = 50;
const MIN_HEIGHT = 25;

const PositionableFieldComponent: React.FC<PositionableFieldProps> = ({
  field,
  scale,
  isSelected = false,
  borderColor,
  onClick,
  onDelete,
  onPositionChange,
  onSizeChange,
  gridSnap = 5,
  bounds = 'parent',
}) => {
  const fieldColor = borderColor || FIELD_COLORS[field.type];

  // Convert PDF points to screen pixels
  const screenX = field.x * scale;
  const screenY = field.y * scale;
  const screenWidth = field.width * scale;
  const screenHeight = field.height * scale;

  const handleDragStop = useCallback(
    (_e: any, data: { x: number; y: number }) => {
      const pdfX = data.x / scale;
      const pdfY = data.y / scale;
      onPositionChange?.(pdfX, pdfY);
    },
    [scale, onPositionChange]
  );

  const handleResizeStop = useCallback(
    (
      _e: any,
      _direction: any,
      ref: HTMLElement,
      _delta: any,
      position: { x: number; y: number }
    ) => {
      const pdfWidth = ref.offsetWidth / scale;
      const pdfHeight = ref.offsetHeight / scale;
      const pdfX = position.x / scale;
      const pdfY = position.y / scale;

      onPositionChange?.(pdfX, pdfY);
      onSizeChange?.(pdfWidth, pdfHeight);
    },
    [scale, onPositionChange, onSizeChange]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onClick?.();
    },
    [onClick]
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onDelete?.();
    },
    [onDelete]
  );

  return (
    <Rnd
      position={{ x: screenX, y: screenY }}
      size={{ width: screenWidth, height: screenHeight }}
      onDragStop={handleDragStop}
      onResizeStop={handleResizeStop}
      bounds={bounds}
      dragGrid={gridSnap > 0 ? [gridSnap, gridSnap] : undefined}
      resizeGrid={gridSnap > 0 ? [gridSnap, gridSnap] : undefined}
      minWidth={MIN_WIDTH}
      minHeight={MIN_HEIGHT}
      enableResizing={isSelected ? {
        top: false,
        right: true,
        bottom: true,
        left: false,
        topRight: false,
        bottomRight: true,
        bottomLeft: false,
        topLeft: false,
      } : false}
      resizeHandleStyles={{
        right: {
          width: '8px',
          height: '24px',
          right: '-4px',
          top: '50%',
          transform: 'translateY(-50%)',
          background: fieldColor,
          borderRadius: '4px',
          border: '2px solid white',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          cursor: 'e-resize',
        },
        bottom: {
          width: '24px',
          height: '8px',
          bottom: '-4px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: fieldColor,
          borderRadius: '4px',
          border: '2px solid white',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          cursor: 's-resize',
        },
        bottomRight: {
          width: '12px',
          height: '12px',
          right: '-4px',
          bottom: '-4px',
          background: fieldColor,
          borderRadius: '50%',
          border: '2px solid white',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          cursor: 'se-resize',
        },
      }}
      style={{
        zIndex: isSelected ? 1000 : 100,
      }}
    >
      <div
        onClick={handleClick}
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: isSelected ? `${fieldColor}25` : `${fieldColor}15`,
          border: `2px ${isSelected ? 'solid' : 'dashed'} ${fieldColor}`,
          borderRadius: '8px',
          cursor: 'move',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          userSelect: 'none',
          boxShadow: isSelected ? `0 4px 12px ${fieldColor}40` : '0 2px 4px rgba(0,0,0,0.08)',
          transition: 'box-shadow 0.2s ease, background-color 0.2s ease',
          position: 'relative',
        }}
      >
        {/* Field Label */}
        <div style={{ pointerEvents: 'none', textAlign: 'center', padding: '4px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            fontSize: `${Math.max(10, 11 * scale)}px`,
            fontWeight: 600,
            color: fieldColor,
          }}>
            <span>{FIELD_LABELS[field.type]}</span>
            {field.required && <span style={{ color: '#dc3545', fontSize: '1.2em' }}>*</span>}
          </div>
          {field.signer_email && (
            <div style={{
              fontSize: `${Math.max(9, 10 * scale)}px`,
              marginTop: '2px',
              opacity: 0.8,
              fontWeight: 500,
              color: fieldColor,
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {field.signer_email.split('@')[0]}
            </div>
          )}
        </div>

        {/* Delete Button */}
        {isSelected && onDelete && (
          <button
            type="button"
            onClick={handleDelete}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              top: '-12px',
              right: '-12px',
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              backgroundColor: '#ef4444',
              color: 'white',
              border: '3px solid white',
              cursor: 'pointer',
              fontSize: '18px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              zIndex: 10000,
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            }}
            title="Delete field"
          >
            ×
          </button>
        )}
      </div>
    </Rnd>
  );
};

// Memoize to prevent unnecessary re-renders when parent re-renders
export const PositionableField = memo(PositionableFieldComponent, (prevProps, nextProps) => {
  return (
    prevProps.field.id === nextProps.field.id &&
    prevProps.field.x === nextProps.field.x &&
    prevProps.field.y === nextProps.field.y &&
    prevProps.field.width === nextProps.field.width &&
    prevProps.field.height === nextProps.field.height &&
    prevProps.field.type === nextProps.field.type &&
    prevProps.field.required === nextProps.field.required &&
    prevProps.field.signer_email === nextProps.field.signer_email &&
    prevProps.scale === nextProps.scale &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.borderColor === nextProps.borderColor &&
    prevProps.gridSnap === nextProps.gridSnap &&
    prevProps.bounds === nextProps.bounds
  );
});

export default PositionableField;
