/**
 * Migration: Add dropdown field type
 *
 * Adds 'dropdown' to the allowed field types for documents and templates.
 * Dropdown fields allow signers to select one option from a predefined list.
 */

exports.up = (pgm) => {
  // Update the check constraint on fields table to include 'dropdown'
  pgm.sql(`
    ALTER TABLE fields DROP CONSTRAINT IF EXISTS fields_type_check;
    ALTER TABLE fields ADD CONSTRAINT fields_type_check
      CHECK (type IN ('signature', 'initials', 'date', 'text', 'checkbox', 'radio', 'dropdown'));
  `);

  // Update template_fields as well
  pgm.sql(`
    ALTER TABLE template_fields DROP CONSTRAINT IF EXISTS template_fields_type_check;
    ALTER TABLE template_fields ADD CONSTRAINT template_fields_type_check
      CHECK (type IN ('signature', 'initials', 'date', 'text', 'checkbox', 'radio', 'dropdown'));
  `);
};

exports.down = (pgm) => {
  // Revert to previous constraint (without dropdown)
  pgm.sql(`
    ALTER TABLE fields DROP CONSTRAINT IF EXISTS fields_type_check;
    ALTER TABLE fields ADD CONSTRAINT fields_type_check
      CHECK (type IN ('signature', 'initials', 'date', 'text', 'checkbox', 'radio'));
  `);

  pgm.sql(`
    ALTER TABLE template_fields DROP CONSTRAINT IF EXISTS template_fields_type_check;
    ALTER TABLE template_fields ADD CONSTRAINT template_fields_type_check
      CHECK (type IN ('signature', 'initials', 'date', 'text', 'checkbox', 'radio'));
  `);
};
