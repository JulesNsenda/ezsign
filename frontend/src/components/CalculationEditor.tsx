import React, { useState, useCallback } from 'react';
import type { CalculationConfig, CalculationFormula, Field } from '@/types';

interface CalculationEditorProps {
  calculation?: CalculationConfig | null;
  fields: Field[];
  currentFieldId: string;
  onChange: (calculation: CalculationConfig | null) => void;
}

const FORMULA_OPTIONS: { value: CalculationFormula; label: string; description: string; needsFields: boolean }[] = [
  { value: 'sum', label: 'Sum', description: 'Add numeric values from selected fields', needsFields: true },
  { value: 'average', label: 'Average', description: 'Calculate average of numeric fields', needsFields: true },
  { value: 'min', label: 'Minimum', description: 'Find minimum value from selected fields', needsFields: true },
  { value: 'max', label: 'Maximum', description: 'Find maximum value from selected fields', needsFields: true },
  { value: 'count', label: 'Count', description: 'Count non-empty selected fields', needsFields: true },
  { value: 'concat', label: 'Concatenate', description: 'Join text values with a separator', needsFields: true },
  { value: 'today', label: "Today's Date", description: 'Insert current date automatically', needsFields: false },
];

/**
 * Editor component for configuring field calculations
 */
export const CalculationEditor: React.FC<CalculationEditorProps> = ({
  calculation,
  fields,
  currentFieldId,
  onChange,
}) => {
  const [isEnabled, setIsEnabled] = useState(!!calculation);
  const [formula, setFormula] = useState<CalculationFormula>(calculation?.formula || 'sum');
  const [selectedFields, setSelectedFields] = useState<string[]>(calculation?.fields || []);
  const [separator, setSeparator] = useState(calculation?.separator ?? ' ');
  const [precision, setPrecision] = useState(calculation?.precision);
  const [dateFormat, setDateFormat] = useState<'iso' | 'locale' | 'short'>(calculation?.format || 'iso');

  // Filter out the current field and non-numeric fields for certain formulas
  const availableFields = fields.filter((f) => f.id !== currentFieldId);

  const numericFormulas: CalculationFormula[] = ['sum', 'average', 'min', 'max'];
  const formulaInfo = FORMULA_OPTIONS.find((f) => f.value === formula);

  const handleToggle = useCallback((enabled: boolean) => {
    setIsEnabled(enabled);
    if (!enabled) {
      onChange(null);
    } else {
      // When enabling, create a default calculation
      onChange({
        formula,
        fields: formulaInfo?.needsFields ? selectedFields : undefined,
        separator: formula === 'concat' ? separator : undefined,
        precision: numericFormulas.includes(formula) ? precision : undefined,
        format: formula === 'today' ? dateFormat : undefined,
      });
    }
  }, [formula, selectedFields, separator, precision, dateFormat, onChange, formulaInfo?.needsFields]);

  const handleFormulaChange = useCallback((newFormula: CalculationFormula) => {
    setFormula(newFormula);
    const info = FORMULA_OPTIONS.find((f) => f.value === newFormula);

    if (isEnabled) {
      onChange({
        formula: newFormula,
        fields: info?.needsFields ? selectedFields : undefined,
        separator: newFormula === 'concat' ? separator : undefined,
        precision: numericFormulas.includes(newFormula) ? precision : undefined,
        format: newFormula === 'today' ? dateFormat : undefined,
      });
    }
  }, [isEnabled, selectedFields, separator, precision, dateFormat, onChange]);

  const handleFieldToggle = useCallback((fieldId: string) => {
    const newSelected = selectedFields.includes(fieldId)
      ? selectedFields.filter((id) => id !== fieldId)
      : [...selectedFields, fieldId];

    setSelectedFields(newSelected);

    if (isEnabled && formulaInfo?.needsFields) {
      onChange({
        formula,
        fields: newSelected,
        separator: formula === 'concat' ? separator : undefined,
        precision: numericFormulas.includes(formula) ? precision : undefined,
        format: formula === 'today' ? dateFormat : undefined,
      });
    }
  }, [selectedFields, isEnabled, formula, separator, precision, dateFormat, onChange, formulaInfo?.needsFields]);

  const handleSeparatorChange = useCallback((newSeparator: string) => {
    setSeparator(newSeparator);
    if (isEnabled && formula === 'concat') {
      onChange({
        formula,
        fields: selectedFields,
        separator: newSeparator,
      });
    }
  }, [isEnabled, formula, selectedFields, onChange]);

  const handlePrecisionChange = useCallback((newPrecision: number | undefined) => {
    setPrecision(newPrecision);
    if (isEnabled && numericFormulas.includes(formula)) {
      onChange({
        formula,
        fields: selectedFields,
        precision: newPrecision,
      });
    }
  }, [isEnabled, formula, selectedFields, onChange]);

  const handleDateFormatChange = useCallback((newFormat: 'iso' | 'locale' | 'short') => {
    setDateFormat(newFormat);
    if (isEnabled && formula === 'today') {
      onChange({
        formula,
        format: newFormat,
      });
    }
  }, [isEnabled, formula, onChange]);

  return (
    <div className="border-t border-base-300 pt-4" role="region" aria-label="Calculation settings">
      {/* Enable/Disable Toggle */}
      <label className="flex items-center gap-2 cursor-pointer mb-3">
        <input
          type="checkbox"
          checked={isEnabled}
          onChange={(e) => handleToggle(e.target.checked)}
          className="checkbox checkbox-sm checkbox-secondary"
          aria-expanded={isEnabled}
          aria-controls="calculation-options"
        />
        <span className="text-sm font-semibold">Enable Calculation</span>
      </label>

      {isEnabled && (
        <div id="calculation-options" className="flex flex-col gap-3 pl-6">
          {/* Formula Selection */}
          <div>
            <label htmlFor="formula-select" className="block text-xs font-semibold text-base-content/70 mb-1 uppercase tracking-wide">
              Formula
            </label>
            <select
              id="formula-select"
              value={formula}
              onChange={(e) => handleFormulaChange(e.target.value as CalculationFormula)}
              className="select select-bordered select-sm w-full"
              aria-describedby="formula-description"
            >
              {FORMULA_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {formulaInfo && (
              <p id="formula-description" className="text-xs text-base-content/50 mt-1">{formulaInfo.description}</p>
            )}
          </div>

          {/* Field Selection (for formulas that need fields) */}
          {formulaInfo?.needsFields && (
            <fieldset>
              <legend className="block text-xs font-semibold text-base-content/70 mb-1 uppercase tracking-wide">
                Source Fields
              </legend>
              {availableFields.length === 0 ? (
                <p className="text-xs text-warning" role="alert">
                  No other fields available. Add more fields to the document first.
                </p>
              ) : (
                <div className="max-h-40 overflow-y-auto border border-base-300 rounded-lg" role="group" aria-label="Select source fields for calculation">
                  {availableFields.map((field) => (
                    <label
                      key={field.id}
                      className="flex items-center gap-2 p-2 hover:bg-base-100 cursor-pointer border-b border-base-200 last:border-b-0"
                    >
                      <input
                        type="checkbox"
                        checked={selectedFields.includes(field.id)}
                        onChange={() => handleFieldToggle(field.id)}
                        className="checkbox checkbox-xs"
                        aria-label={`Include ${field.properties?.placeholder || field.type} field in calculation`}
                      />
                      <span className="text-sm flex-1">
                        {field.properties?.placeholder || `${field.type} field`}
                      </span>
                      <span className="text-xs px-1.5 py-0.5 bg-base-200 rounded" aria-hidden="true">
                        {field.type}
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {selectedFields.length === 0 && formulaInfo?.needsFields && (
                <p className="text-xs text-warning mt-1" role="alert">
                  Select at least one field for the calculation.
                </p>
              )}
            </fieldset>
          )}

          {/* Separator (for concat) */}
          {formula === 'concat' && (
            <div>
              <label className="block text-xs font-semibold text-base-content/70 mb-1 uppercase tracking-wide">
                Separator
              </label>
              <input
                type="text"
                value={separator}
                onChange={(e) => handleSeparatorChange(e.target.value)}
                placeholder="Space by default"
                className="input input-bordered input-sm w-full"
              />
              <p className="text-xs text-base-content/50 mt-1">
                Character(s) to insert between values (e.g., ", " or " - ")
              </p>
            </div>
          )}

          {/* Precision (for numeric formulas) */}
          {numericFormulas.includes(formula) && (
            <div>
              <label className="block text-xs font-semibold text-base-content/70 mb-1 uppercase tracking-wide">
                Decimal Places
              </label>
              <input
                type="number"
                value={precision ?? ''}
                onChange={(e) =>
                  handlePrecisionChange(e.target.value ? parseInt(e.target.value) : undefined)
                }
                placeholder="Auto"
                min={0}
                max={10}
                className="input input-bordered input-sm w-full"
              />
              <p className="text-xs text-base-content/50 mt-1">
                Leave empty for automatic precision
              </p>
            </div>
          )}

          {/* Date Format (for today) */}
          {formula === 'today' && (
            <div>
              <label className="block text-xs font-semibold text-base-content/70 mb-1 uppercase tracking-wide">
                Date Format
              </label>
              <select
                value={dateFormat}
                onChange={(e) =>
                  handleDateFormatChange(e.target.value as 'iso' | 'locale' | 'short')
                }
                className="select select-bordered select-sm w-full"
              >
                <option value="iso">ISO (YYYY-MM-DD)</option>
                <option value="locale">Locale (varies by region)</option>
                <option value="short">Short (M/D/YYYY)</option>
              </select>
            </div>
          )}

          {/* Preview */}
          <div className="bg-base-200 rounded-lg p-2">
            <div className="text-xs text-base-content/60 mb-1">Preview:</div>
            <div className="font-mono text-sm">
              {formula === 'today' ? (
                <span>
                  {dateFormat === 'iso'
                    ? new Date().toISOString().split('T')[0]
                    : dateFormat === 'locale'
                    ? new Date().toLocaleDateString()
                    : `${new Date().getMonth() + 1}/${new Date().getDate()}/${new Date().getFullYear()}`}
                </span>
              ) : selectedFields.length > 0 ? (
                <span className="text-base-content/50">
                  = {formula.toUpperCase()}({selectedFields.length} fields)
                </span>
              ) : (
                <span className="text-base-content/40">Select fields to calculate</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalculationEditor;
