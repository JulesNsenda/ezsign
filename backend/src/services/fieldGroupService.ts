import { Pool } from 'pg';
import {
  FieldGroup,
  CreateFieldGroupData,
  UpdateFieldGroupData,
  FieldGroupData,
} from '@/models/FieldGroup';

export class FieldGroupService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Create a new field group
   */
  async createGroup(data: CreateFieldGroupData): Promise<FieldGroup> {
    // Validate create data
    const validation = FieldGroup.validateCreateData(data);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    // Get max sort_order for this document to auto-assign if not provided
    const maxOrderResult = await this.pool.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM field_groups WHERE document_id = $1',
      [data.document_id]
    );
    const sortOrder = data.sort_order ?? maxOrderResult.rows[0].next_order;

    // Insert group into database
    const result = await this.pool.query(
      `INSERT INTO field_groups (document_id, name, description, sort_order, collapsed, color)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        data.document_id,
        data.name.trim(),
        data.description ?? null,
        sortOrder,
        data.collapsed ?? false,
        data.color ?? null,
      ]
    );

    return new FieldGroup(this.mapRowToData(result.rows[0]));
  }

  /**
   * Get all groups for a document
   */
  async getGroupsByDocumentId(documentId: string): Promise<FieldGroup[]> {
    const result = await this.pool.query(
      'SELECT * FROM field_groups WHERE document_id = $1 ORDER BY sort_order ASC',
      [documentId]
    );
    return result.rows.map((row) => new FieldGroup(this.mapRowToData(row)));
  }

  /**
   * Get a single group by ID
   */
  async getGroupById(groupId: string): Promise<FieldGroup | null> {
    const result = await this.pool.query(
      'SELECT * FROM field_groups WHERE id = $1',
      [groupId]
    );
    if (result.rows.length === 0) {
      return null;
    }
    return new FieldGroup(this.mapRowToData(result.rows[0]));
  }

  /**
   * Update a group
   */
  async updateGroup(
    groupId: string,
    data: UpdateFieldGroupData
  ): Promise<FieldGroup> {
    const existing = await this.getGroupById(groupId);
    if (!existing) {
      throw new Error('Field group not found');
    }

    // Validate update data
    const validation = FieldGroup.validateUpdateData(data);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    // Build update query
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(data.name.trim());
    }
    if (data.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(data.description);
    }
    if (data.sort_order !== undefined) {
      updates.push(`sort_order = $${paramIndex++}`);
      values.push(data.sort_order);
    }
    if (data.collapsed !== undefined) {
      updates.push(`collapsed = $${paramIndex++}`);
      values.push(data.collapsed);
    }
    if (data.color !== undefined) {
      updates.push(`color = $${paramIndex++}`);
      values.push(data.color);
    }

    if (updates.length === 0) {
      return existing;
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(groupId);

    const result = await this.pool.query(
      `UPDATE field_groups SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    return new FieldGroup(this.mapRowToData(result.rows[0]));
  }

  /**
   * Delete a group (fields become ungrouped via SET NULL)
   */
  async deleteGroup(groupId: string): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM field_groups WHERE id = $1',
      [groupId]
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  /**
   * Reorder groups within a document
   */
  async reorderGroups(documentId: string, groupIds: string[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (let i = 0; i < groupIds.length; i++) {
        await client.query(
          'UPDATE field_groups SET sort_order = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND document_id = $3',
          [i, groupIds[i], documentId]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Assign fields to a group (or ungroup if groupId is null)
   */
  async assignFieldsToGroup(
    groupId: string | null,
    fieldIds: string[]
  ): Promise<void> {
    if (fieldIds.length === 0) {
      return;
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (let i = 0; i < fieldIds.length; i++) {
        await client.query(
          'UPDATE fields SET group_id = $1, group_sort_order = $2 WHERE id = $3',
          [groupId, groupId ? i : null, fieldIds[i]]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Reorder fields within a group
   */
  async reorderFieldsInGroup(
    groupId: string,
    fieldIds: string[]
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (let i = 0; i < fieldIds.length; i++) {
        await client.query(
          'UPDATE fields SET group_sort_order = $1 WHERE id = $2 AND group_id = $3',
          [i, fieldIds[i], groupId]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get field count for each group in a document
   */
  async getGroupFieldCounts(
    documentId: string
  ): Promise<Map<string | null, number>> {
    const result = await this.pool.query(
      `SELECT group_id, COUNT(*) as count
       FROM fields
       WHERE document_id = $1
       GROUP BY group_id`,
      [documentId]
    );

    const counts = new Map<string | null, number>();
    for (const row of result.rows) {
      counts.set(row.group_id, parseInt(row.count, 10));
    }
    return counts;
  }

  /**
   * Get groups with field counts for a document
   */
  async getGroupsWithFieldCounts(documentId: string): Promise<
    Array<{
      group: FieldGroup;
      fieldCount: number;
    }>
  > {
    const groups = await this.getGroupsByDocumentId(documentId);
    const counts = await this.getGroupFieldCounts(documentId);

    return groups.map((group) => ({
      group,
      fieldCount: counts.get(group.id) || 0,
    }));
  }

  /**
   * Check if a group name already exists for a document
   */
  async isGroupNameTaken(
    documentId: string,
    name: string,
    excludeGroupId?: string
  ): Promise<boolean> {
    const query = excludeGroupId
      ? 'SELECT COUNT(*) as count FROM field_groups WHERE document_id = $1 AND LOWER(name) = LOWER($2) AND id != $3'
      : 'SELECT COUNT(*) as count FROM field_groups WHERE document_id = $1 AND LOWER(name) = LOWER($2)';

    const params = excludeGroupId
      ? [documentId, name.trim(), excludeGroupId]
      : [documentId, name.trim()];

    const result = await this.pool.query(query, params);
    return parseInt(result.rows[0].count, 10) > 0;
  }

  /**
   * Map database row to FieldGroupData
   */
  private mapRowToData(row: Record<string, any>): FieldGroupData {
    return {
      id: row.id,
      document_id: row.document_id,
      name: row.name,
      description: row.description,
      sort_order: row.sort_order,
      collapsed: row.collapsed,
      color: row.color,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
