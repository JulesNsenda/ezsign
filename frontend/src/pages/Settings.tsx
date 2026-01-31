import React, { useState } from 'react';
import Layout from '@/components/Layout';
import Button from '@/components/Button';
import Modal from '@/components/Modal';
import ConfirmModal from '@/components/ConfirmModal';
import Card from '@/components/Card';
import TwoFactorSetup from '@/components/TwoFactorSetup';
import BackupCodesDisplay from '@/components/BackupCodesDisplay';
import BrandingSettings from '@/components/BrandingSettings';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/contexts/ThemeContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/useToast';
import apiClient from '@/api/client';
import { twoFactorService, type TwoFactorStatus } from '@/services/twoFactorService';
import {
  useTeams,
  useCreateTeam,
  useUpdateTeam,
  useDeleteTeam,
  useTeamMembers,
  useAddTeamMember,
  useUpdateTeamMemberRole,
  useRemoveTeamMember,
} from '@/hooks/useTeams';
import type { TeamMember } from '@/services/teamService';

type ApiKeyScope =
  | 'documents:read'
  | 'documents:write'
  | 'signers:read'
  | 'signers:write'
  | 'templates:read'
  | 'templates:write'
  | 'webhooks:read'
  | 'webhooks:write';

const ALL_SCOPES: ApiKeyScope[] = [
  'documents:read',
  'documents:write',
  'signers:read',
  'signers:write',
  'templates:read',
  'templates:write',
  'webhooks:read',
  'webhooks:write',
];

const SCOPE_DESCRIPTIONS: Record<ApiKeyScope, string> = {
  'documents:read': 'Read documents, list, download',
  'documents:write': 'Create, update, delete documents',
  'signers:read': 'Read signers, list signers',
  'signers:write': 'Create, update, delete signers',
  'templates:read': 'Read templates, list templates',
  'templates:write': 'Create, update, delete templates',
  'webhooks:read': 'Read webhooks, list webhooks',
  'webhooks:write': 'Create, update, delete webhooks',
};

interface ApiKey {
  id: string;
  name: string;
  key?: string;
  scopes: ApiKeyScope[];
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

interface TeamWithRole {
  id: string;
  name: string;
  owner_id: string;
  role: string;
  created_at: string;
  updated_at: string;
}

/**
 * Settings page for user profile, API keys, webhooks, and teams
 */
export const Settings: React.FC = () => {
  const { user, logout } = useAuth();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'profile' | 'appearance' | 'security' | 'apikeys' | 'webhooks' | 'teams' | 'branding'>(
    'profile'
  );

  // Branding
  const [selectedBrandingTeamId, setSelectedBrandingTeamId] = useState<string | null>(null);

  // Profile
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // API Keys
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [newApiKeyName, setNewApiKeyName] = useState('');
  const [newApiKeyScopes, setNewApiKeyScopes] = useState<ApiKeyScope[]>([...ALL_SCOPES]);
  const [createdApiKey, setCreatedApiKey] = useState<string | null>(null);

  // Webhooks
  const [isWebhookModalOpen, setIsWebhookModalOpen] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookEvents, setWebhookEvents] = useState<string[]>([]);

  // 2FA
  const [is2FASetupModalOpen, setIs2FASetupModalOpen] = useState(false);
  const [is2FADisableModalOpen, setIs2FADisableModalOpen] = useState(false);
  const [is2FABackupCodesModalOpen, setIs2FABackupCodesModalOpen] = useState(false);
  const [disableCode, setDisableCode] = useState('');
  const [regenerateCode, setRegenerateCode] = useState('');
  const [newBackupCodes, setNewBackupCodes] = useState<string[]>([]);

  // Teams
  const [isCreateTeamModalOpen, setIsCreateTeamModalOpen] = useState(false);
  const [isEditTeamModalOpen, setIsEditTeamModalOpen] = useState(false);
  const [isManageMembersModalOpen, setIsManageMembersModalOpen] = useState(false);
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
  const [selectedTeamForEdit, setSelectedTeamForEdit] = useState<TeamWithRole | null>(null);
  const [newTeamName, setNewTeamName] = useState('');
  const [editTeamName, setEditTeamName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'admin' | 'member'>('member');

  // Confirm Modal
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

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

  const { data: teams = [], isLoading: isTeamsLoading } = useTeams();
  const { data: teamMembers = [], isLoading: isMembersLoading } = useTeamMembers(selectedTeamForEdit?.id || null);

  const createTeamMutation = useCreateTeam();
  const updateTeamMutation = useUpdateTeam();
  const deleteTeamMutation = useDeleteTeam();
  const addMemberMutation = useAddTeamMember();
  const updateMemberRoleMutation = useUpdateTeamMemberRole();
  const removeMemberMutation = useRemoveTeamMember();

  const { data: twoFactorStatus, refetch: refetch2FAStatus } = useQuery<TwoFactorStatus>({
    queryKey: ['2fa-status'],
    queryFn: () => twoFactorService.getStatus(),
    enabled: activeTab === 'security',
  });

  const disable2FAMutation = useMutation({
    mutationFn: (code: string) => twoFactorService.disable(code),
    onSuccess: () => {
      toast.success('Two-factor authentication disabled');
      setIs2FADisableModalOpen(false);
      setDisableCode('');
      refetch2FAStatus();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error?.message || 'Failed to disable 2FA');
    },
  });

  const regenerateBackupCodesMutation = useMutation({
    mutationFn: (code: string) => twoFactorService.regenerateBackupCodes(code),
    onSuccess: (codes) => {
      setNewBackupCodes(codes);
      setRegenerateCode('');
      refetch2FAStatus();
      toast.success('Backup codes regenerated');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error?.message || 'Failed to regenerate backup codes');
    },
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
    mutationFn: async (data: { name: string; scopes: ApiKeyScope[] }) => {
      const response = await apiClient.post('/api-keys', data);
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
    if (newApiKeyScopes.length === 0) {
      toast.error('Please select at least one scope');
      return;
    }
    await createApiKeyMutation.mutateAsync({ name: newApiKeyName, scopes: newApiKeyScopes });
    setNewApiKeyName('');
    setNewApiKeyScopes([...ALL_SCOPES]);
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

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) {
      toast.error('Please enter a team name');
      return;
    }
    try {
      await createTeamMutation.mutateAsync({ name: newTeamName });
      toast.success('Team created successfully');
      setIsCreateTeamModalOpen(false);
      setNewTeamName('');
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to create team');
    }
  };

  const handleUpdateTeam = async () => {
    if (!selectedTeamForEdit || !editTeamName.trim()) {
      toast.error('Please enter a team name');
      return;
    }
    try {
      await updateTeamMutation.mutateAsync({
        teamId: selectedTeamForEdit.id,
        data: { name: editTeamName },
      });
      toast.success('Team updated successfully');
      setIsEditTeamModalOpen(false);
      setSelectedTeamForEdit(null);
      setEditTeamName('');
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to update team');
    }
  };

  const handleDeleteTeam = async (teamId: string) => {
    try {
      await deleteTeamMutation.mutateAsync(teamId);
      toast.success('Team deleted successfully');
      setIsManageMembersModalOpen(false);
      setSelectedTeamForEdit(null);
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to delete team');
    }
  };

  const handleAddMember = async () => {
    if (!selectedTeamForEdit || !newMemberEmail.trim()) {
      toast.error('Please enter an email address');
      return;
    }
    try {
      await addMemberMutation.mutateAsync({
        teamId: selectedTeamForEdit.id,
        data: { email: newMemberEmail, role: newMemberRole },
      });
      toast.success('Member added successfully');
      setIsAddMemberModalOpen(false);
      setNewMemberEmail('');
      setNewMemberRole('member');
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to add member');
    }
  };

  const handleUpdateMemberRole = async (userId: string, role: 'admin' | 'member') => {
    if (!selectedTeamForEdit) return;
    try {
      await updateMemberRoleMutation.mutateAsync({
        teamId: selectedTeamForEdit.id,
        userId,
        data: { role },
      });
      toast.success('Member role updated');
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to update role');
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!selectedTeamForEdit) return;
    try {
      await removeMemberMutation.mutateAsync({
        teamId: selectedTeamForEdit.id,
        userId,
      });
      toast.success('Member removed');
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to remove member');
    }
  };

  const openManageMembers = (team: TeamWithRole) => {
    setSelectedTeamForEdit(team);
    setIsManageMembersModalOpen(true);
  };

  const openEditTeam = (team: TeamWithRole) => {
    setSelectedTeamForEdit(team);
    setEditTeamName(team.name);
    setIsEditTeamModalOpen(true);
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
    { id: 'appearance', label: 'Appearance', icon: '🎨' },
    { id: 'security', label: 'Security', icon: '🔒' },
    { id: 'apikeys', label: 'API Keys', icon: '🔑' },
    { id: 'webhooks', label: 'Webhooks', icon: '🔗' },
    { id: 'teams', label: 'Teams', icon: '👥' },
    { id: 'branding', label: 'Branding', icon: '🎨' },
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

        {/* Appearance Tab */}
        {activeTab === 'appearance' && (
          <div className="grid gap-6 max-w-2xl">
            <Card title="Theme">
              <div className="flex flex-col gap-6">
                <div>
                  <p className="text-sm text-base-content/60 mb-4">
                    Choose how EzSign looks to you. Select a single theme, or sync with your system settings.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Light Theme Option */}
                    <button
                      onClick={() => setTheme('light')}
                      className={`
                        p-4 rounded-xl border-2 transition-all duration-200 text-left
                        ${theme === 'light'
                          ? 'border-neutral bg-neutral/5 shadow-md'
                          : 'border-base-300 hover:border-base-content/30 hover:bg-base-200'
                        }
                      `}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-lg bg-[#faf7f5] border border-gray-200 flex items-center justify-center shadow-sm">
                          <svg className="w-5 h-5 text-amber-500" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                          </svg>
                        </div>
                        <div>
                          <p className="font-semibold text-neutral">Light</p>
                          <p className="text-xs text-base-content/60">Bright and clean</p>
                        </div>
                      </div>
                      {theme === 'light' && (
                        <div className="flex items-center gap-1 text-xs text-neutral font-medium">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                          </svg>
                          Active
                        </div>
                      )}
                    </button>

                    {/* Dark Theme Option */}
                    <button
                      onClick={() => setTheme('dark')}
                      className={`
                        p-4 rounded-xl border-2 transition-all duration-200 text-left
                        ${theme === 'dark'
                          ? 'border-neutral bg-neutral/5 shadow-md'
                          : 'border-base-300 hover:border-base-content/30 hover:bg-base-200'
                        }
                      `}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-lg bg-[#1a1a1a] border border-gray-700 flex items-center justify-center shadow-sm">
                          <svg className="w-5 h-5 text-indigo-400" fill="currentColor" viewBox="0 0 24 24">
                            <path fillRule="evenodd" d="M9.528 1.718a.75.75 0 01.162.819A8.97 8.97 0 009 6a9 9 0 009 9 8.97 8.97 0 003.463-.69.75.75 0 01.981.98 10.503 10.503 0 01-9.694 6.46c-5.799 0-10.5-4.701-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 01.818.162z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div>
                          <p className="font-semibold text-neutral">Dark</p>
                          <p className="text-xs text-base-content/60">Easy on the eyes</p>
                        </div>
                      </div>
                      {theme === 'dark' && (
                        <div className="flex items-center gap-1 text-xs text-neutral font-medium">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                          </svg>
                          Active
                        </div>
                      )}
                    </button>

                    {/* System Theme Option */}
                    <button
                      onClick={() => setTheme('system')}
                      className={`
                        p-4 rounded-xl border-2 transition-all duration-200 text-left
                        ${theme === 'system'
                          ? 'border-neutral bg-neutral/5 shadow-md'
                          : 'border-base-300 hover:border-base-content/30 hover:bg-base-200'
                        }
                      `}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#faf7f5] to-[#1a1a1a] border border-gray-300 flex items-center justify-center shadow-sm">
                          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <div>
                          <p className="font-semibold text-neutral">System</p>
                          <p className="text-xs text-base-content/60">Match OS setting</p>
                        </div>
                      </div>
                      {theme === 'system' && (
                        <div className="flex items-center gap-1 text-xs text-neutral font-medium">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                          </svg>
                          Active
                        </div>
                      )}
                    </button>
                  </div>
                </div>

                {theme === 'system' && (
                  <div className="p-3 bg-base-200 rounded-lg text-sm text-base-content/70">
                    <p>
                      Currently using <span className="font-semibold text-neutral">{resolvedTheme}</span> mode based on your system preferences.
                    </p>
                  </div>
                )}
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
              <div className="flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-neutral mb-1">2FA Status</h3>
                    {twoFactorStatus?.isEnabled ? (
                      <p className="text-sm text-base-content/60">
                        <span className="text-success font-medium">Enabled</span> - Your account is protected with 2FA
                        {twoFactorStatus.enabledAt && (
                          <span className="block text-xs mt-1">
                            Enabled on {new Date(twoFactorStatus.enabledAt).toLocaleDateString()}
                          </span>
                        )}
                      </p>
                    ) : (
                      <p className="text-sm text-base-content/60">
                        <span className="text-warning font-medium">Not Enabled</span> - Add an extra layer of security
                      </p>
                    )}
                  </div>
                  {twoFactorStatus?.isEnabled ? (
                    <Button
                      variant="danger"
                      onClick={() => setIs2FADisableModalOpen(true)}
                    >
                      Disable 2FA
                    </Button>
                  ) : (
                    <Button onClick={() => setIs2FASetupModalOpen(true)}>
                      Enable 2FA
                    </Button>
                  )}
                </div>

                {twoFactorStatus?.isEnabled && (
                  <div className="border-t border-base-300 pt-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div>
                        <h4 className="font-medium text-neutral mb-1">Backup Codes</h4>
                        <p className="text-sm text-base-content/60">
                          {twoFactorStatus.backupCodesRemaining} of 10 backup codes remaining
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIs2FABackupCodesModalOpen(true)}
                      >
                        Regenerate Codes
                      </Button>
                    </div>
                  </div>
                )}
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
                    <div className="flex flex-col gap-4">
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
                            setConfirmModal({
                              isOpen: true,
                              title: 'Delete API Key',
                              message: 'Are you sure you want to delete this API key? This action cannot be undone.',
                              onConfirm: () => {
                                deleteApiKeyMutation.mutate(key.id);
                                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                              },
                            });
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
                      {key.scopes && key.scopes.length > 0 && (
                        <div className="border-t border-base-200 pt-3">
                          <p className="text-xs font-semibold text-base-content/60 mb-2 uppercase tracking-wide">Permissions</p>
                          <div className="flex flex-wrap gap-1.5">
                            {key.scopes.length === ALL_SCOPES.length ? (
                              <span className="px-2 py-1 bg-success/10 text-success text-xs font-medium rounded-md">
                                Full Access
                              </span>
                            ) : (
                              key.scopes.map((scope) => (
                                <span
                                  key={scope}
                                  className="px-2 py-1 bg-accent/10 text-accent text-xs font-medium rounded-md"
                                >
                                  {scope}
                                </span>
                              ))
                            )}
                          </div>
                        </div>
                      )}
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
                            setConfirmModal({
                              isOpen: true,
                              title: 'Delete Webhook',
                              message: 'Are you sure you want to delete this webhook?',
                              onConfirm: () => {
                                deleteWebhookMutation.mutate(webhook.id);
                                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                              },
                            });
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
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div>
                <h2 className="text-xl font-semibold text-neutral">Teams</h2>
                <p className="text-sm text-base-content/60 mt-1">Collaborate with your team members</p>
              </div>
              <Button
                onClick={() => setIsCreateTeamModalOpen(true)}
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                }
              >
                Create Team
              </Button>
            </div>

            {isTeamsLoading ? (
              <Card>
                <div className="text-center py-12">
                  <div className="w-8 h-8 border-4 border-neutral/20 border-t-neutral rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-base-content/60">Loading teams...</p>
                </div>
              </Card>
            ) : teams.length === 0 ? (
              <Card>
                <div className="text-center py-12">
                  <svg className="w-16 h-16 mx-auto mb-4 text-base-content/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <h3 className="text-lg font-semibold text-neutral mb-2">No teams yet</h3>
                  <p className="text-base-content/60 mb-4">Create a team to collaborate with others and customize branding</p>
                  <Button onClick={() => setIsCreateTeamModalOpen(true)}>
                    Create Your First Team
                  </Button>
                </div>
              </Card>
            ) : (
              <div className="grid gap-4">
                {(teams as TeamWithRole[]).map((team) => (
                  <Card key={team.id}>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                      <div className="flex items-center gap-4 flex-1">
                        <div className="w-12 h-12 bg-gradient-to-br from-neutral/20 to-neutral/30 rounded-xl flex items-center justify-center flex-shrink-0">
                          <svg className="w-6 h-6 text-neutral" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-neutral">{team.name}</h3>
                          <p className="text-sm text-base-content/60 capitalize">Role: {team.role}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                        {(team.role === 'owner' || team.role === 'admin') && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openManageMembers(team)}
                              icon={
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                </svg>
                              }
                            >
                              Members
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedBrandingTeamId(team.id);
                                setActiveTab('branding');
                              }}
                              icon={
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                                </svg>
                              }
                            >
                              Branding
                            </Button>
                          </>
                        )}
                        {team.role === 'owner' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditTeam(team)}
                            icon={
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                            }
                          >
                            Settings
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Branding Tab */}
        {activeTab === 'branding' && (
          <div>
            {!selectedBrandingTeamId ? (
              <Card>
                <div className="text-center py-12">
                  <svg className="w-16 h-16 mx-auto mb-4 text-base-content/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                  </svg>
                  <h3 className="text-lg font-semibold text-neutral mb-2">
                    {teams.length === 0 ? 'Create a Team First' : 'Select a Team'}
                  </h3>
                  <p className="text-base-content/60 mb-4">
                    {teams.length === 0
                      ? 'You need to create a team before you can customize branding'
                      : 'Choose a team from the Teams tab to customize its branding'}
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    {teams.length === 0 ? (
                      <Button onClick={() => setIsCreateTeamModalOpen(true)}>
                        Create Team
                      </Button>
                    ) : (
                      <Button variant="outline" onClick={() => setActiveTab('teams')}>
                        Go to Teams
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ) : (
              <>
                <div className="mb-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedBrandingTeamId(null);
                      setActiveTab('teams');
                    }}
                    icon={
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    }
                  >
                    Back to Teams
                  </Button>
                </div>
                <BrandingSettings
                  teamId={selectedBrandingTeamId}
                  teamName={teams.find((t) => t.id === selectedBrandingTeamId)?.name || 'Team'}
                />
              </>
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
            setNewApiKeyScopes([...ALL_SCOPES]);
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
                  setNewApiKeyScopes([...ALL_SCOPES]);
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
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-semibold text-neutral">
                    Permissions <span className="text-error">*</span>
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setNewApiKeyScopes([...ALL_SCOPES])}
                      className="text-xs text-neutral hover:text-neutral/80 font-medium"
                    >
                      Select All
                    </button>
                    <span className="text-base-content/30">|</span>
                    <button
                      type="button"
                      onClick={() => setNewApiKeyScopes([])}
                      className="text-xs text-neutral hover:text-neutral/80 font-medium"
                    >
                      Clear All
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[240px] overflow-y-auto p-1">
                  {ALL_SCOPES.map((scope) => (
                    <label
                      key={scope}
                      className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                        newApiKeyScopes.includes(scope)
                          ? 'border-neutral/40 bg-neutral/5'
                          : 'border-base-300 hover:bg-base-200'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={newApiKeyScopes.includes(scope)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewApiKeyScopes([...newApiKeyScopes, scope]);
                          } else {
                            setNewApiKeyScopes(newApiKeyScopes.filter((s) => s !== scope));
                          }
                        }}
                        className="w-4 h-4 mt-0.5 text-neutral rounded border-base-300 focus:ring-2 focus:ring-neutral"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium block">{scope}</span>
                        <span className="text-xs text-base-content/60">{SCOPE_DESCRIPTIONS[scope]}</span>
                      </div>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-base-content/60 mt-2">
                  {newApiKeyScopes.length} of {ALL_SCOPES.length} permissions selected
                </p>
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsApiKeyModalOpen(false);
                    setNewApiKeyName('');
                    setNewApiKeyScopes([...ALL_SCOPES]);
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

        {/* Confirm Modal for destructive actions */}
        <ConfirmModal
          isOpen={confirmModal.isOpen}
          onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
          onConfirm={confirmModal.onConfirm}
          title={confirmModal.title}
          message={confirmModal.message}
          confirmText="Delete"
          variant="danger"
        />

        {/* 2FA Setup Modal */}
        <Modal
          isOpen={is2FASetupModalOpen}
          onClose={() => setIs2FASetupModalOpen(false)}
          title="Set Up Two-Factor Authentication"
          width="500px"
        >
          <TwoFactorSetup
            onComplete={() => {
              setIs2FASetupModalOpen(false);
              refetch2FAStatus();
            }}
            onCancel={() => setIs2FASetupModalOpen(false)}
          />
        </Modal>

        {/* 2FA Disable Modal */}
        <Modal
          isOpen={is2FADisableModalOpen}
          onClose={() => {
            setIs2FADisableModalOpen(false);
            setDisableCode('');
          }}
          title="Disable Two-Factor Authentication"
        >
          <div className="flex flex-col gap-4">
            <div className="p-4 bg-warning/10 border border-warning/30 rounded-xl">
              <div className="flex gap-3">
                <svg className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <p className="font-semibold text-neutral mb-1">Warning</p>
                  <p className="text-sm text-base-content/70">
                    Disabling 2FA will make your account less secure. You'll need to enter your current 2FA code to proceed.
                  </p>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-neutral mb-2">
                Verification Code
              </label>
              <input
                type="text"
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="input-docuseal text-center text-xl tracking-wider font-mono"
                maxLength={6}
              />
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIs2FADisableModalOpen(false);
                  setDisableCode('');
                }}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => disable2FAMutation.mutate(disableCode)}
                loading={disable2FAMutation.isPending}
                disabled={disableCode.length !== 6}
              >
                Disable 2FA
              </Button>
            </div>
          </div>
        </Modal>

        {/* Backup Codes Regeneration Modal */}
        <Modal
          isOpen={is2FABackupCodesModalOpen}
          onClose={() => {
            setIs2FABackupCodesModalOpen(false);
            setRegenerateCode('');
            setNewBackupCodes([]);
          }}
          title={newBackupCodes.length > 0 ? 'New Backup Codes' : 'Regenerate Backup Codes'}
          width="500px"
        >
          {newBackupCodes.length > 0 ? (
            <div className="flex flex-col gap-4">
              <BackupCodesDisplay codes={newBackupCodes} />
              <div className="flex justify-end">
                <Button
                  onClick={() => {
                    setIs2FABackupCodesModalOpen(false);
                    setNewBackupCodes([]);
                  }}
                >
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="p-4 bg-warning/10 border border-warning/30 rounded-xl">
                <div className="flex gap-3">
                  <svg className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div>
                    <p className="font-semibold text-neutral mb-1">Warning</p>
                    <p className="text-sm text-base-content/70">
                      This will invalidate all your existing backup codes. Make sure to save the new codes.
                    </p>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-neutral mb-2">
                  Enter your current 2FA code to regenerate
                </label>
                <input
                  type="text"
                  value={regenerateCode}
                  onChange={(e) => setRegenerateCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="input-docuseal text-center text-xl tracking-wider font-mono"
                  maxLength={6}
                />
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIs2FABackupCodesModalOpen(false);
                    setRegenerateCode('');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => regenerateBackupCodesMutation.mutate(regenerateCode)}
                  loading={regenerateBackupCodesMutation.isPending}
                  disabled={regenerateCode.length !== 6}
                >
                  Regenerate
                </Button>
              </div>
            </div>
          )}
        </Modal>

        {/* Create Team Modal */}
        <Modal
          isOpen={isCreateTeamModalOpen}
          onClose={() => {
            setIsCreateTeamModalOpen(false);
            setNewTeamName('');
          }}
          title="Create Team"
        >
          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-semibold text-neutral mb-2">
                Team Name <span className="text-error">*</span>
              </label>
              <input
                type="text"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder="e.g., My Company"
                className="input-docuseal"
                autoFocus
              />
              <p className="text-xs text-base-content/60 mt-2">
                Choose a name that represents your team or organization
              </p>
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIsCreateTeamModalOpen(false);
                  setNewTeamName('');
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateTeam}
                loading={createTeamMutation.isPending}
                disabled={!newTeamName.trim()}
              >
                Create Team
              </Button>
            </div>
          </div>
        </Modal>

        {/* Edit Team Modal */}
        <Modal
          isOpen={isEditTeamModalOpen}
          onClose={() => {
            setIsEditTeamModalOpen(false);
            setSelectedTeamForEdit(null);
            setEditTeamName('');
          }}
          title="Team Settings"
        >
          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-semibold text-neutral mb-2">
                Team Name <span className="text-error">*</span>
              </label>
              <input
                type="text"
                value={editTeamName}
                onChange={(e) => setEditTeamName(e.target.value)}
                placeholder="Team name"
                className="input-docuseal"
                autoFocus
              />
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIsEditTeamModalOpen(false);
                  setSelectedTeamForEdit(null);
                  setEditTeamName('');
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleUpdateTeam}
                loading={updateTeamMutation.isPending}
                disabled={!editTeamName.trim()}
              >
                Save Changes
              </Button>
            </div>
            <div className="border-t border-base-300 pt-4 mt-2">
              <h4 className="font-semibold text-error mb-2">Danger Zone</h4>
              <p className="text-sm text-base-content/60 mb-3">
                Deleting this team will remove all team members and branding settings. This action cannot be undone.
              </p>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  if (selectedTeamForEdit) {
                    setConfirmModal({
                      isOpen: true,
                      title: 'Delete Team',
                      message: `Are you sure you want to delete "${selectedTeamForEdit.name}"? This will remove all team members and branding settings.`,
                      onConfirm: () => {
                        handleDeleteTeam(selectedTeamForEdit.id);
                        setConfirmModal(prev => ({ ...prev, isOpen: false }));
                        setIsEditTeamModalOpen(false);
                      },
                    });
                  }
                }}
              >
                Delete Team
              </Button>
            </div>
          </div>
        </Modal>

        {/* Manage Team Members Modal */}
        <Modal
          isOpen={isManageMembersModalOpen}
          onClose={() => {
            setIsManageMembersModalOpen(false);
            setSelectedTeamForEdit(null);
          }}
          title={`Team Members - ${selectedTeamForEdit?.name || ''}`}
          width="600px"
        >
          <div className="flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-base-content/60">
                Manage who has access to this team
              </p>
              <Button
                size="sm"
                onClick={() => setIsAddMemberModalOpen(true)}
                icon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                }
              >
                Add Member
              </Button>
            </div>

            {isMembersLoading ? (
              <div className="text-center py-8">
                <div className="w-6 h-6 border-3 border-neutral/20 border-t-neutral rounded-full animate-spin mx-auto"></div>
              </div>
            ) : teamMembers.length === 0 ? (
              <div className="text-center py-8 text-base-content/60">
                No members yet
              </div>
            ) : (
              <div className="divide-y divide-base-200 max-h-[400px] overflow-y-auto">
                {teamMembers.map((member: TeamMember) => (
                  <div key={member.user_id} className="flex items-center gap-4 py-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-neutral/20 to-neutral/30 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-semibold text-neutral uppercase">
                        {member.email.charAt(0)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-neutral truncate">{member.email}</p>
                      <p className="text-xs text-base-content/60">
                        Joined {new Date(member.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {member.role === 'owner' ? (
                        <span className="px-2 py-1 text-xs font-semibold bg-neutral/10 text-neutral rounded-md">
                          Owner
                        </span>
                      ) : (
                        <>
                          <select
                            value={member.role}
                            onChange={(e) =>
                              handleUpdateMemberRole(member.user_id, e.target.value as 'admin' | 'member')
                            }
                            className="select select-sm select-bordered text-sm"
                            disabled={updateMemberRoleMutation.isPending}
                          >
                            <option value="member">Member</option>
                            <option value="admin">Admin</option>
                          </select>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setConfirmModal({
                                isOpen: true,
                                title: 'Remove Member',
                                message: `Are you sure you want to remove ${member.email} from this team?`,
                                onConfirm: () => {
                                  handleRemoveMember(member.user_id);
                                  setConfirmModal(prev => ({ ...prev, isOpen: false }));
                                },
                              });
                            }}
                            className="text-error hover:bg-error/10"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-base-200">
              <Button
                variant="outline"
                onClick={() => {
                  setIsManageMembersModalOpen(false);
                  setSelectedTeamForEdit(null);
                }}
              >
                Close
              </Button>
            </div>
          </div>
        </Modal>

        {/* Add Team Member Modal */}
        <Modal
          isOpen={isAddMemberModalOpen}
          onClose={() => {
            setIsAddMemberModalOpen(false);
            setNewMemberEmail('');
            setNewMemberRole('member');
          }}
          title="Add Team Member"
        >
          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-semibold text-neutral mb-2">
                Email Address <span className="text-error">*</span>
              </label>
              <input
                type="email"
                value={newMemberEmail}
                onChange={(e) => setNewMemberEmail(e.target.value)}
                placeholder="colleague@company.com"
                className="input-docuseal"
                autoFocus
              />
              <p className="text-xs text-base-content/60 mt-2">
                The user must have an existing account
              </p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-neutral mb-2">
                Role
              </label>
              <select
                value={newMemberRole}
                onChange={(e) => setNewMemberRole(e.target.value as 'admin' | 'member')}
                className="select select-bordered w-full"
              >
                <option value="member">Member - Can view and sign documents</option>
                <option value="admin">Admin - Can manage team settings and branding</option>
              </select>
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIsAddMemberModalOpen(false);
                  setNewMemberEmail('');
                  setNewMemberRole('member');
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddMember}
                loading={addMemberMutation.isPending}
                disabled={!newMemberEmail.trim()}
              >
                Add Member
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </Layout>
  );
};

export default Settings;
