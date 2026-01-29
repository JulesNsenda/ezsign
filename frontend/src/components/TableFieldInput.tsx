import React, { useState, useCallback } from 'react';
import Button from './Button';
import type { FieldTable, TableColumn, TableRowValues } from '@/types';

interface TableFieldInputProps {
  table: FieldTable;
  onSave: (rows: TableRowValues[]) => void;
  onCancel?: () => void;
  readOnly?: boolean;
}

/**
 * Input component for table fields during signing
 * Allows editing table data with support for adding/removing rows
 */
export const TableFieldInput: React.FC<TableFieldInputProps> = ({
  table,
  onSave,
  onCancel,
  readOnly = false,
}) => {
  // Initialize rows from table data or create minimum required rows
  const initializeRows = (): TableRowValues[] => {
    const existingRows = table.rows?.map((r) => ({ ...r.values })) || [];
    while (existingRows.length < table.min_rows) {
      existingRows.push(createEmptyRow());
    }
    return existingRows;
  };

  const createEmptyRow = (): TableRowValues => {
    const row: TableRowValues = {};
    table.columns.forEach((col) => {
      row[col.id] = col.defaultValue || (col.type === 'checkbox' ? false : null);
    });
    return row;
  };

  const [rows, setRows] = useState<TableRowValues[]>(initializeRows);
  const [errors, setErrors] = useState<Record<string, Record<string, string>>>({});

  const validateRow = useCallback(
    (_rowIndex: number, rowValues: TableRowValues): Record<string, string> => {
      const rowErrors: Record<string, string> = {};

      table.columns.forEach((col) => {
        const value = rowValues[col.id];

        // Check required
        if (col.required) {
          if (value === null || value === undefined || value === '') {
            rowErrors[col.id] = `${col.name} is required`;
            return;
          }
        }

        // Skip further validation if empty and not required
        if (value === null || value === undefined || value === '') {
          return;
        }

        // Type validation
        switch (col.type) {
          case 'number':
            if (isNaN(Number(value))) {
              rowErrors[col.id] = `${col.name} must be a number`;
            }
            break;
          case 'date':
            if (typeof value === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
              rowErrors[col.id] = `${col.name} must be a valid date (YYYY-MM-DD)`;
            }
            break;
        }
      });

      return rowErrors;
    },
    [table.columns]
  );

  const validateAllRows = useCallback((): boolean => {
    const newErrors: Record<string, Record<string, string>> = {};
    let hasErrors = false;

    rows.forEach((row, index) => {
      const rowErrors = validateRow(index, row);
      if (Object.keys(rowErrors).length > 0) {
        newErrors[index] = rowErrors;
        hasErrors = true;
      }
    });

    setErrors(newErrors);
    return !hasErrors;
  }, [rows, validateRow]);

  const handleCellChange = (
    rowIndex: number,
    columnId: string,
    value: string | number | boolean | null
  ) => {
    setRows((prevRows) => {
      const newRows = [...prevRows];
      newRows[rowIndex] = { ...newRows[rowIndex], [columnId]: value };
      return newRows;
    });

    // Clear error for this cell
    setErrors((prev) => {
      if (prev[rowIndex]?.[columnId]) {
        const newErrors = { ...prev };
        const rowErrors = { ...newErrors[rowIndex] };
        delete rowErrors[columnId];
        if (Object.keys(rowErrors).length === 0) {
          delete newErrors[rowIndex];
        } else {
          newErrors[rowIndex] = rowErrors;
        }
        return newErrors;
      }
      return prev;
    });
  };

  const handleAddRow = () => {
    if (rows.length < table.max_rows) {
      setRows([...rows, createEmptyRow()]);
    }
  };

  const handleRemoveRow = (index: number) => {
    if (rows.length > table.min_rows) {
      const newRows = rows.filter((_, i) => i !== index);
      setRows(newRows);

      // Update error indices
      setErrors((prev) => {
        const newErrors: Record<string, Record<string, string>> = {};
        Object.entries(prev).forEach(([key, value]) => {
          const idx = parseInt(key);
          if (idx < index) {
            newErrors[key] = value;
          } else if (idx > index) {
            newErrors[idx - 1] = value;
          }
        });
        return newErrors;
      });
    }
  };

  const handleSave = () => {
    if (validateAllRows()) {
      onSave(rows);
    }
  };

  const canAddRow = table.allow_add_rows && rows.length < table.max_rows;
  const canRemoveRow = table.allow_remove_rows && rows.length > table.min_rows;

  const renderCellInput = (
    column: TableColumn,
    rowIndex: number,
    value: string | number | boolean | null
  ) => {
    const error = errors[rowIndex]?.[column.id];
    const baseClassName = `input input-bordered input-sm w-full ${
      error ? 'border-error' : ''
    }`;

    switch (column.type) {
      case 'checkbox':
        return (
          <input
            type="checkbox"
            checked={value === true || value === 'true'}
            onChange={(e) => handleCellChange(rowIndex, column.id, e.target.checked)}
            disabled={readOnly}
            className="checkbox checkbox-sm"
          />
        );

      case 'number':
        return (
          <input
            type="number"
            value={value as number ?? ''}
            onChange={(e) =>
              handleCellChange(
                rowIndex,
                column.id,
                e.target.value ? parseFloat(e.target.value) : null
              )
            }
            placeholder={column.placeholder}
            disabled={readOnly}
            className={baseClassName}
          />
        );

      case 'date':
        return (
          <input
            type="date"
            value={(value as string) ?? ''}
            onChange={(e) => handleCellChange(rowIndex, column.id, e.target.value || null)}
            disabled={readOnly}
            className={baseClassName}
          />
        );

      default:
        return (
          <input
            type="text"
            value={(value as string) ?? ''}
            onChange={(e) => handleCellChange(rowIndex, column.id, e.target.value || null)}
            placeholder={column.placeholder}
            disabled={readOnly}
            className={baseClassName}
          />
        );
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="text-sm text-base-content/60">
        {table.name}
        {table.description && (
          <span className="block text-xs text-base-content/40 mt-1">
            {table.description}
          </span>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-base-300 rounded-lg">
        <table className="table table-sm w-full">
          {/* Header */}
          {table.show_header && (
            <thead
              style={{
                backgroundColor: table.header_background_color || '#f0f0f0',
                color: table.header_text_color || '#000000',
              }}
            >
              <tr>
                {table.columns.map((col) => (
                  <th
                    key={col.id}
                    style={{
                      width: col.width > 0 ? `${col.width}px` : 'auto',
                      fontSize: `${table.font_size}px`,
                    }}
                  >
                    {col.name}
                    {col.required && <span className="text-error ml-1">*</span>}
                  </th>
                ))}
                {canRemoveRow && <th className="w-10"></th>}
              </tr>
            </thead>
          )}

          {/* Body */}
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                style={{ height: `${table.row_height}px` }}
              >
                {table.columns.map((col) => (
                  <td
                    key={col.id}
                    style={{
                      width: col.width > 0 ? `${col.width}px` : 'auto',
                    }}
                    className="relative"
                  >
                    {renderCellInput(col, rowIndex, row[col.id])}
                    {errors[rowIndex]?.[col.id] && (
                      <div className="absolute -bottom-4 left-0 text-xs text-error whitespace-nowrap">
                        {errors[rowIndex][col.id]}
                      </div>
                    )}
                  </td>
                ))}
                {canRemoveRow && (
                  <td className="w-10">
                    <button
                      type="button"
                      onClick={() => handleRemoveRow(rowIndex)}
                      className="btn btn-ghost btn-xs text-error"
                      title="Remove row"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Row controls */}
      <div className="flex justify-between items-center text-sm text-base-content/60">
        <span>
          {rows.length} of {table.max_rows} rows (min: {table.min_rows})
        </span>
        {canAddRow && !readOnly && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddRow}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 mr-1"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Add Row
          </Button>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 justify-end pt-4 border-t border-base-300">
        {onCancel && (
          <Button variant="outline" size="md" onClick={onCancel}>
            Cancel
          </Button>
        )}
        {!readOnly && (
          <Button variant="primary" size="md" onClick={handleSave}>
            Confirm
          </Button>
        )}
      </div>
    </div>
  );
};

export default TableFieldInput;
