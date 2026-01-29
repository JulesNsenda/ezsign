/**
 * Migration: Add calculation column to fields table
 *
 * This enables calculated fields that can compute values from other fields.
 * Supported formulas:
 * - sum: Add numeric values from referenced fields
 * - concat: Join text values from referenced fields with optional separator
 * - today: Return current date
 * - count: Count non-empty referenced fields
 * - average: Calculate average of numeric fields
 *
 * Example calculation values:
 * {"formula": "sum", "fields": ["price", "tax"]}
 * {"formula": "concat", "fields": ["firstName", "lastName"], "separator": " "}
 * {"formula": "today", "format": "iso"}
 * {"formula": "count", "fields": ["option1", "option2", "option3"]}
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  // Add calculation column for storing calculation configuration
  pgm.addColumn('fields', {
    calculation: {
      type: 'jsonb',
      notNull: false,
      comment: 'Calculation configuration: {formula, fields[], separator?, format?, precision?}',
    },
  });

  // Add index for finding calculated fields
  pgm.createIndex('fields', 'calculation', {
    method: 'gin',
    name: 'idx_fields_calculation',
    ifNotExists: true,
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropIndex('fields', 'calculation', { name: 'idx_fields_calculation' });
  pgm.dropColumn('fields', 'calculation');
};
