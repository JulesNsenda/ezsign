import React from 'react';
import Button from './Button';

/**
 * Professional table component with pagination and modern styling
 */

export interface TableColumn<T = any> {
  key: string;
  label: string;
  render?: (value: any, row: T) => React.ReactNode;
}

export interface TableProps<T = any> {
  columns: TableColumn<T>[];
  data: T[];
  keyField?: string;
  pagination?: {
    currentPage: number;
    totalPages: number;
    pageSize: number;
    totalItems: number;
    onPageChange: (page: number) => void;
  };
  loading?: boolean;
  emptyMessage?: string;
}

export const Table = <T extends Record<string, any>>({
  columns,
  data,
  keyField = 'id',
  pagination,
  loading = false,
  emptyMessage = 'No data available',
}: TableProps<T>) => {
  if (loading) {
    return (
      <div className="bg-base-100 rounded-xl shadow-sm border border-base-300/50 p-12 text-center">
        <div className="flex items-center justify-center gap-3">
          <svg
            className="animate-spin h-6 w-6 text-neutral"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span className="text-base-content/70 font-medium">Loading...</span>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-base-100 rounded-xl shadow-sm border border-base-300/50 p-12 text-center">
        <svg
          className="w-16 h-16 mx-auto mb-4 text-base-content/20"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
          />
        </svg>
        <p className="text-base-content/60 text-lg">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="bg-base-100 rounded-xl shadow-sm border border-base-300/50 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-base-200/50 border-b border-base-300">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className="px-6 py-4 text-left text-xs font-semibold text-base-content/70 uppercase tracking-wider"
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-base-300/50">
            {data.map((row, rowIndex) => (
              <tr
                key={row[keyField] || rowIndex}
                className="hover:bg-base-200/30 transition-colors duration-150"
              >
                {columns.map((column) => (
                  <td
                    key={`${row[keyField]}-${column.key}`}
                    className="px-6 py-4 text-sm text-base-content"
                  >
                    {column.render ? column.render(row[column.key], row) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination && (
        <div className="px-6 py-4 border-t border-base-300/50 bg-base-100 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="text-sm text-base-content/60">
            Showing{' '}
            <span className="font-medium text-base-content">
              {(pagination.currentPage - 1) * pagination.pageSize + 1}
            </span>{' '}
            to{' '}
            <span className="font-medium text-base-content">
              {Math.min(pagination.currentPage * pagination.pageSize, pagination.totalItems)}
            </span>{' '}
            of <span className="font-medium text-base-content">{pagination.totalItems}</span> items
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={pagination.currentPage === 1}
              onClick={() => pagination.onPageChange(pagination.currentPage - 1)}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Previous
            </Button>

            <div className="hidden sm:flex items-center gap-1">
              {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                .filter((page) => {
                  // Show first, last, current, and adjacent pages
                  return (
                    page === 1 ||
                    page === pagination.totalPages ||
                    Math.abs(page - pagination.currentPage) <= 1
                  );
                })
                .map((page, index, array) => {
                  // Add ellipsis if there's a gap
                  const showEllipsisBefore = index > 0 && page - array[index - 1]! > 1;

                  return (
                    <React.Fragment key={page}>
                      {showEllipsisBefore && <span className="px-2 text-base-content/40">...</span>}
                      <Button
                        size="sm"
                        variant={page === pagination.currentPage ? 'primary' : 'ghost'}
                        onClick={() => pagination.onPageChange(page)}
                      >
                        {page}
                      </Button>
                    </React.Fragment>
                  );
                })}
            </div>

            <Button
              size="sm"
              variant="ghost"
              disabled={pagination.currentPage === pagination.totalPages}
              onClick={() => pagination.onPageChange(pagination.currentPage + 1)}
            >
              Next
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Table;
