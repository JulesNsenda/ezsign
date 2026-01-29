import React, { useState } from 'react';
import type { FieldTable, TableColumn, TableColumnType, UpdateFieldTableData } from '@/types';
import Button from './Button';

export interface TablePropertiesProps {
  table: FieldTable | null;
  signers: Array<{ id: string; email: string; name: string }>;
  onUpdate: (updates: UpdateFieldTableData) => void;
  onDelete: () => void;
  onClose: () => void;
  onAddColumn: (column: Omit<TableColumn, 'id'>) => void;
  onUpdateColumn: (columnId: string, updates: Partial<Omit<TableColumn, 'id'>>) => void;
  onDeleteColumn: (columnId: string) => void;
}

const COLUMN_TYPES: { value: TableColumnType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'checkbox', label: 'Checkbox' },
];

/**
 * Table properties panel for editing table settings
 */
const TableProperties: React.FC<TablePropertiesProps> = ({
  table,
  signers,
  onUpdate,
  onDelete,
  onClose,
  onAddColumn,
  onUpdateColumn,
  onDeleteColumn,
}) => {
  const [newColumnName, setNewColumnName] = useState('');
  const [newColumnType, setNewColumnType] = useState<TableColumnType>('text');
  const [expandedColumn, setExpandedColumn] = useState<string | null>(null);

  if (!table) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-base-300 p-5 min-h-[200px] flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-3 opacity-40">📊</div>
          <p className="text-sm text-base-content/60">Select a table</p>
          <p className="text-xs text-base-content/50 mt-1">Click on a table to edit</p>
        </div>
      </div>
    );
  }

  const handleAddColumn = () => {
    if (!newColumnName.trim()) return;

    onAddColumn({
      name: newColumnName.trim(),
      type: newColumnType,
      width: 100,
      required: false,
    });

    setNewColumnName('');
    setNewColumnType('text');
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-base-300 p-5 h-fit sticky top-6 max-h-[calc(100vh-120px)] overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-neutral flex items-center gap-2">
          <span className="text-lg">📊</span>
          Table Properties
        </h3>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-base-200 text-base-content/60 hover:text-base-content transition-all text-xl"
        >
          ×
        </button>
      </div>

      <div className="flex flex-col gap-4">
        {/* Table Name */}
        <div>
          <label className="block text-xs font-semibold text-base-content/70 mb-2 uppercase tracking-wide">
            Table Name
          </label>
          <input
            type="text"
            value={table.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            className="input input-bordered input-sm w-full"
            placeholder="Enter table name"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-semibold text-base-content/70 mb-2 uppercase tracking-wide">
            Description
          </label>
          <textarea
            value={table.description || ''}
            onChange={(e) => onUpdate({ description: e.target.value || undefined })}
            className="textarea textarea-bordered textarea-sm w-full"
            placeholder="Optional description"
            rows={2}
          />
        </div>

        {/* Page */}
        <div>
          <label className="block text-xs font-semibold text-base-content/70 mb-2 uppercase tracking-wide">
            Page
          </label>
          <div className="input input-bordered input-sm w-full bg-base-200 cursor-not-allowed">
            Page {table.page + 1}
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
              value={Math.round(table.x)}
              onChange={(e) => onUpdate({ x: Number(e.target.value) })}
              className="input input-bordered input-sm"
              placeholder="X"
            />
            <input
              type="number"
              value={Math.round(table.y)}
              onChange={(e) => onUpdate({ y: Number(e.target.value) })}
              className="input input-bordered input-sm"
              placeholder="Y"
            />
          </div>
        </div>

        {/* Width */}
        <div>
          <label className="block text-xs font-semibold text-base-content/70 mb-2 uppercase tracking-wide">
            Width
          </label>
          <input
            type="number"
            value={Math.round(table.width)}
            onChange={(e) => onUpdate({ width: Number(e.target.value) })}
            min={150}
            className="input input-bordered input-sm w-full"
          />
        </div>

        {/* Row Settings */}
        <div className="border-t border-base-300 pt-4">
          <label className="block text-xs font-semibold text-base-content/70 mb-2 uppercase tracking-wide">
            Row Settings
          </label>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-base-content/60">Min</label>
              <input
                type="number"
                value={table.min_rows}
                onChange={(e) => onUpdate({ min_rows: Number(e.target.value) })}
                min={0}
                max={table.max_rows}
                className="input input-bordered input-sm w-full"
              />
            </div>
            <div>
              <label className="text-xs text-base-content/60">Max</label>
              <input
                type="number"
                value={table.max_rows}
                onChange={(e) => onUpdate({ max_rows: Number(e.target.value) })}
                min={table.min_rows}
                max={100}
                className="input input-bordered input-sm w-full"
              />
            </div>
            <div>
              <label className="text-xs text-base-content/60">Height</label>
              <input
                type="number"
                value={table.row_height}
                onChange={(e) => onUpdate({ row_height: Number(e.target.value) })}
                min={15}
                className="input input-bordered input-sm w-full"
              />
            </div>
          </div>
        </div>

        {/* Row Permissions */}
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={table.allow_add_rows}
              onChange={(e) => onUpdate({ allow_add_rows: e.target.checked })}
              className="checkbox checkbox-sm"
            />
            <span className="text-sm">Allow signer to add rows</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={table.allow_remove_rows}
              onChange={(e) => onUpdate({ allow_remove_rows: e.target.checked })}
              className="checkbox checkbox-sm"
            />
            <span className="text-sm">Allow signer to remove rows</span>
          </label>
        </div>

        {/* Header Settings */}
        <div className="border-t border-base-300 pt-4">
          <label className="flex items-center gap-2 cursor-pointer mb-3">
            <input
              type="checkbox"
              checked={table.show_header}
              onChange={(e) => onUpdate({ show_header: e.target.checked })}
              className="checkbox checkbox-sm"
            />
            <span className="text-sm font-semibold">Show Header Row</span>
          </label>

          {table.show_header && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-base-content/60">Background</label>
                <input
                  type="color"
                  value={table.header_background_color || '#f0f0f0'}
                  onChange={(e) => onUpdate({ header_background_color: e.target.value })}
                  className="w-full h-8 rounded border border-base-300 cursor-pointer"
                />
              </div>
              <div>
                <label className="text-xs text-base-content/60">Text Color</label>
                <input
                  type="color"
                  value={table.header_text_color || '#000000'}
                  onChange={(e) => onUpdate({ header_text_color: e.target.value })}
                  className="w-full h-8 rounded border border-base-300 cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>

        {/* Font Size */}
        <div>
          <label className="block text-xs font-semibold text-base-content/70 mb-2 uppercase tracking-wide">
            Font Size
          </label>
          <input
            type="number"
            value={table.font_size}
            onChange={(e) => onUpdate({ font_size: Number(e.target.value) })}
            min={8}
            max={24}
            className="input input-bordered input-sm w-full"
          />
        </div>

        {/* Signer Assignment */}
        <div className="border-t border-base-300 pt-4">
          <label className="block text-xs font-semibold text-base-content/70 mb-2 uppercase tracking-wide">
            Assigned Signer
          </label>
          <select
            value={table.signer_email || ''}
            onChange={(e) => onUpdate({ signer_email: e.target.value || undefined })}
            className="select select-bordered select-sm w-full"
          >
            <option value="">Any signer</option>
            {signers.map((signer) => (
              <option key={signer.id} value={signer.email}>
                {signer.name} ({signer.email})
              </option>
            ))}
          </select>
        </div>

        {/* Columns */}
        <div className="border-t border-base-300 pt-4">
          <label className="block text-xs font-semibold text-base-content/70 mb-2 uppercase tracking-wide">
            Columns ({table.columns.length})
          </label>

          {/* Column List */}
          <div className="flex flex-col gap-2 mb-3">
            {table.columns.map((col) => (
              <div
                key={col.id}
                className={`border rounded-lg transition-all ${
                  expandedColumn === col.id ? 'border-secondary' : 'border-base-300'
                }`}
              >
                <div
                  className="flex items-center justify-between p-2 cursor-pointer hover:bg-base-100"
                  onClick={() => setExpandedColumn(expandedColumn === col.id ? null : col.id)}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{col.name}</span>
                    <span className="text-xs px-2 py-0.5 bg-base-200 rounded">{col.type}</span>
                    {col.required && <span className="text-error text-xs">*</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (table.columns.length > 1) {
                          onDeleteColumn(col.id);
                        }
                      }}
                      disabled={table.columns.length <= 1}
                      className="btn btn-ghost btn-xs text-error disabled:opacity-50"
                      title="Delete column"
                    >
                      ×
                    </button>
                    <span className="text-xs text-base-content/50">
                      {expandedColumn === col.id ? '▲' : '▼'}
                    </span>
                  </div>
                </div>

                {expandedColumn === col.id && (
                  <div className="p-3 border-t border-base-200 bg-base-50 flex flex-col gap-2">
                    <div>
                      <label className="text-xs text-base-content/60">Name</label>
                      <input
                        type="text"
                        value={col.name}
                        onChange={(e) => onUpdateColumn(col.id, { name: e.target.value })}
                        className="input input-bordered input-sm w-full"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-base-content/60">Type</label>
                      <select
                        value={col.type}
                        onChange={(e) => onUpdateColumn(col.id, { type: e.target.value as TableColumnType })}
                        className="select select-bordered select-sm w-full"
                      >
                        {COLUMN_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-base-content/60">Width (0 = auto)</label>
                      <input
                        type="number"
                        value={col.width}
                        onChange={(e) => onUpdateColumn(col.id, { width: Number(e.target.value) })}
                        min={0}
                        className="input input-bordered input-sm w-full"
                      />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={col.required}
                        onChange={(e) => onUpdateColumn(col.id, { required: e.target.checked })}
                        className="checkbox checkbox-sm"
                      />
                      <span className="text-sm">Required</span>
                    </label>
                    {col.type !== 'checkbox' && (
                      <div>
                        <label className="text-xs text-base-content/60">Placeholder</label>
                        <input
                          type="text"
                          value={col.placeholder || ''}
                          onChange={(e) => onUpdateColumn(col.id, { placeholder: e.target.value || undefined })}
                          className="input input-bordered input-sm w-full"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Add Column */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newColumnName}
              onChange={(e) => setNewColumnName(e.target.value)}
              placeholder="Column name"
              className="input input-bordered input-sm flex-1"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleAddColumn();
                }
              }}
            />
            <select
              value={newColumnType}
              onChange={(e) => setNewColumnType(e.target.value as TableColumnType)}
              className="select select-bordered select-sm w-24"
            >
              {COLUMN_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddColumn}
              disabled={!newColumnName.trim() || table.columns.length >= 20}
            >
              +
            </Button>
          </div>
          {table.columns.length >= 20 && (
            <p className="text-xs text-warning mt-1">Maximum 20 columns allowed</p>
          )}
        </div>

        {/* Delete Button */}
        <div className="border-t border-base-300 pt-4">
          <Button variant="danger" size="sm" className="w-full" onClick={onDelete}>
            Delete Table
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TableProperties;
