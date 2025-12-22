/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * Add 'radio' to the allowed field types for fields and template_fields tables
 *
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  // Update the check constraint on fields table to include 'radio'
  pgm.sql(`
    ALTER TABLE fields DROP CONSTRAINT IF EXISTS fields_type_check;
    ALTER TABLE fields ADD CONSTRAINT fields_type_check
      CHECK (type IN ('signature', 'initials', 'date', 'text', 'checkbox', 'radio'));
  `);

  // Update template_fields check constraint as well
  pgm.sql(`
    ALTER TABLE template_fields DROP CONSTRAINT IF EXISTS template_fields_type_check;
    ALTER TABLE template_fields ADD CONSTRAINT template_fields_type_check
      CHECK (type IN ('signature', 'initials', 'date', 'text', 'checkbox', 'radio'));
  `);
};

/**
 * Remove 'radio' from the allowed field types
 *
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  // Note: This will fail if any radio fields exist in the database
  pgm.sql(`
    ALTER TABLE fields DROP CONSTRAINT IF EXISTS fields_type_check;
    ALTER TABLE fields ADD CONSTRAINT fields_type_check
      CHECK (type IN ('signature', 'initials', 'date', 'text', 'checkbox'));
  `);

  pgm.sql(`
    ALTER TABLE template_fields DROP CONSTRAINT IF EXISTS template_fields_type_check;
    ALTER TABLE template_fields ADD CONSTRAINT template_fields_type_check
      CHECK (type IN ('signature', 'initials', 'date', 'text', 'checkbox'));
  `);
};
