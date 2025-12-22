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
  // Add thumbnail-related columns to documents table
  pgm.addColumn('documents', {
    thumbnail_path: {
      type: 'varchar(500)',
      comment: 'Path to stored thumbnail image',
    },
    thumbnail_generated_at: {
      type: 'timestamp',
      comment: 'When the thumbnail was last generated',
    },
  });

  // Add optimization tracking columns
  pgm.addColumn('documents', {
    is_optimized: {
      type: 'boolean',
      notNull: true,
      default: false,
      comment: 'Whether the PDF has been optimized',
    },
    original_file_size: {
      type: 'integer',
      comment: 'Original file size before optimization (bytes)',
    },
    optimized_at: {
      type: 'timestamp',
      comment: 'When the PDF was optimized',
    },
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  // Remove optimization tracking columns
  pgm.dropColumn('documents', 'optimized_at');
  pgm.dropColumn('documents', 'original_file_size');
  pgm.dropColumn('documents', 'is_optimized');

  // Remove thumbnail-related columns
  pgm.dropColumn('documents', 'thumbnail_generated_at');
  pgm.dropColumn('documents', 'thumbnail_path');
};
