import React, { forwardRef } from 'react';
import { useDroppable } from '@dnd-kit/core';

interface DroppablePdfContainerProps {
  children: React.ReactNode;
  onRefChange?: (node: HTMLDivElement | null) => void;
}

/**
 * Droppable container for PDF with visual feedback when dragging fields over it.
 * This component is defined outside of PrepareDocument to prevent remounting on parent re-renders.
 */
export const DroppablePdfContainer = forwardRef<HTMLDivElement, DroppablePdfContainerProps>(
  ({ children, onRefChange }, _ref) => {
    const { setNodeRef, isOver } = useDroppable({
      id: 'pdf-drop-zone',
    });

    return (
      <div
        ref={(node) => {
          setNodeRef(node);
          onRefChange?.(node);
        }}
        style={{
          position: 'relative',
          transition: 'outline 0.2s ease',
          outline: isOver ? '3px dashed #3b82f6' : 'none',
          outlineOffset: '4px',
          borderRadius: '8px',
        }}
      >
        {children}
        {/* Drop zone overlay when dragging */}
        {isOver && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(59, 130, 246, 0.08)',
              borderRadius: '8px',
              pointerEvents: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 50,
            }}
          >
            <div
              style={{
                backgroundColor: 'rgba(59, 130, 246, 0.9)',
                color: 'white',
                padding: '8px 16px',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 600,
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              }}
            >
              Drop field here
            </div>
          </div>
        )}
      </div>
    );
  }
);

DroppablePdfContainer.displayName = 'DroppablePdfContainer';

export default DroppablePdfContainer;
