import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { Field, FieldType } from '@/types';

/**
 * Draggable field component for placing fields on PDF
 */

export interface DraggableFieldProps {
  field: Field;
  scale?: number;
  isSelected?: boolean;
  onClick?: () => void;
  onDelete?: () => void;
  onResize?: (width: number, height: number) => void;
  /** Keyboard movement handler - called with delta x, y values */
  onMove?: (deltaX: number, deltaY: number) => void;
  borderColor?: string;
}

const FIELD_COLORS: Record<FieldType, string> = {
  signature: '#007bff',
  initials: '#28a745',
  date: '#ffc107',
  text: '#17a2b8',
  textarea: '#8b5cf6',
  checkbox: '#6c757d',
  radio: '#9333ea',
  dropdown: '#0891b2',
};

const FIELD_LABELS: Record<FieldType, string> = {
  signature: 'Signature',
  initials: 'Initials',
  date: 'Date',
  text: 'Text',
  textarea: 'Textarea',
  checkbox: 'Checkbox',
  radio: 'Radio',
  dropdown: 'Dropdown',
};

// Movement step size in pixels (before scaling)
const MOVE_STEP = 5;
const MOVE_STEP_LARGE = 20;
const RESIZE_STEP = 5;

export const DraggableField: React.FC<DraggableFieldProps> = ({
  field,
  scale = 1,
  isSelected = false,
  onClick,
  onDelete,
  onResize,
  onMove,
  borderColor,
}) => {
  // Use custom border color if provided, otherwise use field type color
  const fieldColor = borderColor || FIELD_COLORS[field.type];

  // Handle keyboard navigation for moving and resizing
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isSelected) return;

    const step = e.shiftKey ? MOVE_STEP_LARGE : MOVE_STEP;

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        onMove?.(0, -step);
        break;
      case 'ArrowDown':
        e.preventDefault();
        onMove?.(0, step);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        onMove?.(-step, 0);
        break;
      case 'ArrowRight':
        e.preventDefault();
        onMove?.(step, 0);
        break;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        onDelete?.();
        break;
    }
  };

  // Handle keyboard resize
  const handleResizeKeyDown = (e: React.KeyboardEvent, direction: string) => {
    if (!onResize) return;

    const step = e.shiftKey ? RESIZE_STEP * 4 : RESIZE_STEP;
    let newWidth = field.width;
    let newHeight = field.height;

    switch (e.key) {
      case 'ArrowRight':
        if (direction.includes('e') || direction === 'se') {
          e.preventDefault();
          newWidth = Math.max(50, field.width + step);
        }
        break;
      case 'ArrowLeft':
        if (direction.includes('e') || direction === 'se') {
          e.preventDefault();
          newWidth = Math.max(50, field.width - step);
        }
        break;
      case 'ArrowDown':
        if (direction.includes('s') || direction === 'se') {
          e.preventDefault();
          newHeight = Math.max(30, field.height + step);
        }
        break;
      case 'ArrowUp':
        if (direction.includes('s') || direction === 'se') {
          e.preventDefault();
          newHeight = Math.max(30, field.height - step);
        }
        break;
    }

    if (newWidth !== field.width || newHeight !== field.height) {
      onResize(newWidth, newHeight);
    }
  };

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: field.id,
    data: field,
  });

  const handleResizeStart = (e: React.MouseEvent, direction: string) => {
    e.stopPropagation();
    const startData = {
      x: e.clientX,
      y: e.clientY,
      width: field.width,
      height: field.height,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = (moveEvent.clientX - startData.x) / scale;
      const deltaY = (moveEvent.clientY - startData.y) / scale;

      let newWidth = startData.width;
      let newHeight = startData.height;

      if (direction.includes('e')) newWidth = Math.max(50, startData.width + deltaX);
      if (direction.includes('s')) newHeight = Math.max(30, startData.height + deltaY);

      onResize?.(newWidth, newHeight);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const style: React.CSSProperties = {
    position: 'absolute',
    left: `${field.x * scale}px`,
    top: `${field.y * scale}px`,
    width: `${field.width * scale}px`,
    height: `${field.height * scale}px`,
    backgroundColor: isSelected ? `${fieldColor}25` : `${fieldColor}15`,
    border: `2px ${isSelected ? 'solid' : 'dashed'} ${fieldColor}`,
    borderRadius: '8px',
    cursor: isDragging ? 'grabbing' : 'grab',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: `${11 * scale}px`,
    fontWeight: '600',
    color: fieldColor,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isSelected ? 1000 : 100,
    userSelect: 'none',
    boxShadow: isSelected ? `0 4px 12px ${fieldColor}40` : '0 2px 4px rgba(0,0,0,0.08)',
    transition: 'box-shadow 0.2s ease, background-color 0.2s ease',
  };

  const fieldLabel = `${FIELD_LABELS[field.type]} field${field.required ? ', required' : ''}${field.signer_email ? `, assigned to ${field.signer_email.split('@')[0]}` : ''}`;

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      onKeyDown={handleKeyDown}
      {...listeners}
      {...attributes}
      role="button"
      aria-label={`${fieldLabel}. Use arrow keys to move when selected, Delete to remove.`}
      aria-pressed={isSelected}
      tabIndex={0}
    >
      {/* Field Label - no pointer events so drag works */}
      <div style={{ pointerEvents: 'none', textAlign: 'center', padding: '4px' }} aria-hidden="true">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
          <span>{FIELD_LABELS[field.type]}</span>
          {field.required && <span style={{ color: '#dc3545', fontSize: '1.2em' }}>*</span>}
        </div>
        {field.signer_email && (
          <div style={{ fontSize: '0.75em', marginTop: '4px', opacity: 0.8, fontWeight: '500' }}>
            {field.signer_email.split('@')[0]}
          </div>
        )}
      </div>

      {/* Delete Button - always visible when selected */}
      {isSelected && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onDelete?.();
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          onTouchStart={(e) => {
            e.stopPropagation();
          }}
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
            pointerEvents: 'auto',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}
          aria-label="Delete field"
          title="Delete field"
        >
          <span aria-hidden="true">×</span>
        </button>
      )}

      {/* Resize Handles - separate pointer events, keyboard accessible */}
      {isSelected && onResize && (
        <>
          {/* Bottom-right resize handle */}
          <div
            role="slider"
            aria-label="Resize field diagonally. Use arrow keys to resize."
            aria-valuemin={50}
            aria-valuemax={500}
            aria-valuenow={Math.round(Math.sqrt(field.width * field.width + field.height * field.height))}
            tabIndex={0}
            onMouseDown={(e) => {
              e.stopPropagation();
              handleResizeStart(e, 'se');
            }}
            onKeyDown={(e) => handleResizeKeyDown(e, 'se')}
            style={{
              position: 'absolute',
              bottom: '-4px',
              right: '-4px',
              width: '12px',
              height: '12px',
              backgroundColor: fieldColor,
              border: '2px solid white',
              borderRadius: '50%',
              cursor: 'se-resize',
              zIndex: 1001,
              pointerEvents: 'auto',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }}
            title="Resize field"
          />
          {/* Right resize handle */}
          <div
            role="slider"
            aria-label="Resize field width. Use left/right arrow keys."
            aria-orientation="horizontal"
            aria-valuemin={50}
            aria-valuemax={500}
            aria-valuenow={Math.round(field.width)}
            tabIndex={0}
            onMouseDown={(e) => {
              e.stopPropagation();
              handleResizeStart(e, 'e');
            }}
            onKeyDown={(e) => handleResizeKeyDown(e, 'e')}
            style={{
              position: 'absolute',
              top: '50%',
              right: '-4px',
              transform: 'translateY(-50%)',
              width: '8px',
              height: '24px',
              backgroundColor: fieldColor,
              border: '2px solid white',
              borderRadius: '4px',
              cursor: 'e-resize',
              zIndex: 1001,
              pointerEvents: 'auto',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }}
          />
          {/* Bottom resize handle */}
          <div
            role="slider"
            aria-label="Resize field height. Use up/down arrow keys."
            aria-orientation="vertical"
            aria-valuemin={30}
            aria-valuemax={500}
            aria-valuenow={Math.round(field.height)}
            tabIndex={0}
            onMouseDown={(e) => {
              e.stopPropagation();
              handleResizeStart(e, 's');
            }}
            onKeyDown={(e) => handleResizeKeyDown(e, 's')}
            style={{
              position: 'absolute',
              bottom: '-4px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '24px',
              height: '8px',
              backgroundColor: fieldColor,
              border: '2px solid white',
              borderRadius: '4px',
              cursor: 's-resize',
              zIndex: 1001,
              pointerEvents: 'auto',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }}
          />
        </>
      )}
    </div>
  );
};

export default DraggableField;
