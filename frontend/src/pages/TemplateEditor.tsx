import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import Layout from '@/components/Layout';
import PdfViewer from '@/components/PdfViewer';
import FieldPalette from '@/components/FieldPalette';
import DraggableField from '@/components/DraggableField';
import FieldProperties from '@/components/FieldProperties';
import Button from '@/components/Button';
import ConfirmModal from '@/components/ConfirmModal';
import { useTemplate, useUpdateTemplate } from '@/hooks/useTemplates';
import { useFields, useCreateField, useUpdateField, useDeleteField } from '@/hooks/useFields';
import { useToast } from '@/hooks/useToast';
import templateService from '@/services/templateService';
import type { Field, FieldType } from '@/types';

/**
 * Template editor page for editing template fields
 */
export const TemplateEditor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string>('');
  const [zoom, setZoom] = useState(1);
  const [showFieldProperties, setShowFieldProperties] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isLoading?: boolean;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    isLoading: false,
  });

  const { data: template } = useTemplate(id!);
  const { data: fields = [], refetch: refetchFields } = useFields(id!);
  const updateTemplateMutation = useUpdateTemplate();
  const createFieldMutation = useCreateField();
  const updateFieldMutation = useUpdateField();
  const deleteFieldMutation = useDeleteField();

  useEffect(() => {
    if (template) {
      setTemplateName(template.name);
      setTemplateDescription(template.description || '');
      const url = templateService.getThumbnailUrl(id!);
      const token = localStorage.getItem('access_token');
      setPdfUrl(`${url}?token=${token}`);
    }
  }, [template, id]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, delta } = event;
    const fieldData = active.data.current;

    if (!fieldData || !id) return;

    if (fieldData.isNew) {
      try {
        await createFieldMutation.mutateAsync({
          documentId: id,
          data: {
            type: fieldData.type as FieldType,
            page: currentPage,
            x: Math.max(0, delta.x),
            y: Math.max(0, delta.y),
            width: 200,
            height: 50,
            required: false,
          },
        });
        refetchFields();
        toast.success('Field added');
      } catch (error: any) {
        toast.error(error.response?.data?.error?.message || 'Failed to add field');
      }
    } else {
      const field = fieldData as Field;
      try {
        await updateFieldMutation.mutateAsync({
          documentId: id,
          fieldId: field.id,
          data: {
            x: field.x + delta.x,
            y: field.y + delta.y,
          },
        });
        refetchFields();
      } catch (error: any) {
        toast.error(error.response?.data?.error?.message || 'Failed to update field');
      }
    }
  };

  const handleUpdateFieldProperty = async (fieldId: string, updates: Partial<Field>) => {
    if (!id) return;
    try {
      await updateFieldMutation.mutateAsync({
        documentId: id,
        fieldId,
        data: updates,
      });
      refetchFields();
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to update field');
    }
  };

  const handleResizeField = async (fieldId: string, width: number, height: number) => {
    await handleUpdateFieldProperty(fieldId, { width, height });
  };

  const executeDeleteField = async (fieldId: string) => {
    if (!id) return;
    setConfirmModal(prev => ({ ...prev, isLoading: true }));
    try {
      await deleteFieldMutation.mutateAsync({ documentId: id, fieldId });
      refetchFields();
      setSelectedFieldId(null);
      setShowFieldProperties(false);
      toast.success('Field deleted');
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to delete field');
    } finally {
      setConfirmModal(prev => ({ ...prev, isOpen: false, isLoading: false }));
    }
  };

  const handleDeleteField = (fieldId: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Field',
      message: 'Are you sure you want to delete this field?',
      onConfirm: () => executeDeleteField(fieldId),
      isLoading: false,
    });
  };

  const handleUpdateTemplateInfo = async () => {
    if (!id || !templateName.trim()) {
      toast.error('Template name is required');
      return;
    }

    try {
      await updateTemplateMutation.mutateAsync({
        id,
        data: {
          name: templateName,
          description: templateDescription || undefined,
        },
      });
      toast.success('Template updated');
      setIsEditingInfo(false);
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to update template');
    }
  };

  if (!template) {
    return (
      <Layout>
        <div style={{ padding: '2rem' }}>Loading...</div>
      </Layout>
    );
  }

  const currentPageFields = fields.filter((f) => f.page === currentPage);
  const selectedField = selectedFieldId ? fields.find((f) => f.id === selectedFieldId) || null : null;

  return (
    <Layout>
      <div style={{ padding: '2rem' }}>
        <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1>Edit Template: {template.name}</h1>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <Button variant="secondary" onClick={() => navigate('/templates')}>
              Back to Templates
            </Button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: showFieldProperties ? '250px 1fr 300px 300px' : '250px 1fr 300px', gap: '2rem' }}>
          <div>
            <FieldPalette />
          </div>

          <DndContext onDragEnd={handleDragEnd}>
            <div>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center' }}>
                <Button
                  size="sm"
                  onClick={() => setZoom(Math.max(0.5, zoom - 0.1))}
                  disabled={zoom <= 0.5}
                >
                  -
                </Button>
                <span style={{ minWidth: '60px', textAlign: 'center', fontSize: '0.875rem' }}>
                  {Math.round(zoom * 100)}%
                </span>
                <Button
                  size="sm"
                  onClick={() => setZoom(Math.min(2, zoom + 0.1))}
                  disabled={zoom >= 2}
                >
                  +
                </Button>
                <Button
                  size="sm"
                  onClick={() => setZoom(1)}
                  variant="secondary"
                >
                  Reset
                </Button>
              </div>

              <PdfViewer
                fileUrl={pdfUrl}
                currentPage={currentPage}
                onPageChange={setCurrentPage}
                onLoadSuccess={setNumPages}
                width={600 * zoom}
              >
                {() => (
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      pointerEvents: 'none',
                    }}
                  >
                    {currentPageFields.map((field) => (
                      <div key={field.id} style={{ pointerEvents: 'auto' }}>
                        <DraggableField
                          field={field}
                          scale={zoom}
                          isSelected={selectedFieldId === field.id}
                          onClick={() => {
                            setSelectedFieldId(field.id);
                            setShowFieldProperties(true);
                          }}
                          onDelete={() => handleDeleteField(field.id)}
                          onResize={(width, height) => handleResizeField(field.id, width, height)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </PdfViewer>
            </div>
            <DragOverlay />
          </DndContext>

          <div>
            <div style={{ padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #dee2e6' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '600' }}>Template Info</h3>
                {!isEditingInfo && (
                  <Button size="sm" onClick={() => setIsEditingInfo(true)}>
                    Edit
                  </Button>
                )}
              </div>

              {isEditingInfo ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.875rem' }}>
                      Name
                    </label>
                    <input
                      type="text"
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #ccc',
                        borderRadius: '4px',
                        fontSize: '0.875rem',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.875rem' }}>
                      Description
                    </label>
                    <textarea
                      value={templateDescription}
                      onChange={(e) => setTemplateDescription(e.target.value)}
                      rows={3}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #ccc',
                        borderRadius: '4px',
                        fontSize: '0.875rem',
                        fontFamily: 'inherit',
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={handleUpdateTemplateInfo}
                      loading={updateTemplateMutation.isPending}
                    >
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setTemplateName(template.name);
                        setTemplateDescription(template.description || '');
                        setIsEditingInfo(false);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: '0.875rem' }}>
                  <div style={{ marginBottom: '0.5rem' }}>
                    <strong>Name:</strong> {template.name}
                  </div>
                  {template.description && (
                    <div>
                      <strong>Description:</strong> {template.description}
                    </div>
                  )}
                </div>
              )}

              <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: '#e7f3ff', borderRadius: '4px', fontSize: '0.75rem', color: '#666' }}>
                <strong>Fields:</strong> {fields.length}
                <br />
                <strong>Pages:</strong> {numPages}
              </div>
            </div>
          </div>

          {showFieldProperties && (
            <div>
              <FieldProperties
                field={selectedField}
                fields={fields}
                signers={[]}
                onUpdate={(updates) => selectedFieldId && handleUpdateFieldProperty(selectedFieldId, updates)}
                onDelete={() => selectedFieldId && handleDeleteField(selectedFieldId)}
                onClose={() => {
                  setShowFieldProperties(false);
                  setSelectedFieldId(null);
                }}
              />
            </div>
          )}
        </div>

        {/* Confirm Modal for destructive actions */}
        <ConfirmModal
          isOpen={confirmModal.isOpen}
          onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
          onConfirm={confirmModal.onConfirm}
          title={confirmModal.title}
          message={confirmModal.message}
          confirmText="Delete"
          variant="danger"
          isLoading={confirmModal.isLoading}
        />
      </div>
    </Layout>
  );
};

export default TemplateEditor;
