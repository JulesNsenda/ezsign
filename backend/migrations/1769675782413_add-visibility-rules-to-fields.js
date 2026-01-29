/**
 * Migration: Add visibility_rules to fields table
 *
 * Adds JSONB column for conditional field visibility.
 * Visibility rules allow fields to show/hide based on other field values.
 *
 * Rule structure:
 * {
 *   "operator": "and" | "or",
 *   "conditions": [
 *     {
 *       "fieldId": "uuid",        // Reference to another field
 *       "comparison": "equals" | "not_equals" | "contains" | "not_empty" | "is_checked" | "is_not_checked",
 *       "value": "any"            // Value to compare against (optional for some comparisons)
 *     }
 *   ]
 * }
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  // Add visibility_rules JSONB column
  pgm.addColumn('fields', {
    visibility_rules: {
      type: 'jsonb',
      default: null,
    },
  });

  // Add index for querying fields with visibility rules
  pgm.createIndex('fields', 'visibility_rules', {
    name: 'idx_fields_visibility_rules',
    method: 'gin',
    where: 'visibility_rules IS NOT NULL',
  });

  // Add comment for documentation
  pgm.sql(`
    COMMENT ON COLUMN fields.visibility_rules IS
    'Conditional visibility rules as JSONB. Fields with rules show/hide based on other field values.';
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.dropIndex('fields', 'visibility_rules', { name: 'idx_fields_visibility_rules' });
  pgm.dropColumn('fields', 'visibility_rules');
};
