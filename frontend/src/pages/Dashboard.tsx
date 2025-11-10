import React from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import Button from '@/components/Button';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import apiClient from '@/api/client';
import type { Document } from '@/types';

interface DashboardStats {
  total_documents: number;
  pending_documents: number;
  completed_documents: number;
  total_templates: number;
}

/**
 * Dashboard page - main page after login with statistics and recent activity
 */

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();

  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats'],
    enabled: isAuthenticated && !isLoading,
    queryFn: async () => {
      const [docsResponse, templatesResponse] = await Promise.all([
        apiClient.get('/documents?limit=100'),
        apiClient.get('/templates?limit=100'),
      ]);

      const documents = docsResponse.data.documents || [];
      const templates = templatesResponse.data.items || [];

      return {
        total_documents: documents.length,
        pending_documents: documents.filter((d: Document) => d.status === 'pending').length,
        completed_documents: documents.filter((d: Document) => d.status === 'completed').length,
        total_templates: templates.length,
      };
    },
  });

  const { data: recentDocs = [] } = useQuery<Document[]>({
    queryKey: ['recent-documents'],
    enabled: isAuthenticated && !isLoading,
    queryFn: async () => {
      const response = await apiClient.get('/documents?limit=5&sort_by=created_at&sort_order=desc');
      return response.data.documents || [];
    },
  });

  return (
    <Layout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-neutral mb-2">Dashboard</h1>
          <p className="text-base-content/60">Welcome back! Here's an overview of your documents</p>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8">
          <div className="card-docuseal hover:shadow-lg group cursor-pointer">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                <svg
                  className="w-6 h-6 text-accent"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
            </div>
            <div className="text-sm font-medium text-base-content/60 mb-1">Total Documents</div>
            <div className="text-3xl font-bold text-neutral">{stats?.total_documents || 0}</div>
          </div>

          <div className="card-docuseal hover:shadow-lg group cursor-pointer">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-secondary/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                <svg
                  className="w-6 h-6 text-secondary"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
            </div>
            <div className="text-sm font-medium text-base-content/60 mb-1">Pending Signatures</div>
            <div className="text-3xl font-bold text-neutral">{stats?.pending_documents || 0}</div>
          </div>

          <div className="card-docuseal hover:shadow-lg group cursor-pointer">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                <svg
                  className="w-6 h-6 text-success"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
            </div>
            <div className="text-sm font-medium text-base-content/60 mb-1">Completed</div>
            <div className="text-3xl font-bold text-neutral">{stats?.completed_documents || 0}</div>
          </div>

          <div className="card-docuseal hover:shadow-lg group cursor-pointer">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-neutral/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                <svg
                  className="w-6 h-6 text-neutral"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
                  />
                </svg>
              </div>
            </div>
            <div className="text-sm font-medium text-base-content/60 mb-1">Templates</div>
            <div className="text-3xl font-bold text-neutral">{stats?.total_templates || 0}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Recent Activity */}
          <div className="lg:col-span-2 card-docuseal">
            <h2 className="text-xl font-semibold text-neutral mb-6">Recent Documents</h2>
            {recentDocs.length === 0 ? (
              <div className="text-center py-12">
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
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <p className="text-base-content/60 mb-4 text-lg">No documents yet</p>
                <Button onClick={() => navigate('/documents')}>Upload Your First Document</Button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {recentDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="p-4 border border-base-300/50 rounded-xl hover:bg-base-200/40 hover:border-base-300 transition-all duration-200 cursor-pointer group"
                    onClick={() => {
                      if (doc.status === 'draft') {
                        navigate(`/documents/${doc.id}/prepare`);
                      } else {
                        navigate('/documents');
                      }
                    }}
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-neutral mb-1 group-hover:text-neutral/80 transition-colors truncate">
                          {doc.title}
                        </div>
                        <div className="text-sm text-base-content/60 flex items-center gap-2">
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                          </svg>
                          {new Date(doc.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <span
                        className={`
                        px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ml-4
                        ${doc.status === 'completed' ? 'bg-success/15 text-success' : ''}
                        ${doc.status === 'pending' ? 'bg-secondary/15 text-secondary' : ''}
                        ${doc.status === 'draft' ? 'bg-accent/15 text-accent' : ''}
                      `}
                      >
                        {doc.status.charAt(0).toUpperCase() + doc.status.slice(1)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="card-docuseal">
            <h2 className="text-xl font-semibold text-neutral mb-6">Quick Actions</h2>
            <div className="flex flex-col gap-3">
              <Button
                onClick={() => navigate('/documents')}
                fullWidth
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                    />
                  </svg>
                }
              >
                Upload Document
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate('/templates')}
                fullWidth
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
                    />
                  </svg>
                }
              >
                Browse Templates
              </Button>
              <Button
                variant="ghost"
                onClick={() => navigate('/settings')}
                fullWidth
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                }
              >
                Settings
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;
