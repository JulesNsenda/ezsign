import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import Button from '@/components/Button';
import Modal from '@/components/Modal';
import ConfirmModal from '@/components/ConfirmModal';
import {
  useTemplates,
  useDeleteTemplate,
  useCreateDocumentFromTemplate,
} from '@/hooks/useTemplates';
import { useToast } from '@/hooks/useToast';
import type { Template } from '@/types';
import templateService from '@/services/templateService';

/**
 * Templates page with grid view and management
 */

export const Templates: React.FC = () => {
  const navigate = useNavigate();
  const [currentPage, setCurrentPage] = useState(1);
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [newDocumentTitle, setNewDocumentTitle] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const { data, isLoading, refetch } = useTemplates({
    page: currentPage,
    limit: 12,
    sort_by: 'created_at',
    sort_order: 'desc',
  });

  const deleteMutation = useDeleteTemplate();
  const createDocumentMutation = useCreateDocumentFromTemplate();
  const toast = useToast();

  const handleDelete = async () => {
    if (!templateToDelete) return;

    try {
      await deleteMutation.mutateAsync(templateToDelete);
      toast.success('Template deleted successfully');
      setTemplateToDelete(null);
      refetch();
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to delete template');
    }
  };

  const handleCreateDocument = async () => {
    if (!selectedTemplate || !newDocumentTitle.trim()) {
      toast.error('Please enter a document title');
      return;
    }

    try {
      const doc = await createDocumentMutation.mutateAsync({
        templateId: selectedTemplate.id,
        title: newDocumentTitle,
      });
      toast.success('Document created from template');
      setSelectedTemplate(null);
      setNewDocumentTitle('');
      navigate(`/documents/${doc.id}/prepare`);
    } catch (error: any) {
      toast.error(
        error.response?.data?.error?.message || 'Failed to create document from template'
      );
    }
  };

  // Filter templates by search query
  const filteredTemplates = (data?.items || []).filter((template) =>
    template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (template.description && template.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <Layout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-neutral mb-2">Templates</h1>
            <p className="text-base-content/60">Create reusable templates from your prepared documents</p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="mb-6 p-4 sm:p-5 bg-base-100 rounded-xl border border-base-300/50 shadow-sm">
          <div className="relative max-w-md">
            <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-base-content/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search templates by name or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-docuseal pl-10"
            />
          </div>
        </div>

        {/* Loading State */}
        {isLoading ? (
          <div className="text-center py-16">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-neutral mb-4"></div>
            <p className="text-base-content/60">Loading templates...</p>
          </div>
        ) : !data?.items || data.items.length === 0 ? (
          /* Empty State */
          <div className="card-docuseal text-center py-16">
            <svg className="w-20 h-20 mx-auto mb-4 text-base-content/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
            </svg>
            <h3 className="text-xl font-semibold text-neutral mb-2">No templates yet</h3>
            <p className="text-base-content/60 mb-6 max-w-md mx-auto">
              Create templates from your documents to reuse them quickly
            </p>
            <Button onClick={() => navigate('/documents')}>
              Go to Documents
            </Button>
          </div>
        ) : filteredTemplates.length === 0 ? (
          /* No Results State */
          <div className="card-docuseal text-center py-16">
            <svg className="w-20 h-20 mx-auto mb-4 text-base-content/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <h3 className="text-xl font-semibold text-neutral mb-2">No templates found</h3>
            <p className="text-base-content/60 mb-6 max-w-md mx-auto">
              Try adjusting your search query
            </p>
            <Button variant="outline" onClick={() => setSearchQuery('')}>
              Clear Search
            </Button>
          </div>
        ) : (
          <>
            {/* Template Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6 mb-8">
              {filteredTemplates.map((template) => (
                <div
                  key={template.id}
                  className="card-docuseal hover:shadow-lg group overflow-hidden transition-all duration-200 cursor-pointer"
                >
                  {/* Thumbnail */}
                  <div className="h-48 bg-base-200 flex items-center justify-center border-b border-base-300/50 overflow-hidden">
                    <img
                      src={templateService.getThumbnailUrl(template.id)}
                      alt={template.name}
                      className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-200"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        const parent = e.currentTarget.parentElement;
                        if (parent) {
                          parent.innerHTML = '<svg class="w-16 h-16 text-base-content/20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>';
                        }
                      }}
                    />
                  </div>

                  {/* Content */}
                  <div className="p-4">
                    <h3 className="text-base font-semibold text-neutral mb-2 line-clamp-1">
                      {template.name}
                    </h3>
                    {template.description && (
                      <p className="text-sm text-base-content/60 mb-3 line-clamp-2 min-h-[40px]">
                        {template.description}
                      </p>
                    )}
                    <div className="text-xs text-base-content/50 mb-4 flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      {new Date(template.created_at).toLocaleDateString()}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => setSelectedTemplate(template)}
                        fullWidth
                      >
                        Use Template
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => setTemplateToDelete(template.id)}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {data.pagination && data.pagination.total_pages > 1 && (
              <div className="flex justify-center items-center gap-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage <= 1}
                >
                  Previous
                </Button>
                <span className="text-sm text-base-content/70 font-medium">
                  Page {currentPage} of {data.pagination.total_pages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage >= data.pagination.total_pages}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}

        {/* Use Template Modal */}
        <Modal
          isOpen={!!selectedTemplate}
          onClose={() => {
            setSelectedTemplate(null);
            setNewDocumentTitle('');
          }}
          title="Create Document from Template"
        >
          {selectedTemplate && (
            <div>
              <p className="text-base-content/80 mb-4">
                Creating a new document from template: <strong className="text-neutral">{selectedTemplate.name}</strong>
              </p>
              <div className="mb-6">
                <label className="block text-sm font-semibold text-neutral mb-2">
                  Document Title
                </label>
                <input
                  type="text"
                  value={newDocumentTitle}
                  onChange={(e) => setNewDocumentTitle(e.target.value)}
                  placeholder="Enter document title"
                  className="input-docuseal"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleCreateDocument();
                    }
                  }}
                  autoFocus
                />
              </div>
              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedTemplate(null);
                    setNewDocumentTitle('');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleCreateDocument}
                  loading={createDocumentMutation.isPending}
                >
                  Create Document
                </Button>
              </div>
            </div>
          )}
        </Modal>

        {/* Delete Confirmation Modal */}
        <ConfirmModal
          isOpen={!!templateToDelete}
          onClose={() => setTemplateToDelete(null)}
          onConfirm={handleDelete}
          title="Delete Template"
          message="Are you sure you want to delete this template? This action cannot be undone."
          confirmText="Delete"
          variant="danger"
          isLoading={deleteMutation.isPending}
        />
      </div>
    </Layout>
  );
};

export default Templates;
