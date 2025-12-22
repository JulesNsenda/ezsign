/**
 * Migration: Add textarea field type
 *
 * Adds 'textarea' to the allowed field types for documents and templates.
 * Textarea fields allow signers to enter multi-line text.
 */

exports.up = (pgm) => {
  // Update the check constraint on fields table to include 'textarea'
  pgm.sql(`
    ALTER TABLE fields DROP CONSTRAINT IF EXISTS fields_type_check;
    ALTER TABLE fields ADD CONSTRAINT fields_type_check
      CHECK (type IN ('signature', 'initials', 'date', 'text', 'checkbox', 'radio', 'dropdown', 'textarea'));
  `);

  // Update template_fields as well
  pgm.sql(`
    ALTER TABLE template_fields DROP CONSTRAINT IF EXISTS template_fields_type_check;
    ALTER TABLE template_fields ADD CONSTRAINT template_fields_type_check
      CHECK (type IN ('signature', 'initials', 'date', 'text', 'checkbox', 'radio', 'dropdown', 'textarea'));
  `);
};

exports.down = (pgm) => {
  // Revert to previous constraint (without textarea)
  pgm.sql(`
    ALTER TABLE fields DROP CONSTRAINT IF EXISTS fields_type_check;
    ALTER TABLE fields ADD CONSTRAINT fields_type_check
      CHECK (type IN ('signature', 'initials', 'date', 'text', 'checkbox', 'radio', 'dropdown'));
  `);

  pgm.sql(`
    ALTER TABLE template_fields DROP CONSTRAINT IF EXISTS template_fields_type_check;
    ALTER TABLE template_fields ADD CONSTRAINT template_fields_type_check
      CHECK (type IN ('signature', 'initials', 'date', 'text', 'checkbox', 'radio', 'dropdown'));
  `);
};
