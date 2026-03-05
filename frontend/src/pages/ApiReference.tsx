import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import PublicNavbar from '@/components/PublicNavbar';

/**
 * Public API reference page for developers
 */

interface Endpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  description: string;
  auth: boolean;
  body?: string;
}

interface EndpointGroup {
  id: string;
  title: string;
  description: string;
  endpoints: Endpoint[];
}

const methodColors: Record<string, string> = {
  GET: 'bg-success/15 text-success',
  POST: 'bg-info/15 text-info',
  PUT: 'bg-warning/15 text-warning',
  DELETE: 'bg-error/15 text-error',
};

const apiGroups: EndpointGroup[] = [
  {
    id: 'auth',
    title: 'Authentication',
    description: 'Register, login, and manage user sessions.',
    endpoints: [
      { method: 'POST', path: '/api/auth/register', description: 'Register a new user', auth: false, body: '{ email, password }' },
      { method: 'POST', path: '/api/auth/login', description: 'Login with email and password', auth: false, body: '{ email, password }' },
      { method: 'POST', path: '/api/auth/verify-email', description: 'Verify email with token', auth: false, body: '{ token }' },
      { method: 'POST', path: '/api/auth/verify-2fa', description: 'Complete login with 2FA code', auth: false, body: '{ twoFactorToken, code }' },
      { method: 'POST', path: '/api/auth/refresh', description: 'Refresh access token', auth: false, body: '{ refreshToken }' },
      { method: 'GET', path: '/api/auth/me', description: 'Get current user profile', auth: true },
      { method: 'POST', path: '/api/auth/change-password', description: 'Change password', auth: true, body: '{ currentPassword, newPassword }' },
      { method: 'POST', path: '/api/auth/forgot-password', description: 'Request password reset email', auth: false, body: '{ email }' },
      { method: 'POST', path: '/api/auth/reset-password', description: 'Reset password with token', auth: false, body: '{ token, password }' },
      { method: 'POST', path: '/api/auth/logout', description: 'Logout (blacklist token)', auth: false },
      { method: 'POST', path: '/api/auth/logout-all', description: 'Logout from all devices', auth: true },
    ],
  },
  {
    id: 'documents',
    title: 'Documents',
    description: 'Upload, manage, and send documents for signing.',
    endpoints: [
      { method: 'POST', path: '/api/documents', description: 'Upload a new document (multipart/form-data)', auth: true },
      { method: 'GET', path: '/api/documents', description: 'List documents with pagination', auth: true },
      { method: 'GET', path: '/api/documents/cursor', description: 'List documents with cursor pagination', auth: true },
      { method: 'GET', path: '/api/documents/:id', description: 'Get a single document', auth: true },
      { method: 'GET', path: '/api/documents/:id/metadata', description: 'Get document metadata', auth: true },
      { method: 'GET', path: '/api/documents/:id/download', description: 'Download the document PDF', auth: true },
      { method: 'GET', path: '/api/documents/:id/thumbnail', description: 'Get document thumbnail', auth: true },
      { method: 'PUT', path: '/api/documents/:id', description: 'Update document details', auth: true, body: '{ title?, status?, team_id? }' },
      { method: 'DELETE', path: '/api/documents/:id', description: 'Delete a document', auth: true },
      { method: 'POST', path: '/api/documents/:id/send', description: 'Send document for signing', auth: true, body: '{ message? }' },
      { method: 'GET', path: '/api/documents/:id/status', description: 'Get signing status', auth: true },
    ],
  },
  {
    id: 'fields',
    title: 'Fields',
    description: 'Manage signature and form fields on documents.',
    endpoints: [
      { method: 'GET', path: '/api/documents/:id/fields', description: 'Get all fields on a document', auth: true },
      { method: 'POST', path: '/api/documents/:id/fields', description: 'Create a field', auth: true, body: '{ type, page, x, y, width, height, required?, signer_email? }' },
      { method: 'GET', path: '/api/documents/:id/fields/:fieldId', description: 'Get a single field', auth: true },
      { method: 'PUT', path: '/api/documents/:id/fields/:fieldId', description: 'Update a field', auth: true, body: '{ x?, y?, width?, height?, required?, ... }' },
      { method: 'DELETE', path: '/api/documents/:id/fields/:fieldId', description: 'Delete a field', auth: true },
      { method: 'POST', path: '/api/documents/:id/fields/bulk', description: 'Bulk create/update fields', auth: true, body: '{ fields: [...] }' },
      { method: 'GET', path: '/api/documents/:id/fields/validate', description: 'Validate all fields', auth: true },
    ],
  },
  {
    id: 'signers',
    title: 'Signers',
    description: 'Manage document signers and assign fields.',
    endpoints: [
      { method: 'GET', path: '/api/documents/:id/signers', description: 'Get all signers', auth: true },
      { method: 'POST', path: '/api/documents/:id/signers', description: 'Add a signer', auth: true, body: '{ email, name?, order? }' },
      { method: 'GET', path: '/api/documents/:id/signers/:signerId', description: 'Get a single signer', auth: true },
      { method: 'PUT', path: '/api/documents/:id/signers/:signerId', description: 'Update a signer', auth: true, body: '{ email?, name?, order? }' },
      { method: 'DELETE', path: '/api/documents/:id/signers/:signerId', description: 'Remove a signer', auth: true },
      { method: 'POST', path: '/api/documents/:id/signers/:signerId/assign-fields', description: 'Assign fields to a signer', auth: true, body: '{ fieldIds: [...] }' },
      { method: 'POST', path: '/api/documents/:id/signers/:signerId/resend', description: 'Resend signing invitation email', auth: true },
      { method: 'GET', path: '/api/documents/:id/signers/validate', description: 'Validate signers configuration', auth: true },
    ],
  },
  {
    id: 'signing',
    title: 'Public Signing',
    description: 'Endpoints used by signers via their unique token link. No authentication required.',
    endpoints: [
      { method: 'GET', path: '/api/signing/:token', description: 'Get document for signing', auth: false },
      { method: 'GET', path: '/api/signing/:token/download', description: 'Download document via signing link', auth: false },
      { method: 'POST', path: '/api/signing/:token/sign', description: 'Submit a signature', auth: false, body: '{ fieldId, signature, signatureType }' },
    ],
  },
  {
    id: 'templates',
    title: 'Templates',
    description: 'Create reusable templates from documents.',
    endpoints: [
      { method: 'GET', path: '/api/templates', description: 'List templates', auth: true },
      { method: 'POST', path: '/api/templates', description: 'Create template from a document', auth: true, body: '{ document_id, name, description?, team_id? }' },
      { method: 'GET', path: '/api/templates/:id', description: 'Get a single template with fields', auth: true },
      { method: 'PUT', path: '/api/templates/:id', description: 'Update template', auth: true, body: '{ name?, description?, team_id? }' },
      { method: 'DELETE', path: '/api/templates/:id', description: 'Delete a template', auth: true },
      { method: 'POST', path: '/api/templates/:id/documents', description: 'Create a document from a template', auth: true, body: '{ title, team_id?, workflow_type? }' },
    ],
  },
  {
    id: 'teams',
    title: 'Teams',
    description: 'Create and manage teams for collaboration.',
    endpoints: [
      { method: 'GET', path: '/api/teams', description: 'List your teams', auth: true },
      { method: 'POST', path: '/api/teams', description: 'Create a team', auth: true, body: '{ name }' },
      { method: 'GET', path: '/api/teams/:id', description: 'Get team details', auth: true },
      { method: 'PUT', path: '/api/teams/:id', description: 'Update team', auth: true, body: '{ name? }' },
      { method: 'DELETE', path: '/api/teams/:id', description: 'Delete team (owner only)', auth: true },
      { method: 'GET', path: '/api/teams/:id/members', description: 'Get team members', auth: true },
      { method: 'POST', path: '/api/teams/:id/members', description: 'Add a team member', auth: true, body: '{ email, role }' },
      { method: 'PUT', path: '/api/teams/:id/members/:userId', description: 'Update member role', auth: true, body: '{ role }' },
      { method: 'DELETE', path: '/api/teams/:id/members/:userId', description: 'Remove a member', auth: true },
    ],
  },
  {
    id: 'invitations',
    title: 'Invitations',
    description: 'Invite users to join your team.',
    endpoints: [
      { method: 'GET', path: '/api/teams/:teamId/invitations', description: 'List team invitations', auth: true },
      { method: 'POST', path: '/api/teams/:teamId/invitations', description: 'Create an invitation', auth: true, body: '{ email, role }' },
      { method: 'DELETE', path: '/api/teams/:teamId/invitations/:id', description: 'Cancel an invitation', auth: true },
      { method: 'POST', path: '/api/teams/:teamId/invitations/:id/resend', description: 'Resend invitation email', auth: true },
      { method: 'GET', path: '/api/invitations/:token', description: 'Get invitation by token', auth: false },
      { method: 'POST', path: '/api/invitations/:token/accept', description: 'Accept invitation', auth: true },
      { method: 'GET', path: '/api/invitations', description: 'Get your pending invitations', auth: true },
    ],
  },
  {
    id: 'webhooks',
    title: 'Webhooks',
    description: 'Receive real-time notifications when events occur.',
    endpoints: [
      { method: 'GET', path: '/api/webhooks', description: 'List webhooks', auth: true },
      { method: 'POST', path: '/api/webhooks', description: 'Create a webhook', auth: true, body: '{ url, events: [...], secret? }' },
      { method: 'GET', path: '/api/webhooks/:id', description: 'Get a webhook', auth: true },
      { method: 'PUT', path: '/api/webhooks/:id', description: 'Update a webhook', auth: true, body: '{ url?, events?, active? }' },
      { method: 'DELETE', path: '/api/webhooks/:id', description: 'Delete a webhook', auth: true },
    ],
  },
  {
    id: 'api-keys',
    title: 'API Keys',
    description: 'Create and manage API keys for programmatic access.',
    endpoints: [
      { method: 'GET', path: '/api/api-keys', description: 'List API keys', auth: true },
      { method: 'POST', path: '/api/api-keys', description: 'Create an API key', auth: true, body: '{ name, scopes: [...] }' },
      { method: 'GET', path: '/api/api-keys/:id', description: 'Get an API key', auth: true },
      { method: 'PUT', path: '/api/api-keys/:id', description: 'Update an API key', auth: true, body: '{ name?, scopes? }' },
      { method: 'DELETE', path: '/api/api-keys/:id', description: 'Revoke an API key', auth: true },
      { method: 'GET', path: '/api/api-keys/scopes', description: 'List available scopes', auth: true },
    ],
  },
];

const EndpointRow: React.FC<{ endpoint: Endpoint }> = ({ endpoint }) => (
  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 py-3 border-b border-base-300/30 last:border-0">
    <div className="flex items-center gap-3 sm:w-auto">
      <span className={`text-xs font-bold px-2 py-1 rounded ${methodColors[endpoint.method]} w-16 text-center`}>
        {endpoint.method}
      </span>
      <code className="text-sm font-mono text-neutral">{endpoint.path}</code>
    </div>
    <div className="flex-1 sm:text-right">
      <span className="text-sm text-base-content/60">{endpoint.description}</span>
      {endpoint.auth && (
        <span className="ml-2 text-xs bg-warning/15 text-warning px-1.5 py-0.5 rounded" title="Authentication required">
          auth
        </span>
      )}
    </div>
    {endpoint.body && (
      <div className="sm:hidden mt-1">
        <code className="text-xs text-base-content/40 bg-base-200 px-2 py-1 rounded">{endpoint.body}</code>
      </div>
    )}
  </div>
);

export const ApiReference: React.FC = () => {
  const [expandedBodies, setExpandedBodies] = useState<Set<string>>(new Set());

  const toggleBody = (path: string) => {
    setExpandedBodies((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-base-100">
      <PublicNavbar />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold text-neutral mb-4">API Reference</h1>
          <p className="text-lg text-base-content/60 mb-4">
            Integrate EzSign into your application using the REST API.
          </p>
          <div className="text-sm text-base-content/50">
            New to EzSign? Start with the{' '}
            <Link to="/docs" className="text-info hover:underline font-medium">user guide</Link>.
          </div>
        </div>

        {/* Authentication info */}
        <div className="bg-base-200/50 rounded-xl border border-base-300/50 p-6 mb-12">
          <h2 className="text-lg font-semibold text-neutral mb-3">Authentication</h2>
          <p className="text-sm text-base-content/70 mb-4">
            Most endpoints require authentication. Include your token in the request header:
          </p>
          <div className="bg-neutral/5 rounded-lg p-4 font-mono text-sm overflow-x-auto">
            <span className="text-base-content/50">Authorization:</span>{' '}
            <span className="text-info">Bearer</span>{' '}
            <span className="text-base-content/70">{'<your-access-token>'}</span>
          </div>
          <p className="text-sm text-base-content/70 mt-4">
            Or use an API key:
          </p>
          <div className="bg-neutral/5 rounded-lg p-4 font-mono text-sm overflow-x-auto">
            <span className="text-base-content/50">X-API-Key:</span>{' '}
            <span className="text-base-content/70">{'<your-api-key>'}</span>
          </div>
          <p className="text-sm text-base-content/50 mt-3">
            Get an access token via <code className="bg-base-200 px-1 rounded">POST /api/auth/login</code> or create an API key in Settings.
          </p>
        </div>

        {/* Table of Contents */}
        <nav className="mb-12 bg-base-200/50 rounded-xl border border-base-300/50 p-6">
          <h2 className="text-sm font-semibold text-neutral uppercase tracking-wider mb-3">Endpoints</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {apiGroups.map((group) => (
              <a
                key={group.id}
                href={`#${group.id}`}
                className="text-sm text-base-content/60 hover:text-neutral transition-colors"
              >
                {group.title}
                <span className="text-base-content/30 ml-1">({group.endpoints.length})</span>
              </a>
            ))}
          </div>
        </nav>

        {/* Endpoint Groups */}
        <div className="space-y-12">
          {apiGroups.map((group) => (
            <section key={group.id} id={group.id}>
              <h2 className="text-2xl font-bold text-neutral mb-2">{group.title}</h2>
              <p className="text-base-content/60 mb-4">{group.description}</p>
              <div className="bg-base-100 rounded-xl border border-base-300/50 px-4 sm:px-6">
                {group.endpoints.map((endpoint) => (
                  <div key={`${endpoint.method}-${endpoint.path}`}>
                    <div
                      className={`${endpoint.body ? 'cursor-pointer hover:bg-base-200/30' : ''} -mx-4 sm:-mx-6 px-4 sm:px-6`}
                      onClick={() => endpoint.body && toggleBody(`${endpoint.method}-${endpoint.path}`)}
                    >
                      <EndpointRow endpoint={endpoint} />
                    </div>
                    {endpoint.body && expandedBodies.has(`${endpoint.method}-${endpoint.path}`) && (
                      <div className="pb-3 -mt-1">
                        <div className="bg-neutral/5 rounded-lg p-3 font-mono text-xs text-base-content/60 overflow-x-auto">
                          {endpoint.body}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Base URL note */}
        <div className="mt-12 bg-base-200/50 rounded-xl border border-base-300/50 p-6">
          <h3 className="text-lg font-semibold text-neutral mb-2">Base URL</h3>
          <p className="text-sm text-base-content/70 mb-3">
            All endpoints are relative to your EzSign instance:
          </p>
          <div className="bg-neutral/5 rounded-lg p-4 font-mono text-sm">
            <span className="text-info">https://</span>
            <span className="text-base-content/70">your-domain.com</span>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-base-300/50 text-center text-sm text-base-content/50">
          <p>
            <Link to="/docs" className="text-info hover:underline">User Guide</Link>
            {' | '}
            <Link to="/contact" className="text-info hover:underline">Contact</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default ApiReference;
