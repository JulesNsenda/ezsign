import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import Layout from '@/components/Layout';
import PdfViewer from '@/components/PdfViewer';
import FieldPalette from '@/components/FieldPalette';
import DraggableField from '@/components/DraggableField';
import FieldProperties from '@/components/FieldProperties';
import Button from '@/components/Button';
import Modal from '@/components/Modal';
import { useDocument } from '@/hooks/useDocuments';
import { useFields, useCreateField, useUpdateField, useDeleteField } from '@/hooks/useFields';
import { useSigners, useCreateSigner, useDeleteSigner, useSendDocument } from '@/hooks/useSigners';
import { useCreateTemplate } from '@/hooks/useTemplates';
import { useToast } from '@/hooks/useToast';
import type { Field, FieldType, Signer } from '@/types';

/**
 * Document preparation page with field placement and signer management
 */

export const PrepareDocument: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'signers' | 'properties'>('signers');
  const [activeDragItem, setActiveDragItem] = useState<{
    id: string;
    type: FieldType;
    isNew: boolean;
  } | null>(null);
  const [isSignerModalOpen, setIsSignerModalOpen] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [newSignerEmail, setNewSignerEmail] = useState('');
  const [newSignerName, setNewSignerName] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [zoom, setZoom] = useState(1);
  const [showMobileFieldPalette, setShowMobileFieldPalette] = useState(false);
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  const { data: doc } = useDocument(id!);
  const { data: fields = [], refetch: refetchFields } = useFields(id!);
  const { data: signers = [], refetch: refetchSigners } = useSigners(id!);

  const createFieldMutation = useCreateField();
  const updateFieldMutation = useUpdateField();
  const deleteFieldMutation = useDeleteField();
  const createSignerMutation = useCreateSigner();
  const deleteSignerMutation = useDeleteSigner();
  const sendDocumentMutation = useSendDocument();
  const createTemplateMutation = useCreateTemplate();

  // Configure drag sensors to allow clicks before drag activation
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px movement before drag activates
      },
    }),
  );

  // Memoize PDF URL to prevent unnecessary reloads
  const pdfUrl = useMemo(() => {
    if (!id) return '';
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    const token = localStorage.getItem('access_token');
    return `${baseUrl}/api/documents/${id}/download?token=${token}`;
  }, [id]);

  // Memoize selected field
  const selectedField = useMemo(
    () => (selectedFieldId ? fields.find((f) => f.id === selectedFieldId) || null : null),
    [selectedFieldId, fields],
  );

  // Memoize PDF width calculation to prevent re-renders
  const pdfWidth = useMemo(() => {
    if (typeof window === 'undefined') return 600 * zoom;

    const screenWidth = window.innerWidth;
    if (screenWidth < 640) return Math.min(600 * zoom, screenWidth - 80);
    if (screenWidth < 768) return Math.min(600 * zoom, screenWidth - 100);
    if (screenWidth < 1024) return Math.min(600 * zoom, screenWidth - 140);
    return 600 * zoom;
  }, [zoom]);

  // Auto-switch to properties tab when field is selected
  useEffect(() => {
    if (selectedFieldId) {
      setActiveTab('properties');
    } else if (activeTab === 'properties') {
      setActiveTab('signers');
    }
  }, [selectedFieldId]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore keyboard shortcuts when typing in input fields
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          setCurrentPage(Math.max(1, currentPage - 1));
          break;
        case 'ArrowRight':
          e.preventDefault();
          setCurrentPage(Math.min(numPages, currentPage + 1));
          break;
        case '+':
        case '=':
          e.preventDefault();
          setZoom(Math.min(2, zoom + 0.1));
          break;
        case '-':
        case '_':
          e.preventDefault();
          setZoom(Math.max(0.5, zoom - 0.1));
          break;
        case 'Escape':
          e.preventDefault();
          setSelectedFieldId(null);
          setIsSignerModalOpen(false);
          setIsTemplateModalOpen(false);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, numPages, zoom]);

  // Signer colors for visual consistency
  const signerColors = useMemo(() => ['#3B82F6', '#10B981', '#F59E0B', '#EF4444'], []);

  // Get field color based on assigned signer (memoized to prevent re-renders)
  const getFieldColor = useCallback(
    (field: Field) => {
      if (!field.signer_email) return '#6B7280'; // Gray for unassigned
      const signerIndex = signers.findIndex((s) => s.email === field.signer_email);
      return signerIndex >= 0 ? signerColors[signerIndex % signerColors.length] : '#6B7280';
    },
    [signers, signerColors],
  );

  // Drag handlers
  const handleDragStart = (event: DragStartEvent) => {
    const fieldData = event.active.data.current;
    if (fieldData) {
      setActiveDragItem({
        id: event.active.id as string,
        type: fieldData.type as FieldType,
        isNew: !!fieldData.isNew,
      });
    }
  };

  const handleDragCancel = () => setActiveDragItem(null);

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDragItem(null);
    const { active, delta, over } = event;
    const fieldData = active.data.current;

    if (!fieldData || !id) return;

    // Check if dropped over the PDF container
    if (!over || over.id !== 'pdf-drop-zone') return;

    // Check if this is a new field from palette
    if (fieldData.isNew) {
      // Get the PDF container's bounding rect
      const pdfContainer = pdfContainerRef.current;
      if (!pdfContainer) return;

      const rect = pdfContainer.getBoundingClientRect();
      const dropX = event.activatorEvent
        ? (event.activatorEvent as MouseEvent).clientX - rect.left
        : delta.x;
      const dropY = event.activatorEvent
        ? (event.activatorEvent as MouseEvent).clientY - rect.top
        : delta.y;

      // Convert to PDF coordinates (accounting for zoom)
      const x = Math.max(0, (dropX + delta.x) / zoom);
      const y = Math.max(0, (dropY + delta.y) / zoom);

      try {
        // Auto-assign to signer if there's only one
        const signerEmail = signers.length === 1 ? signers[0].email : undefined;

        await createFieldMutation.mutateAsync({
          documentId: id,
          data: {
            type: fieldData.type as FieldType,
            page: currentPage - 1, // Convert from 1-indexed to 0-indexed
            x,
            y,
            width: 200,
            height: 50,
            required: false,
            signer_email: signerEmail,
          },
        });
        refetchFields();
        toast.success('Field added');
      } catch (error: any) {
        toast.error(
          error.response?.data?.error || error.response?.data?.message || 'Failed to add field',
        );
      }
    } else {
      // Update existing field position
      const field = fieldData as Field;
      try {
        await updateFieldMutation.mutateAsync({
          documentId: id,
          fieldId: field.id,
          data: {
            x: field.x + delta.x / zoom,
            y: field.y + delta.y / zoom,
          },
        });
        refetchFields();
      } catch (error: any) {
        toast.error(error.response?.data?.error?.message || 'Failed to update field');
      }
    }
  };

  const handleDeleteField = async (fieldId: string) => {
    if (!id) return;
    try {
      await deleteFieldMutation.mutateAsync({ documentId: id, fieldId });
      refetchFields();
      setSelectedFieldId(null);
      setShowFieldProperties(false);
      toast.success('Field deleted');
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to delete field');
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
      await refetchFields();
      if (updates.signer_email !== undefined) {
        toast.success('Field assigned successfully');
      }
    } catch (error: any) {
      console.error('Field update error:', error);
      toast.error(
        error.response?.data?.error?.message ||
          error.response?.data?.error ||
          'Failed to update field',
      );
    }
  };

  const handleResizeField = async (fieldId: string, width: number, height: number) => {
    await handleUpdateFieldProperty(fieldId, { width, height });
  };

  const handleAddSigner = async () => {
    if (!id || !newSignerEmail || !newSignerName) {
      toast.error('Please provide email and name');
      return;
    }

    try {
      await createSignerMutation.mutateAsync({
        documentId: id,
        data: {
          email: newSignerEmail,
          name: newSignerName,
          signing_order: signers.length + 1,
        },
      });
      refetchSigners();
      setIsSignerModalOpen(false);
      setNewSignerEmail('');
      setNewSignerName('');
      toast.success('Signer added');
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to add signer');
    }
  };

  const handleDeleteSigner = async (signerId: string) => {
    if (!id) return;
    try {
      await deleteSignerMutation.mutateAsync({ documentId: id, signerId });
      refetchSigners();
      toast.success('Signer removed');
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to remove signer');
    }
  };

  const handleSaveAsTemplate = async () => {
    if (!id || !templateName.trim()) {
      toast.error('Please enter a template name');
      return;
    }
    if (fields.length === 0) {
      toast.error('Please add at least one field before saving as template');
      return;
    }

    try {
      await createTemplateMutation.mutateAsync({
        name: templateName,
        description: templateDescription || undefined,
        document_id: id,
      });
      toast.success('Template created successfully');
      setIsTemplateModalOpen(false);
      setTemplateName('');
      setTemplateDescription('');
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to create template');
    }
  };

  const handleSendDocument = async () => {
    if (!id) return;
    if (fields.length === 0) {
      toast.error('Please add at least one field');
      return;
    }
    if (signers.length === 0) {
      toast.error('Please add at least one signer');
      return;
    }

    try {
      await sendDocumentMutation.mutateAsync(id);
      toast.success('Document sent to signers');
      navigate('/documents');
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to send document');
    }
  };

  // Backend uses 0-indexed pages, frontend uses 1-indexed (must be before early return)
  const currentPageFields = useMemo(
    () => fields.filter((f) => f.page === currentPage - 1),
    [fields, currentPage],
  );

  if (!doc) {
    return (
      <Layout>
        <div className="min-h-screen bg-base-200 flex items-center justify-center">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-secondary mb-4"></div>
            <p className="text-base-content/70">Loading document...</p>
          </div>
        </div>
      </Layout>
    );
  }

  // Droppable PDF container component
  const DroppablePdfContainer: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { setNodeRef } = useDroppable({
      id: 'pdf-drop-zone',
    });

    return (
      <div
        ref={(node) => {
          setNodeRef(node);
          if (node) {
            pdfContainerRef.current = node;
          }
        }}
      >
        {children}
      </div>
    );
  };

  return (
    <Layout>
      <div className="min-h-screen bg-base-200">
        {/* Header Section */}
        <div className="bg-base-100 border-b border-base-300 px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="max-w-[1800px] mx-auto">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold text-neutral mb-1 truncate">
                  Prepare Document
                </h1>
                <p className="text-sm text-base-content/70 truncate">{doc.title}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate('/documents')}
                  className="flex-1 sm:flex-none"
                >
                  Cancel
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsTemplateModalOpen(true)}
                  disabled={fields.length === 0}
                  className="flex-1 sm:flex-none hidden sm:inline-flex"
                >
                  Save Template
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSendDocument}
                  loading={sendDocumentMutation.isPending}
                  disabled={fields.length === 0 || signers.length === 0}
                  className="flex-1 sm:flex-none"
                >
                  Send for Signing
                </Button>
              </div>
            </div>
          </div>
        </div>

        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="w-full mx-auto px-2 sm:px-4 lg:px-6 xl:px-8 py-4 sm:py-6 lg:py-8">
            <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 max-w-[1800px] mx-auto">
              {/* Field Palette - Hidden on mobile, shown on desktop */}
              <div className="hidden lg:block lg:w-[280px] flex-shrink-0">
                <FieldPalette />
              </div>

              {/* PDF Viewer with Fields */}
              <div className="flex flex-col flex-1 min-w-0 order-2 lg:order-none">
                {/* Zoom Controls */}
                <div className="bg-base-100 rounded-xl shadow-sm border border-base-300 p-2 sm:p-3 lg:p-4 mb-3 sm:mb-4 overflow-hidden">
                  <div className="flex flex-col gap-2 sm:gap-3">
                    {/* Zoom Controls */}
                    <div className="flex items-center gap-2 w-full">
                      <span className="text-xs sm:text-sm font-semibold text-neutral flex-shrink-0">
                        Zoom
                      </span>
                      <div className="flex items-center gap-1 sm:gap-2 bg-base-200 rounded-lg p-1 flex-1 min-w-0">
                        <button
                          onClick={() => setZoom(Math.max(0.5, zoom - 0.1))}
                          disabled={zoom <= 0.5}
                          className="w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded-md hover:bg-base-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-semibold text-neutral text-xs sm:text-sm flex-shrink-0"
                        >
                          −
                        </button>
                        <input
                          type="range"
                          min="50"
                          max="200"
                          value={zoom * 100}
                          onChange={(e) => setZoom(Number(e.target.value) / 100)}
                          className="flex-1 min-w-0 h-2 bg-base-300 rounded-lg appearance-none cursor-pointer accent-neutral"
                          style={{
                            background: `linear-gradient(to right, #291334 0%, #291334 ${((zoom * 100 - 50) / 150) * 100}%, #e7e2df ${((zoom * 100 - 50) / 150) * 100}%, #e7e2df 100%)`,
                          }}
                        />
                        <span className="min-w-[40px] sm:min-w-[50px] text-center text-xs sm:text-sm font-medium text-neutral flex-shrink-0">
                          {Math.round(zoom * 100)}%
                        </span>
                        <button
                          onClick={() => setZoom(Math.min(2, zoom + 0.1))}
                          disabled={zoom >= 2}
                          className="w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded-md hover:bg-base-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-semibold text-neutral text-xs sm:text-sm flex-shrink-0"
                        >
                          +
                        </button>
                      </div>
                      <button
                        onClick={() => setZoom(1)}
                        className="hidden md:block px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium text-neutral hover:bg-base-200 rounded-lg transition-colors flex-shrink-0"
                      >
                        Reset
                      </button>
                    </div>

                    {/* Page Navigation */}
                    <div className="flex items-center justify-between gap-2 sm:gap-3 w-full">
                      <span className="text-xs sm:text-sm text-base-content/70 font-medium flex-shrink-0">
                        <span className="hidden xs:inline">Page </span>
                        {currentPage} / {numPages}
                      </span>
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                          disabled={currentPage <= 1}
                          className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg hover:bg-base-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors border border-base-300 text-xs sm:text-sm"
                        >
                          ←
                        </button>
                        <button
                          onClick={() => setCurrentPage(Math.min(numPages, currentPage + 1))}
                          disabled={currentPage >= numPages}
                          className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg hover:bg-base-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors border border-base-300 text-xs sm:text-sm"
                        >
                          →
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* PDF Canvas */}
                <div className="bg-base-100 rounded-xl shadow-sm border border-base-300 p-2 sm:p-3 lg:p-4 overflow-x-auto overflow-y-visible">
                  <div className="flex items-center justify-center w-full min-w-0">
                    <DroppablePdfContainer>
                      <PdfViewer
                        key={id}
                        fileUrl={pdfUrl}
                        currentPage={currentPage}
                        onPageChange={setCurrentPage}
                        onLoadSuccess={setNumPages}
                        width={pdfWidth}
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
                            {currentPageFields.map((field) => {
                              const isSelected = selectedFieldId === field.id;
                              return (
                                <div key={field.id} style={{ pointerEvents: 'auto' }}>
                                  <DraggableField
                                    field={field}
                                    scale={zoom}
                                    isSelected={isSelected}
                                    borderColor={getFieldColor(field)}
                                    onClick={() => setSelectedFieldId(field.id)}
                                    onDelete={() => handleDeleteField(field.id)}
                                    onResize={(width, height) =>
                                      handleResizeField(field.id, width, height)
                                    }
                                  />
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </PdfViewer>
                    </DroppablePdfContainer>
                  </div>
                </div>
              </div>

              {/* Right Panel - Tabbed Interface */}
              <div className="h-fit lg:sticky lg:top-6 order-1 lg:order-none lg:w-[340px] flex-shrink-0 w-full">
                <div className="bg-base-100 rounded-xl shadow-sm border border-base-300">
                  {/* Tab Navigation */}
                  <div className="flex border-b border-base-300">
                    <button
                      className={
                        activeTab === 'signers'
                          ? 'flex-1 text-center py-3 font-semibold text-xs sm:text-sm text-neutral border-b-2 border-neutral'
                          : 'flex-1 text-center py-3 font-semibold text-xs sm:text-sm text-base-content/60 hover:bg-base-200 transition-colors'
                      }
                      onClick={() => setActiveTab('signers')}
                    >
                      Signers ({signers.length})
                    </button>
                    <button
                      className={
                        activeTab === 'properties'
                          ? 'flex-1 text-center py-3 font-semibold text-xs sm:text-sm text-neutral border-b-2 border-neutral'
                          : 'flex-1 text-center py-3 font-semibold text-xs sm:text-sm text-base-content/60 hover:bg-base-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
                      }
                      onClick={() => selectedField && setActiveTab('properties')}
                      disabled={!selectedField}
                    >
                      <span className="hidden sm:inline">Field {selectedField ? '✓' : ''}</span>
                      <span className="sm:hidden">Properties</span>
                    </button>
                  </div>

                  {/* Tab Content */}
                  <div className="p-4 sm:p-5">
                    {activeTab === 'signers' && (
                      <>
                        <div className="flex items-center justify-between mb-3 sm:mb-4">
                          <h3 className="text-sm sm:text-base font-bold text-neutral flex items-center gap-2">
                            <span className="text-base sm:text-lg">✍️</span>
                            <span className="hidden sm:inline">Signers</span>
                          </h3>
                          <button
                            onClick={() => setIsSignerModalOpen(true)}
                            className="px-3 py-1.5 text-xs sm:text-sm font-semibold text-white bg-neutral hover:bg-neutral/90 rounded-full transition-all"
                          >
                            + Add
                          </button>
                        </div>

                        {signers.length === 0 ? (
                          <div className="py-6 sm:py-8 text-center">
                            <div className="text-3xl sm:text-4xl mb-2 sm:mb-3 opacity-40">👤</div>
                            <p className="text-xs sm:text-sm text-base-content/60">
                              No signers added yet
                            </p>
                            <p className="text-xs text-base-content/50 mt-1">
                              Add signers to send document
                            </p>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2 sm:gap-3">
                            {signers.map((signer: Signer, index: number) => (
                              <div
                                key={signer.id}
                                className="group relative p-2.5 sm:p-3.5 bg-base-200 hover:bg-base-300 border border-base-300 rounded-lg sm:rounded-xl transition-all"
                              >
                                <div className="flex items-start gap-2 sm:gap-3">
                                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-neutral/20 to-neutral/30 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-neutral text-xs sm:text-sm">
                                    {signer.name.charAt(0).toUpperCase()}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-semibold text-xs sm:text-sm text-neutral truncate">
                                      {signer.name}
                                    </div>
                                    <div className="text-xs text-base-content/60 truncate">
                                      {signer.email}
                                    </div>
                                    {doc.workflow_type === 'sequential' && (
                                      <div className="mt-1 sm:mt-1.5 inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 bg-accent/10 text-accent text-xs font-medium rounded-full">
                                        #{index + 1}
                                      </div>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => handleDeleteSigner(signer.id)}
                                    className="opacity-0 group-hover:opacity-100 w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded-full hover:bg-error/10 text-error transition-all text-lg"
                                    title="Remove signer"
                                  >
                                    ×
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Summary Stats */}
                        <div className="mt-4 sm:mt-5 pt-3 sm:pt-4 border-t border-base-300">
                          <div className="grid grid-cols-2 gap-2 sm:gap-3">
                            <div className="bg-gradient-to-br from-neutral/5 to-neutral/10 rounded-lg p-2 sm:p-3 border border-base-300">
                              <div className="text-xs text-neutral font-medium mb-1">Fields</div>
                              <div className="text-xl sm:text-2xl font-bold text-neutral">
                                {fields.length}
                              </div>
                            </div>
                            <div className="bg-gradient-to-br from-neutral/5 to-neutral/10 rounded-lg p-2 sm:p-3 border border-base-300">
                              <div className="text-xs text-neutral font-medium mb-1">Pages</div>
                              <div className="text-xl sm:text-2xl font-bold text-neutral">
                                {numPages}
                              </div>
                            </div>
                          </div>
                        </div>
                      </>
                    )}

                    {activeTab === 'properties' && selectedField && (
                      <FieldProperties
                        field={selectedField}
                        signers={signers}
                        onUpdate={(updates) => handleUpdateFieldProperty(selectedField.id, updates)}
                        onDelete={() => handleDeleteField(selectedField.id)}
                        onClose={() => {
                          setSelectedFieldId(null);
                          setActiveTab('signers');
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Drag Overlay */}
          <DragOverlay dropAnimation={null}>
            {activeDragItem?.isNew ? (
              <div className="w-[180px] h-[40px] bg-secondary/80 border-2 border-white text-white font-semibold flex items-center justify-center rounded-lg shadow-xl opacity-75">
                {activeDragItem.type.replace(/_/g, ' ').toUpperCase()}
              </div>
            ) : activeDragItem ? (
              <div className="w-[200px] h-[50px] bg-neutral/20 border-2 border-neutral text-neutral font-semibold flex items-center justify-center rounded-lg shadow-xl opacity-80">
                MOVE FIELD
              </div>
            ) : null}
          </DragOverlay>

          {/* Mobile Field Palette Button */}
          <button
            onClick={() => setShowMobileFieldPalette(true)}
            className="lg:hidden fixed bottom-6 right-6 z-40 w-14 h-14 bg-neutral text-base-100 rounded-full shadow-2xl flex items-center justify-center hover:bg-neutral/90 transition-all animate-fade-in"
            aria-label="Add fields"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
          </button>
        </DndContext>

        {/* Mobile Field Palette Modal */}
        <Modal
          isOpen={showMobileFieldPalette}
          onClose={() => setShowMobileFieldPalette(false)}
          title="Add Fields"
          width="95%"
        >
          <div className="max-h-[60vh] overflow-y-auto">
            <FieldPalette />
          </div>
          <div className="mt-4 pt-4 border-t border-base-300">
            <Button variant="ghost" fullWidth onClick={() => setShowMobileFieldPalette(false)}>
              Close
            </Button>
          </div>
        </Modal>

        {/* Save as Template Modal */}
        <Modal
          isOpen={isTemplateModalOpen}
          onClose={() => {
            setIsTemplateModalOpen(false);
            setTemplateName('');
            setTemplateDescription('');
          }}
          title="Save as Template"
          width="95%"
        >
          <div className="flex flex-col gap-5">
            <div>
              <label className="block text-sm font-semibold text-neutral mb-2">
                Template Name <span className="text-error">*</span>
              </label>
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g., Employment Contract, NDA Template"
                className="input-docuseal"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-neutral mb-2">
                Description{' '}
                <span className="text-xs text-base-content/50 font-normal">(optional)</span>
              </label>
              <textarea
                value={templateDescription}
                onChange={(e) => setTemplateDescription(e.target.value)}
                placeholder="Describe when to use this template..."
                rows={3}
                className="input-docuseal resize-none"
              />
            </div>
            <div className="p-3 sm:p-4 bg-gradient-to-r from-neutral/5 to-neutral/10 border border-base-300 rounded-xl">
              <div className="flex gap-2 sm:gap-3">
                <span className="text-xl sm:text-2xl">📋</span>
                <div className="flex-1">
                  <p className="text-xs sm:text-sm font-medium text-neutral mb-1">
                    What gets saved?
                  </p>
                  <p className="text-xs text-base-content/70 leading-relaxed">
                    This template will include all {fields.length} field
                    {fields.length !== 1 ? 's' : ''} and their positions from this document.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 justify-end pt-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setIsTemplateModalOpen(false);
                  setTemplateName('');
                  setTemplateDescription('');
                }}
                fullWidth
                className="sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleSaveAsTemplate}
                loading={createTemplateMutation.isPending}
                disabled={!templateName.trim()}
                fullWidth
                className="sm:w-auto"
              >
                Save Template
              </Button>
            </div>
          </div>
        </Modal>

        {/* Add Signer Modal */}
        <Modal
          isOpen={isSignerModalOpen}
          onClose={() => {
            setIsSignerModalOpen(false);
            setNewSignerName('');
            setNewSignerEmail('');
          }}
          title="Add Signer"
          width="500px"
        >
          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-semibold text-neutral mb-2">
                Full Name <span className="text-error">*</span>
              </label>
              <input
                type="text"
                value={newSignerName}
                onChange={(e) => setNewSignerName(e.target.value)}
                placeholder="e.g., John Smith"
                className="input-docuseal"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-neutral mb-2">
                Email Address <span className="text-error">*</span>
              </label>
              <input
                type="email"
                value={newSignerEmail}
                onChange={(e) => setNewSignerEmail(e.target.value)}
                placeholder="e.g., john@company.com"
                className="input-docuseal"
              />
              <p className="text-xs text-base-content/60 mt-2">
                Signing invitation will be sent to this email
              </p>
            </div>
            {doc.workflow_type === 'sequential' && signers.length > 0 && (
              <div className="p-3 bg-accent/5 border border-accent/20 rounded-xl">
                <div className="flex gap-2">
                  <span className="text-lg">⚠️</span>
                  <div className="flex-1">
                    <p className="text-xs font-medium text-neutral mb-1">Sequential Signing</p>
                    <p className="text-xs text-base-content/70 leading-relaxed">
                      This signer will be added as #{signers.length + 1} in the signing order.
                    </p>
                  </div>
                </div>
              </div>
            )}
            <div className="flex gap-3 justify-end pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIsSignerModalOpen(false);
                  setNewSignerName('');
                  setNewSignerEmail('');
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleAddSigner}
                loading={createSignerMutation.isPending}
                disabled={!newSignerName.trim() || !newSignerEmail.trim()}
              >
                Add Signer
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </Layout>
  );
};

export default PrepareDocument;
