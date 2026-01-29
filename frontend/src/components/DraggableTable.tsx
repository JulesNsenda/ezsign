import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { FieldTable } from '@/types';

/**
 * Draggable table field component for placing tables on PDF
 */

export interface DraggableTableProps {
  table: FieldTable;
  scale?: number;
  isSelected?: boolean;
  onClick?: () => void;
  onDelete?: () => void;
  onResize?: (width: number, height: number) => void;
}

const TABLE_COLOR = '#059669'; // Emerald-600

export const DraggableTable: React.FC<DraggableTableProps> = ({
  table,
  scale = 1,
  isSelected = false,
  onClick,
  onDelete,
  onResize,
}) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `table-${table.id}`,
    data: { ...table, isTable: true },
  });

  // Calculate table height based on rows
  const headerHeight = table.show_header ? table.row_height : 0;
  const rowCount = table.rows?.length || table.min_rows;
  const dataHeight = rowCount * table.row_height;
  const tableHeight = headerHeight + dataHeight;

  const handleResizeStart = (e: React.MouseEvent, direction: string) => {
    e.stopPropagation();
    const startData = {
      x: e.clientX,
      y: e.clientY,
      width: table.width,
      height: tableHeight,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = (moveEvent.clientX - startData.x) / scale;
      const deltaY = (moveEvent.clientY - startData.y) / scale;

      let newWidth = startData.width;
      let newHeight = startData.height;

      if (direction.includes('e')) newWidth = Math.max(150, startData.width + deltaX);
      if (direction.includes('s')) newHeight = Math.max(50, startData.height + deltaY);

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
    left: `${table.x * scale}px`,
    top: `${table.y * scale}px`,
    width: `${table.width * scale}px`,
    height: `${tableHeight * scale}px`,
    backgroundColor: isSelected ? `${TABLE_COLOR}20` : `${TABLE_COLOR}10`,
    border: `2px ${isSelected ? 'solid' : 'dashed'} ${TABLE_COLOR}`,
    borderRadius: '4px',
    cursor: isDragging ? 'grabbing' : 'grab',
    display: 'flex',
    flexDirection: 'column',
    fontSize: `${10 * scale}px`,
    color: TABLE_COLOR,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isSelected ? 1000 : 100,
    userSelect: 'none',
    boxShadow: isSelected ? `0 4px 12px ${TABLE_COLOR}40` : '0 2px 4px rgba(0,0,0,0.08)',
    transition: 'box-shadow 0.2s ease, background-color 0.2s ease',
    overflow: 'hidden',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      {...listeners}
      {...attributes}
    >
      {/* Table Preview */}
      <div style={{ pointerEvents: 'none', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        {table.show_header && (
          <div
            style={{
              display: 'flex',
              backgroundColor: table.header_background_color || '#f0f0f0',
              color: table.header_text_color || '#000',
              height: `${table.row_height * scale}px`,
              borderBottom: `1px solid ${table.border_color || '#ccc'}`,
              fontSize: `${(table.font_size || 10) * scale}px`,
              fontWeight: 600,
            }}
          >
            {table.columns.map((col, index) => (
              <div
                key={col.id}
                style={{
                  flex: col.width > 0 ? `0 0 ${(col.width / table.width) * 100}%` : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: `0 ${2 * scale}px`,
                  borderRight: index < table.columns.length - 1 ? `1px solid ${table.border_color || '#ccc'}` : 'none',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                }}
              >
                {col.name}
              </div>
            ))}
          </div>
        )}

        {/* Body rows preview */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {Array.from({ length: Math.min(rowCount, 3) }).map((_, rowIndex) => (
            <div
              key={rowIndex}
              style={{
                display: 'flex',
                height: `${table.row_height * scale}px`,
                borderBottom: rowIndex < rowCount - 1 ? `1px solid ${table.border_color || '#ccc'}` : 'none',
              }}
            >
              {table.columns.map((col, colIndex) => (
                <div
                  key={col.id}
                  style={{
                    flex: col.width > 0 ? `0 0 ${(col.width / table.width) * 100}%` : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRight: colIndex < table.columns.length - 1 ? `1px solid ${table.border_color || '#ccc'}` : 'none',
                    fontSize: `${(table.font_size || 10) * scale * 0.8}px`,
                    color: '#999',
                  }}
                >
                  {col.type === 'checkbox' ? '☐' : '...'}
                </div>
              ))}
            </div>
          ))}
          {rowCount > 3 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: `${8 * scale}px`,
                color: '#999',
                padding: `${2 * scale}px`,
              }}
            >
              +{rowCount - 3} more rows
            </div>
          )}
        </div>

        {/* Table name label */}
        <div
          style={{
            position: 'absolute',
            top: `-${16 * scale}px`,
            left: 0,
            fontSize: `${10 * scale}px`,
            fontWeight: 600,
            color: TABLE_COLOR,
            backgroundColor: 'white',
            padding: `0 ${4 * scale}px`,
            borderRadius: `${2 * scale}px`,
            boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
          }}
        >
          {table.name}
          {table.signer_email && (
            <span style={{ opacity: 0.7, marginLeft: `${4 * scale}px`, fontWeight: 400 }}>
              ({table.signer_email.split('@')[0]})
            </span>
          )}
        </div>
      </div>

      {/* Delete Button */}
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
          title="Delete table"
        >
          ×
        </button>
      )}

      {/* Resize Handles */}
      {isSelected && onResize && (
        <>
          {/* Bottom-right resize handle */}
          <div
            onMouseDown={(e) => {
              e.stopPropagation();
              handleResizeStart(e, 'se');
            }}
            style={{
              position: 'absolute',
              bottom: '-4px',
              right: '-4px',
              width: '12px',
              height: '12px',
              backgroundColor: TABLE_COLOR,
              border: '2px solid white',
              borderRadius: '50%',
              cursor: 'se-resize',
              zIndex: 1001,
              pointerEvents: 'auto',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }}
            title="Resize table"
          />
          {/* Right resize handle */}
          <div
            onMouseDown={(e) => {
              e.stopPropagation();
              handleResizeStart(e, 'e');
            }}
            style={{
              position: 'absolute',
              top: '50%',
              right: '-4px',
              transform: 'translateY(-50%)',
              width: '8px',
              height: '24px',
              backgroundColor: TABLE_COLOR,
              border: '2px solid white',
              borderRadius: '4px',
              cursor: 'e-resize',
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

export default DraggableTable;
