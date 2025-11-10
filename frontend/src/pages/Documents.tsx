import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import Table, { type TableColumn } from '@/components/Table';
import Button from '@/components/Button';
import Modal from '@/components/Modal';
import { useDocuments, useDeleteDocument, useDownloadDocument } from '@/hooks/useDocuments';
import { useToast } from '@/hooks/useToast';
import type { Document } from '@/types';
import DocumentUpload from '@/components/DocumentUpload';

/**
 * Documents page with list and management
 */

export const Documents: React.FC = () => {
  const navigate = useNavigate();
  const [currentPage, setCurrentPage] = useState(1);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<string | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  const { data, isLoading, refetch } = useDocuments({
    page: currentPage,
    limit: 10,
    sort_by: 'created_at',
    sort_order: 'desc',
    status: statusFilter ? (statusFilter as 'draft' | 'pending' | 'completed' | 'cancelled') : undefined,
  });

  const deleteMutation = useDeleteDocument();
  const downloadMutation = useDownloadDocument();
  const toast = useToast();

  const handleDelete = async () => {
    if (!documentToDelete) return;

    try {
      await deleteMutation.mutateAsync(documentToDelete);
      toast.success('Document deleted successfully');
      setDocumentToDelete(null);
      refetch();
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to delete document');
    }
  };

  const handleDownload = async (id: string) => {
    try {
      await downloadMutation.mutateAsync(id);
      toast.success('Document downloaded');
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to download document');
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft: 'bg-base-300 text-base-content',
      pending: 'bg-secondary/20 text-secondary',
      completed: 'bg-success/20 text-success',
      cancelled: 'bg-error/20 text-error',
    };

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${styles[status] || styles.draft}`}>
        {status.toUpperCase()}
      </span>
    );
  };

  // Filter documents by search query
  const filteredDocuments = (data?.documents || []).filter((doc) =>
    doc.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const columns: TableColumn<Document>[] = [
    {
      key: 'title',
      label: 'Title',
      render: (value) => <strong>{value}</strong>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (value) => getStatusBadge(value),
    },
    {
      key: 'page_count',
      label: 'Pages',
    },
    {
      key: 'created_at',
      label: 'Created',
      render: (value) => new Date(value).toLocaleDateString(),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <div className="flex gap-2">
          {row.status === 'draft' && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => navigate(`/documents/${row.id}/prepare`)}
            >
              Prepare
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSelectedDocument(row)}
          >
            View
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleDownload(row.id)}
            disabled={downloadMutation.isPending}
          >
            Download
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => setDocumentToDelete(row.id)}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <Layout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-neutral mb-2">Documents</h1>
            <p className="text-base-content/60">Manage and organize your documents</p>
          </div>
          <Button
            onClick={() => setIsUploadModalOpen(true)}
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            }
          >
            Upload Document
          </Button>
        </div>

        {/* Search and Filter Controls */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6 p-4 sm:p-5 bg-base-100 rounded-xl border border-base-300/50 shadow-sm">
          <div className="flex-1">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-base-content/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search documents by title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-docuseal pl-10"
              />
            </div>
          </div>
          <div className="w-full sm:min-w-[200px]">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="select-docuseal"
            >
              <option value="">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          {(searchQuery || statusFilter) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('');
                setCurrentPage(1);
              }}
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              }
            >
              Clear
            </Button>
          )}
        </div>

        <Table
          columns={columns}
          data={filteredDocuments}
          loading={isLoading}
          emptyMessage="No documents yet. Upload your first document to get started."
          pagination={data?.pagination ? {
            currentPage,
            totalPages: data.pagination.total_pages,
            pageSize: data.pagination.limit,
            totalItems: data.pagination.total,
            onPageChange: setCurrentPage,
          } : undefined}
        />

        {/* Upload Modal */}
        <Modal
          isOpen={isUploadModalOpen}
          onClose={() => setIsUploadModalOpen(false)}
          title="Upload Document"
          width="600px"
        >
          <DocumentUpload
            onSuccess={() => {
              setIsUploadModalOpen(false);
              refetch();
              toast.success('Document uploaded successfully');
            }}
            onCancel={() => setIsUploadModalOpen(false)}
          />
        </Modal>

        {/* Delete Confirmation Modal */}
        <Modal
          isOpen={!!documentToDelete}
          onClose={() => setDocumentToDelete(null)}
          title="Delete Document"
        >
          <p className="text-base-content/80 mb-6">
            Are you sure you want to delete this document? This action cannot be undone.
          </p>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setDocumentToDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDelete}
              loading={deleteMutation.isPending}
            >
              Delete
            </Button>
          </div>
        </Modal>

        {/* Document Detail View Modal */}
        <Modal
          isOpen={!!selectedDocument}
          onClose={() => setSelectedDocument(null)}
          title="Document Details"
          width="600px"
        >
          {selectedDocument && (
            <div className="flex flex-col gap-4">
              <div>
                <div className="text-sm font-semibold text-base-content/60 mb-1">
                  Title
                </div>
                <div className="text-base text-neutral">{selectedDocument.title}</div>
              </div>

              <div>
                <div className="text-sm font-semibold text-base-content/60 mb-1">
                  Status
                </div>
                <div>{getStatusBadge(selectedDocument.status)}</div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-semibold text-base-content/60 mb-1">
                    Pages
                  </div>
                  <div className="text-base">{selectedDocument.page_count}</div>
                </div>

                <div>
                  <div className="text-sm font-semibold text-base-content/60 mb-1">
                    File Size
                  </div>
                  <div className="text-base">
                    {(selectedDocument.file_size / 1024 / 1024).toFixed(2)} MB
                  </div>
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold text-base-content/60 mb-1">
                  Original Filename
                </div>
                <div className="text-sm text-base-content/60">{selectedDocument.original_filename}</div>
              </div>

              <div>
                <div className="text-sm font-semibold text-base-content/60 mb-1">
                  Workflow Type
                </div>
                <div className="text-base capitalize">
                  {selectedDocument.workflow_type}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-semibold text-base-content/60 mb-1">
                    Created
                  </div>
                  <div className="text-sm">
                    {new Date(selectedDocument.created_at).toLocaleString()}
                  </div>
                </div>

                <div>
                  <div className="text-sm font-semibold text-base-content/60 mb-1">
                    Updated
                  </div>
                  <div className="text-sm">
                    {new Date(selectedDocument.updated_at).toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-4 pt-4 border-t border-base-300">
                {selectedDocument.status === 'draft' && (
                  <Button
                    variant="primary"
                    onClick={() => {
                      setSelectedDocument(null);
                      navigate(`/documents/${selectedDocument.id}/prepare`);
                    }}
                    fullWidth
                  >
                    Prepare Document
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedDocument(null);
                    handleDownload(selectedDocument.id);
                  }}
                  fullWidth
                >
                  Download
                </Button>
              </div>
            </div>
          )}
        </Modal>
      </div>
    </Layout>
  );
};

export default Documents;
