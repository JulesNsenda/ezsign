import React, { useState } from 'react';
import type { FieldGroup, Field } from '@/types';
import Button from './Button';
import GroupEditor from './GroupEditor';

export interface GroupPanelProps {
  documentId: string;
  groups: FieldGroup[];
  fields: Field[];
  isLoading?: boolean;
  onCreateGroup: (data: { name: string; description?: string; color?: string }) => void;
  onUpdateGroup: (groupId: string, data: { name?: string; description?: string; color?: string; collapsed?: boolean }) => void;
  onDeleteGroup: (groupId: string) => void;
  onAssignFieldToGroup: (fieldId: string, groupId: string | null) => void;
}

/**
 * Panel for managing field groups/sections
 */
const GroupPanel: React.FC<GroupPanelProps> = ({
  groups,
  fields,
  isLoading,
  onCreateGroup,
  onUpdateGroup,
  onDeleteGroup,
  onAssignFieldToGroup,
}) => {
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<FieldGroup | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Count fields per group
  const getFieldCount = (groupId: string | null) => {
    return fields.filter((f) => f.group_id === groupId).length;
  };

  // Get fields for a group
  const getFieldsForGroup = (groupId: string | null) => {
    return fields
      .filter((f) => f.group_id === groupId)
      .sort((a, b) => (a.group_sort_order ?? 0) - (b.group_sort_order ?? 0));
  };

  const toggleGroupExpanded = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const handleEditGroup = (group: FieldGroup) => {
    setEditingGroup(group);
    setIsEditorOpen(true);
  };

  const handleCreateNew = () => {
    setEditingGroup(null);
    setIsEditorOpen(true);
  };

  const handleSave = (data: { name: string; description?: string; color?: string }) => {
    if (editingGroup) {
      onUpdateGroup(editingGroup.id, data);
    } else {
      onCreateGroup(data);
    }
    setIsEditorOpen(false);
    setEditingGroup(null);
  };

  const ungroupedFieldCount = getFieldCount(null);

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-base-300 p-5">
        <div className="animate-pulse">
          <div className="h-4 bg-base-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            <div className="h-10 bg-base-200 rounded"></div>
            <div className="h-10 bg-base-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-base-300 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-neutral flex items-center gap-2">
          <span className="text-lg">📁</span>
          Field Groups
        </h3>
        <Button variant="primary" size="sm" onClick={handleCreateNew}>
          + New
        </Button>
      </div>

      <div className="space-y-2">
        {/* Ungrouped fields section */}
        <div className="border border-base-200 rounded-lg overflow-hidden">
          <div
            className="flex items-center justify-between px-3 py-2 bg-base-100 cursor-pointer hover:bg-base-200 transition-colors"
            onClick={() => toggleGroupExpanded('ungrouped')}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm">{expandedGroups.has('ungrouped') ? '▼' : '▶'}</span>
              <span className="font-medium text-sm text-base-content/70">Ungrouped</span>
              <span className="text-xs bg-base-200 px-2 py-0.5 rounded-full text-base-content/60">
                {ungroupedFieldCount}
              </span>
            </div>
          </div>
          {expandedGroups.has('ungrouped') && ungroupedFieldCount > 0 && (
            <div className="px-3 py-2 bg-base-50 border-t border-base-200">
              <div className="space-y-1">
                {getFieldsForGroup(null).map((field) => (
                  <div
                    key={field.id}
                    className="flex items-center justify-between text-xs py-1 px-2 bg-white rounded border border-base-200"
                  >
                    <span className="capitalize">{field.type}</span>
                    {groups.length > 0 && (
                      <select
                        className="text-xs border border-base-300 rounded px-1 py-0.5"
                        value=""
                        onChange={(e) => onAssignFieldToGroup(field.id, e.target.value || null)}
                      >
                        <option value="">Move to...</option>
                        {groups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Group sections */}
        {groups.map((group) => {
          const fieldCount = getFieldCount(group.id);
          const groupFields = getFieldsForGroup(group.id);
          const isExpanded = expandedGroups.has(group.id);

          return (
            <div key={group.id} className="border border-base-200 rounded-lg overflow-hidden">
              <div
                className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-base-100 transition-colors"
                style={{ backgroundColor: group.color ? `${group.color}15` : undefined }}
              >
                <div
                  className="flex items-center gap-2 flex-1"
                  onClick={() => toggleGroupExpanded(group.id)}
                >
                  <span className="text-sm">{isExpanded ? '▼' : '▶'}</span>
                  {group.color && (
                    <span
                      className="w-3 h-3 rounded-full border border-base-300"
                      style={{ backgroundColor: group.color }}
                    />
                  )}
                  <span className="font-medium text-sm">{group.name}</span>
                  <span className="text-xs bg-base-200 px-2 py-0.5 rounded-full text-base-content/60">
                    {fieldCount}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditGroup(group);
                    }}
                    className="p-1 text-base-content/50 hover:text-base-content transition-colors"
                    title="Edit group"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete group "${group.name}"? Fields will be ungrouped.`)) {
                        onDeleteGroup(group.id);
                      }
                    }}
                    className="p-1 text-base-content/50 hover:text-error transition-colors"
                    title="Delete group"
                  >
                    🗑️
                  </button>
                </div>
              </div>
              {isExpanded && (
                <div className="px-3 py-2 bg-base-50 border-t border-base-200">
                  {group.description && (
                    <p className="text-xs text-base-content/60 mb-2">{group.description}</p>
                  )}
                  {fieldCount === 0 ? (
                    <p className="text-xs text-base-content/50 italic">No fields in this group</p>
                  ) : (
                    <div className="space-y-1">
                      {groupFields.map((field) => (
                        <div
                          key={field.id}
                          className="flex items-center justify-between text-xs py-1 px-2 bg-white rounded border border-base-200"
                        >
                          <span className="capitalize">{field.type}</span>
                          <button
                            onClick={() => onAssignFieldToGroup(field.id, null)}
                            className="text-base-content/50 hover:text-base-content transition-colors"
                            title="Remove from group"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {groups.length === 0 && (
          <div className="text-center py-6">
            <div className="text-3xl mb-2 opacity-40">📁</div>
            <p className="text-sm text-base-content/60">No groups yet</p>
            <p className="text-xs text-base-content/50 mt-1">
              Create groups to organize your fields
            </p>
          </div>
        )}
      </div>

      {/* Group Editor Modal */}
      {isEditorOpen && (
        <GroupEditor
          group={editingGroup}
          onSave={handleSave}
          onClose={() => {
            setIsEditorOpen(false);
            setEditingGroup(null);
          }}
        />
      )}
    </div>
  );
};

export default GroupPanel;
