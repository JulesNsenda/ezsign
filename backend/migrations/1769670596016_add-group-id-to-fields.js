/**
 * Add group_id column to fields table
 * Allows fields to be assigned to field groups/sections
 */

/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  // Add group_id column (nullable for backward compatibility)
  pgm.addColumn('fields', {
    group_id: {
      type: 'uuid',
      references: 'field_groups(id)',
      onDelete: 'SET NULL',
      comment: 'Optional field group/section this field belongs to',
    },
  });

  // Add group_sort_order column
  pgm.addColumn('fields', {
    group_sort_order: {
      type: 'integer',
      comment: 'Order of field within its group (null if ungrouped)',
    },
  });

  // Create indexes for efficient group queries
  pgm.createIndex('fields', 'group_id');
  pgm.createIndex('fields', ['group_id', 'group_sort_order']);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropIndex('fields', ['group_id', 'group_sort_order']);
  pgm.dropIndex('fields', 'group_id');
  pgm.dropColumn('fields', 'group_sort_order');
  pgm.dropColumn('fields', 'group_id');
};
