/**
 * Keyset Pagination Utilities
 *
 * Provides cursor-based pagination for efficient large dataset navigation.
 * Cursors are encoded as base64 JSON containing the sort field value and record ID.
 */

/**
 * Cursor data structure
 */
export interface CursorData {
  /** Value of the sort field at the cursor position */
  value: string | number | Date | null;
  /** Record ID for tie-breaking */
  id: string;
}

/**
 * Keyset pagination options
 */
export interface KeysetPaginationOptions {
  /** Number of records to fetch */
  limit?: number;
  /** Cursor for the next page (from previous response) */
  cursor?: string;
  /** Sort field name */
  sortBy?: string;
  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Keyset pagination result
 */
export interface KeysetPaginationResult<T> {
  /** Retrieved items */
  items: T[];
  /** Cursor for fetching the next page (null if no more data) */
  nextCursor: string | null;
  /** Whether there are more items after this page */
  hasMore: boolean;
  /** Total count (optional, only if requested) */
  total?: number;
}

/**
 * Encode cursor data to a URL-safe string
 */
export function encodeCursor(data: CursorData): string {
  const json = JSON.stringify({
    v: data.value instanceof Date ? data.value.toISOString() : data.value,
    id: data.id,
  });
  return Buffer.from(json).toString('base64url');
}

/**
 * Decode cursor string back to cursor data
 */
export function decodeCursor(cursor: string): CursorData | null {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf-8');
    const parsed = JSON.parse(json);
    return {
      value: parsed.v,
      id: parsed.id,
    };
  } catch {
    return null;
  }
}

/**
 * Build WHERE clause conditions for keyset pagination
 *
 * @param sortField - The database column to sort by
 * @param sortOrder - asc or desc
 * @param cursor - Decoded cursor data
 * @param startParamIndex - Starting parameter index for query placeholders
 * @returns Object with conditions string and values array
 */
export function buildKeysetConditions(
  sortField: string,
  sortOrder: 'asc' | 'desc',
  cursor: CursorData,
  startParamIndex: number
): { conditions: string; values: (string | number | Date | null)[] } {
  const operator = sortOrder === 'desc' ? '<' : '>';
  const values: (string | number | Date | null)[] = [];

  // Handle NULL values in sort field
  if (cursor.value === null) {
    // For NULL values, we use ID-only comparison
    // NULLs sort last in PostgreSQL by default
    const conditions = `(id ${operator} $${startParamIndex})`;
    values.push(cursor.id);
    return { conditions, values };
  }

  // Standard keyset pagination: (sort_field, id) comparison
  // This handles ties in the sort field by using ID as secondary sort
  const conditions = `(
    (${sortField} ${operator} $${startParamIndex})
    OR (${sortField} = $${startParamIndex} AND id ${operator} $${startParamIndex + 1})
  )`;

  values.push(cursor.value, cursor.id);
  return { conditions, values };
}

/**
 * Generate cursor from the last item in a result set
 */
export function generateNextCursor<T extends { id: string }>(
  items: T[],
  sortField: keyof T,
  hasMore: boolean
): string | null {
  if (!hasMore || items.length === 0) {
    return null;
  }

  const lastItem = items[items.length - 1];
  if (!lastItem) {
    return null;
  }

  const value = lastItem[sortField];

  return encodeCursor({
    value: value instanceof Date ? value : (value as string | number | null),
    id: lastItem.id,
  });
}

/**
 * Validate pagination parameters
 */
export function validatePaginationParams(
  limit: number | undefined,
  maxLimit: number = 100,
  defaultLimit: number = 20
): number {
  if (limit === undefined || limit <= 0) {
    return defaultLimit;
  }
  return Math.min(limit, maxLimit);
}
