import React, { useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Button from './Button';
import { useUploadDocument } from '@/hooks/useDocuments';
import { useToast } from '@/hooks/useToast';

/**
 * Document upload component with drag-and-drop
 */

const uploadSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255, 'Title too long'),
});

type UploadFormData = z.infer<typeof uploadSchema>;

interface DocumentUploadProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export const DocumentUpload: React.FC<DocumentUploadProps> = ({ onSuccess, onCancel }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const uploadMutation = useUploadDocument();
  const toast = useToast();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UploadFormData>({
    resolver: zodResolver(uploadSchema),
  });

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type === 'application/pdf') {
      setFile(droppedFile);
    } else {
      toast.error('Please upload a PDF file');
    }
  }, [toast]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type === 'application/pdf') {
        setFile(selectedFile);
      } else {
        toast.error('Please upload a PDF file');
      }
    }
  };

  const onSubmit = async (data: UploadFormData) => {
    if (!file) {
      toast.error('Please select a file');
      return;
    }

    try {
      await uploadMutation.mutateAsync({
        file,
        data: {
          title: data.title,
        },
      });

      onSuccess?.();
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to upload document');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
          Document Title
        </label>
        <input
          {...register('title')}
          type="text"
          placeholder="Enter document title"
          style={{
            width: '100%',
            padding: '0.5rem',
            border: '1px solid #ccc',
            borderRadius: '4px',
            fontSize: '1rem',
          }}
        />
        {errors.title && (
          <div style={{ color: '#dc3545', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            {errors.title.message}
          </div>
        )}
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
          PDF File
        </label>

        <div
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{
            border: `2px dashed ${isDragging ? '#007bff' : '#ccc'}`,
            borderRadius: '8px',
            padding: '2rem',
            textAlign: 'center',
            backgroundColor: isDragging ? '#f0f8ff' : '#f8f9fa',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onClick={() => document.getElementById('file-input')?.click()}
        >
          <input
            id="file-input"
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />

          {file ? (
            <div>
              <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>📄</div>
              <div style={{ fontWeight: '500', marginBottom: '0.25rem' }}>{file.name}</div>
              <div style={{ fontSize: '0.875rem', color: '#666' }}>
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </div>
              <Button
                type="button"
                variant="secondary"
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                }}
                style={{ marginTop: '1rem' }}
              >
                Remove
              </Button>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>📤</div>
              <div style={{ marginBottom: '0.5rem' }}>
                <strong>Click to upload</strong> or drag and drop
              </div>
              <div style={{ fontSize: '0.875rem', color: '#666' }}>
                PDF files only (Max 10MB)
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          variant="primary"
          loading={uploadMutation.isPending}
          disabled={!file}
        >
          Upload
        </Button>
      </div>
    </form>
  );
};

export default DocumentUpload;
