import React, { useState } from 'react';
import Layout from '@/components/Layout';
import Button from '@/components/Button';
import Modal from '@/components/Modal';
import Card from '@/components/Card';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/useToast';
import apiClient from '@/api/client';

interface ApiKey {
  id: string;
  name: string;
  key?: string;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

interface Webhook {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  created_at: string;
}

interface Team {
  id: string;
  name: string;
  role: string;
}

/**
 * Settings page for user profile, API keys, webhooks, and teams
 */
export const Settings: React.FC = () => {
  const { user, logout } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'apikeys' | 'webhooks' | 'teams'>(
    'profile'
  );

  // Profile
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // API Keys
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [newApiKeyName, setNewApiKeyName] = useState('');
  const [createdApiKey, setCreatedApiKey] = useState<string | null>(null);

  // Webhooks
  const [isWebhookModalOpen, setIsWebhookModalOpen] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookEvents, setWebhookEvents] = useState<string[]>([]);

  const { data: apiKeys = [] } = useQuery<ApiKey[]>({
    queryKey: ['api-keys'],
    queryFn: async () => {
      const response = await apiClient.get('/api-keys');
      return response.data.apiKeys || [];
    },
    enabled: activeTab === 'apikeys',
  });

  const { data: webhooks = [] } = useQuery<Webhook[]>({
    queryKey: ['webhooks'],
    queryFn: async () => {
      // Webhooks endpoint not yet implemented
      return [];
    },
    enabled: false, // Disabled until backend implements webhooks
  });

  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ['teams'],
    queryFn: async () => {
      const response = await apiClient.get('/teams');
      return response.data.teams || [];
    },
    enabled: activeTab === 'teams',
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      const response = await apiClient.post('/auth/change-password', data);
      return response.data;
    },
    onSuccess: () => {
      toast.success('Password changed successfully');
      setIsPasswordModalOpen(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to change password');
    },
  });

  const createApiKeyMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await apiClient.post('/api-keys', { name });
      return response.data;
    },
    onSuccess: (data) => {
      // Backend returns: { message, apiKey, key, warning }
      setCreatedApiKey(data.key);
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast.success('API key created successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to create API key');
    },
  });

  const deleteApiKeyMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/api-keys/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast.success('API key deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to delete API key');
    },
  });

  const createWebhookMutation = useMutation({
    mutationFn: async (data: { url: string; events: string[] }) => {
      const response = await apiClient.post('/webhooks', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      toast.success('Webhook created successfully');
      setIsWebhookModalOpen(false);
      setWebhookUrl('');
      setWebhookEvents([]);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to create webhook');
    },
  });

  const deleteWebhookMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/webhooks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      toast.success('Webhook deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to delete webhook');
    },
  });

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error('Please fill in all fields');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    await changePasswordMutation.mutateAsync({ currentPassword, newPassword });
  };

  const handleCreateApiKey = async () => {
    if (!newApiKeyName.trim()) {
      toast.error('Please enter an API key name');
      return;
    }
    await createApiKeyMutation.mutateAsync(newApiKeyName);
    setNewApiKeyName('');
  };

  const handleCreateWebhook = async () => {
    if (!webhookUrl.trim()) {
      toast.error('Please enter a webhook URL');
      return;
    }
    if (webhookEvents.length === 0) {
      toast.error('Please select at least one event');
      return;
    }
    await createWebhookMutation.mutateAsync({ url: webhookUrl, events: webhookEvents });
  };

  const availableEvents = [
    'document.created',
    'document.sent',
    'document.viewed',
    'document.signed',
    'document.completed',
    'document.cancelled',
  ];

  const tabs = [
    { id: 'profile', label: 'Profile', icon: '👤' },
    { id: 'security', label: 'Security', icon: '🔒' },
    { id: 'apikeys', label: 'API Keys', icon: '🔑' },
    { id: 'webhooks', label: 'Webhooks', icon: '🔗' },
    { id: 'teams', label: 'Teams', icon: '👥' },
  ];

  return (
    <Layout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-neutral mb-2">Settings</h1>
          <p className="text-base-content/60">Manage your account, security, and integrations</p>
        </div>

        {/* Tabs */}
        <div className="mb-6 overflow-x-auto">
          <div className="flex gap-2 border-b border-base-300 min-w-max">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`
                  flex items-center gap-2 px-4 py-3 font-semibold text-sm transition-all
                  border-b-2 whitespace-nowrap
                  ${activeTab === tab.id
                    ? 'border-neutral text-neutral'
                    : 'border-transparent text-base-content/60 hover:text-base-content hover:border-base-300'
                  }
                `}
              >
                <span className="text-lg">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div className="grid gap-6 max-w-2xl">
            <Card title="User Information">
              <div className="flex flex-col gap-4">
                <div>
                  <label className="block text-sm font-semibold text-neutral mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={user?.email || ''}
                    disabled
                    className="input-docuseal bg-base-200 cursor-not-allowed"
                  />
                  <p className="text-xs text-base-content/60 mt-1">Your email cannot be changed</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-neutral mb-2">
                    Role
                  </label>
                  <input
                    type="text"
                    value={user?.role || ''}
                    disabled
                    className="input-docuseal bg-base-200 cursor-not-allowed capitalize"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-neutral mb-2">
                    Member Since
                  </label>
                  <input
                    type="text"
                    value={user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
                    disabled
                    className="input-docuseal bg-base-200 cursor-not-allowed"
                  />
                </div>
              </div>
            </Card>

            <Card title="Danger Zone">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-error mb-1">Sign Out</h3>
                  <p className="text-sm text-base-content/60">Sign out of your account on this device</p>
                </div>
                <Button variant="danger" onClick={logout}>
                  Sign Out
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* Security Tab */}
        {activeTab === 'security' && (
          <div className="grid gap-6 max-w-2xl">
            <Card title="Change Password">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-neutral mb-1">Password</h3>
                  <p className="text-sm text-base-content/60">Update your password to keep your account secure</p>
                </div>
                <Button onClick={() => setIsPasswordModalOpen(true)}>
                  Change Password
                </Button>
              </div>
            </Card>

            <Card title="Two-Factor Authentication">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-neutral mb-1">2FA Status</h3>
                  <p className="text-sm text-base-content/60">
                    <span className="text-warning font-medium">Not Enabled</span> - Add an extra layer of security
                  </p>
                </div>
                <Button variant="outline" disabled>
                  Enable 2FA (Coming Soon)
                </Button>
              </div>
            </Card>

            <Card title="Active Sessions">
              <div>
                <h3 className="font-semibold text-neutral mb-3">Current Session</h3>
                <div className="flex items-start gap-3 p-3 bg-base-200 rounded-lg">
                  <svg className="w-6 h-6 text-success flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <div className="flex-1">
                    <p className="font-medium text-sm">This Device</p>
                    <p className="text-xs text-base-content/60 mt-1">Last active: Just now</p>
                  </div>
                  <span className="text-xs font-medium text-success">Active</span>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* API Keys Tab */}
        {activeTab === 'apikeys' && (
          <div>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div>
                <h2 className="text-xl font-semibold text-neutral">API Keys</h2>
                <p className="text-sm text-base-content/60 mt-1">Manage API keys for programmatic access</p>
              </div>
              <Button onClick={() => setIsApiKeyModalOpen(true)} icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              }>
                Create API Key
              </Button>
            </div>

            {apiKeys.length === 0 ? (
              <Card>
                <div className="text-center py-12">
                  <svg className="w-16 h-16 mx-auto mb-4 text-base-content/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                  <h3 className="text-lg font-semibold text-neutral mb-2">No API keys yet</h3>
                  <p className="text-base-content/60 mb-4">Create an API key to integrate with external systems</p>
                </div>
              </Card>
            ) : (
              <div className="grid gap-4">
                {apiKeys.map((key) => (
                  <Card key={key.id}>
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-neutral mb-2 flex items-center gap-2">
                          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                          </svg>
                          {key.name}
                        </h3>
                        <div className="flex flex-col gap-1 text-sm text-base-content/60">
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            Created {new Date(key.created_at).toLocaleDateString()}
                          </div>
                          {key.last_used_at && (
                            <div className="flex items-center gap-2">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              Last used {new Date(key.last_used_at).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => {
                          if (confirm('Are you sure you want to delete this API key? This action cannot be undone.')) {
                            deleteApiKeyMutation.mutate(key.id);
                          }
                        }}
                        icon={
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        }
                      >
                        Delete
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Webhooks Tab */}
        {activeTab === 'webhooks' && (
          <div>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div>
                <h2 className="text-xl font-semibold text-neutral">Webhooks</h2>
                <p className="text-sm text-base-content/60 mt-1">Receive real-time notifications about document events</p>
              </div>
              <Button onClick={() => setIsWebhookModalOpen(true)} disabled icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              }>
                Create Webhook
              </Button>
            </div>

            {webhooks.length === 0 ? (
              <Card>
                <div className="text-center py-12">
                  <svg className="w-16 h-16 mx-auto mb-4 text-base-content/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  <h3 className="text-lg font-semibold text-neutral mb-2">Webhooks Coming Soon</h3>
                  <p className="text-base-content/60 mb-4">Webhook functionality is currently under development and will be available soon</p>
                </div>
              </Card>
            ) : (
              <div className="grid gap-4">
                {webhooks.map((webhook) => (
                  <Card key={webhook.id}>
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold text-neutral font-mono text-sm break-all">
                              {webhook.url}
                            </h3>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            {webhook.active ? (
                              <span className="flex items-center gap-1 text-success font-medium">
                                <span className="w-2 h-2 bg-success rounded-full"></span>
                                Active
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-error font-medium">
                                <span className="w-2 h-2 bg-error rounded-full"></span>
                                Inactive
                              </span>
                            )}
                            <span className="text-base-content/40">•</span>
                            <span className="text-base-content/60">
                              Created {new Date(webhook.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => {
                            if (confirm('Are you sure you want to delete this webhook?')) {
                              deleteWebhookMutation.mutate(webhook.id);
                            }
                          }}
                          icon={
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          }
                        >
                          Delete
                        </Button>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-neutral mb-2">Subscribed Events:</p>
                        <div className="flex flex-wrap gap-2">
                          {webhook.events.map((event) => (
                            <span
                              key={event}
                              className="px-2 py-1 bg-accent/10 text-accent text-xs font-medium rounded-md"
                            >
                              {event}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Teams Tab */}
        {activeTab === 'teams' && (
          <div>
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-neutral">Teams</h2>
              <p className="text-sm text-base-content/60 mt-1">Collaborate with your team members</p>
            </div>

            {teams.length === 0 ? (
              <Card>
                <div className="text-center py-12">
                  <svg className="w-16 h-16 mx-auto mb-4 text-base-content/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <h3 className="text-lg font-semibold text-neutral mb-2">No teams yet</h3>
                  <p className="text-base-content/60 mb-4">You haven't joined any teams yet</p>
                </div>
              </Card>
            ) : (
              <div className="grid gap-4">
                {teams.map((team) => (
                  <Card key={team.id}>
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-neutral/20 to-neutral/30 rounded-xl flex items-center justify-center flex-shrink-0">
                        <svg className="w-6 h-6 text-neutral" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-neutral">{team.name}</h3>
                        <p className="text-sm text-base-content/60 capitalize">Role: {team.role}</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Change Password Modal */}
        <Modal
          isOpen={isPasswordModalOpen}
          onClose={() => {
            setIsPasswordModalOpen(false);
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
          }}
          title="Change Password"
        >
          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-semibold text-neutral mb-2">
                Current Password
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                className="input-docuseal"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-neutral mb-2">
                New Password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password (min 8 characters)"
                className="input-docuseal"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-neutral mb-2">
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="input-docuseal"
              />
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIsPasswordModalOpen(false);
                  setCurrentPassword('');
                  setNewPassword('');
                  setConfirmPassword('');
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleChangePassword}
                loading={changePasswordMutation.isPending}
              >
                Change Password
              </Button>
            </div>
          </div>
        </Modal>

        {/* Create API Key Modal */}
        <Modal
          isOpen={isApiKeyModalOpen}
          onClose={() => {
            setIsApiKeyModalOpen(false);
            setNewApiKeyName('');
            setCreatedApiKey(null);
          }}
          title={createdApiKey ? 'API Key Created' : 'Create API Key'}
          width="600px"
        >
          {createdApiKey ? (
            <div className="flex flex-col gap-4">
              <div className="p-4 bg-warning/10 border border-warning/30 rounded-xl">
                <div className="flex gap-3">
                  <svg className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div>
                    <p className="font-semibold text-neutral mb-1">Important: Save this API key now!</p>
                    <p className="text-sm text-base-content/70">You won't be able to see it again after closing this dialog.</p>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-neutral mb-2">Your API Key</label>
                <div className="p-3 bg-base-200 border border-base-300 rounded-lg font-mono text-sm break-all">
                  {createdApiKey}
                </div>
              </div>
              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(createdApiKey);
                    toast.success('API key copied to clipboard');
                  }}
                  icon={
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  }
                >
                  Copy to Clipboard
                </Button>
                <Button onClick={() => {
                  setIsApiKeyModalOpen(false);
                  setCreatedApiKey(null);
                }}>
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-semibold text-neutral mb-2">
                  API Key Name <span className="text-error">*</span>
                </label>
                <input
                  type="text"
                  value={newApiKeyName}
                  onChange={(e) => setNewApiKeyName(e.target.value)}
                  placeholder="e.g., Production API Key"
                  className="input-docuseal"
                  autoFocus
                />
                <p className="text-xs text-base-content/60 mt-2">Choose a descriptive name to identify this key</p>
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsApiKeyModalOpen(false);
                    setNewApiKeyName('');
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleCreateApiKey} loading={createApiKeyMutation.isPending}>
                  Create API Key
                </Button>
              </div>
            </div>
          )}
        </Modal>

        {/* Create Webhook Modal */}
        <Modal
          isOpen={isWebhookModalOpen}
          onClose={() => {
            setIsWebhookModalOpen(false);
            setWebhookUrl('');
            setWebhookEvents([]);
          }}
          title="Create Webhook"
          width="600px"
        >
          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-semibold text-neutral mb-2">
                Webhook URL <span className="text-error">*</span>
              </label>
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://example.com/webhook"
                className="input-docuseal"
                autoFocus
              />
              <p className="text-xs text-base-content/60 mt-2">The URL where webhook events will be sent</p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-neutral mb-3">
                Events <span className="text-error">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {availableEvents.map((event) => (
                  <label
                    key={event}
                    className="flex items-center gap-3 p-3 border border-base-300 rounded-lg cursor-pointer hover:bg-base-200 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={webhookEvents.includes(event)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setWebhookEvents([...webhookEvents, event]);
                        } else {
                          setWebhookEvents(webhookEvents.filter((e) => e !== event));
                        }
                      }}
                      className="w-4 h-4 text-neutral rounded border-base-300 focus:ring-2 focus:ring-neutral"
                    />
                    <span className="text-sm font-medium">{event}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIsWebhookModalOpen(false);
                  setWebhookUrl('');
                  setWebhookEvents([]);
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleCreateWebhook} loading={createWebhookMutation.isPending}>
                Create Webhook
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </Layout>
  );
};

export default Settings;
