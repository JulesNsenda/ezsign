import React, { useState, useRef, useEffect } from 'react';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Modal from '@/components/Modal';
import { useToast } from '@/hooks/useToast';
import {
  useBranding,
  useUpdateBranding,
  useUploadLogo,
  useDeleteLogo,
  useResetBranding,
} from '@/hooks/useBranding';
import { brandingService } from '@/services/brandingService';
import type { UpdateBrandingData } from '@/types';

interface BrandingSettingsProps {
  teamId: string;
  teamName: string;
}

/**
 * Branding settings component for team customization
 */
export const BrandingSettings: React.FC<BrandingSettingsProps> = ({
  teamId,
  teamName,
}) => {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Fetch branding data
  const { data: brandingData, isLoading, error } = useBranding(teamId);

  // Mutations
  const updateBranding = useUpdateBranding();
  const uploadLogo = useUploadLogo();
  const deleteLogo = useDeleteLogo();
  const resetBranding = useResetBranding();

  // Form state
  const [formData, setFormData] = useState<UpdateBrandingData>({});
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // Initialize form data when branding is loaded
  useEffect(() => {
    if (brandingData?.branding) {
      const b = brandingData.branding;
      setFormData({
        primary_color: b.primary_color,
        secondary_color: b.secondary_color,
        accent_color: b.accent_color,
        company_name: b.company_name,
        tagline: b.tagline,
        email_footer_text: b.email_footer_text,
        custom_page_title: b.custom_page_title,
        support_email: b.support_email,
        support_url: b.support_url,
        privacy_url: b.privacy_url,
        terms_url: b.terms_url,
        show_powered_by: b.show_powered_by,
        hide_ezsign_branding: b.hide_ezsign_branding,
      });
      if (b.logo_url || b.logo_path) {
        setLogoPreview(brandingService.getLogoUrl(teamId));
      }
    }
  }, [brandingData, teamId]);

  const handleInputChange = (
    field: keyof UpdateBrandingData,
    value: string | boolean | null
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setHasUnsavedChanges(true);
  };

  const handleColorChange = (field: 'primary_color' | 'secondary_color' | 'accent_color', value: string | null) => {
    if (value && !brandingService.isValidHexColor(value)) {
      return; // Don't update if invalid
    }
    handleInputChange(field, value);
  };

  const handleSave = async () => {
    try {
      // Validate
      if (formData.support_email && !brandingService.isValidEmail(formData.support_email)) {
        toast.error('Invalid support email format');
        return;
      }
      if (formData.support_url && !brandingService.isValidUrl(formData.support_url)) {
        toast.error('Invalid support URL format');
        return;
      }
      if (formData.privacy_url && !brandingService.isValidUrl(formData.privacy_url)) {
        toast.error('Invalid privacy URL format');
        return;
      }
      if (formData.terms_url && !brandingService.isValidUrl(formData.terms_url)) {
        toast.error('Invalid terms URL format');
        return;
      }

      await updateBranding.mutateAsync({ teamId, data: formData });
      toast.success('Branding settings saved successfully');
      setHasUnsavedChanges(false);
    } catch (err) {
      toast.error('Failed to save branding settings');
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Invalid file type. Allowed: PNG, JPEG, SVG, WebP');
      return;
    }

    // Validate file size (2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error('File too large. Maximum size is 2MB');
      return;
    }

    try {
      const result = await uploadLogo.mutateAsync({ teamId, file });
      setLogoPreview(result.logoUrl);
      toast.success('Logo uploaded successfully');
    } catch (err) {
      toast.error('Failed to upload logo');
    }
  };

  const handleDeleteLogo = async () => {
    try {
      await deleteLogo.mutateAsync(teamId);
      setLogoPreview(null);
      toast.success('Logo deleted successfully');
    } catch (err) {
      toast.error('Failed to delete logo');
    }
  };

  const handleReset = async () => {
    try {
      await resetBranding.mutateAsync(teamId);
      setIsResetModalOpen(false);
      setLogoPreview(null);
      toast.success('Branding reset to defaults');
    } catch (err) {
      toast.error('Failed to reset branding');
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <div className="text-center py-8">
          <p className="text-error">Failed to load branding settings</p>
          <Button variant="outline" onClick={() => window.location.reload()} className="mt-4">
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-semibold text-neutral">Branding Settings</h2>
          <p className="text-sm text-base-content/60 mt-1">
            Customize branding for <span className="font-medium">{teamName}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsResetModalOpen(true)}
          >
            Reset to Defaults
          </Button>
          <Button
            onClick={handleSave}
            disabled={!hasUnsavedChanges || updateBranding.isPending}
            loading={updateBranding.isPending}
          >
            Save Changes
          </Button>
        </div>
      </div>

      {/* Logo Section */}
      <Card title="Logo">
        <div className="flex flex-col sm:flex-row items-start gap-6">
          <div className="flex-shrink-0">
            <div className="w-32 h-32 rounded-lg border-2 border-dashed border-base-300 flex items-center justify-center bg-base-200 overflow-hidden">
              {logoPreview ? (
                <img
                  src={logoPreview}
                  alt="Team logo"
                  className="max-w-full max-h-full object-contain"
                />
              ) : (
                <svg className="w-12 h-12 text-base-content/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              )}
            </div>
          </div>
          <div className="flex-1">
            <h3 className="font-medium text-neutral mb-2">Company Logo</h3>
            <p className="text-sm text-base-content/60 mb-4">
              Upload your company logo to display on signing pages and emails. Recommended size: 200x50 pixels. Max file size: 2MB.
            </p>
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                onChange={handleLogoUpload}
                className="hidden"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                loading={uploadLogo.isPending}
              >
                {logoPreview ? 'Change Logo' : 'Upload Logo'}
              </Button>
              {logoPreview && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleDeleteLogo}
                  loading={deleteLogo.isPending}
                >
                  Remove
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Colors Section */}
      <Card title="Brand Colors">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium mb-2">Primary Color</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={formData.primary_color || '#4F46E5'}
                onChange={(e) => handleColorChange('primary_color', e.target.value)}
                className="w-12 h-10 rounded border border-base-300 cursor-pointer"
              />
              <input
                type="text"
                value={formData.primary_color || '#4F46E5'}
                onChange={(e) => handleColorChange('primary_color', e.target.value)}
                placeholder="#4F46E5"
                className="input input-bordered input-sm flex-1"
              />
            </div>
            <p className="text-xs text-base-content/50 mt-1">Used for buttons and links</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Secondary Color</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={formData.secondary_color || '#10B981'}
                onChange={(e) => handleColorChange('secondary_color', e.target.value)}
                className="w-12 h-10 rounded border border-base-300 cursor-pointer"
              />
              <input
                type="text"
                value={formData.secondary_color || '#10B981'}
                onChange={(e) => handleColorChange('secondary_color', e.target.value)}
                placeholder="#10B981"
                className="input input-bordered input-sm flex-1"
              />
            </div>
            <p className="text-xs text-base-content/50 mt-1">Used for accents and highlights</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Accent Color (Optional)</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={formData.accent_color || '#6366F1'}
                onChange={(e) => handleColorChange('accent_color', e.target.value)}
                className="w-12 h-10 rounded border border-base-300 cursor-pointer"
              />
              <input
                type="text"
                value={formData.accent_color || ''}
                onChange={(e) => handleColorChange('accent_color', e.target.value || null)}
                placeholder="#6366F1"
                className="input input-bordered input-sm flex-1"
              />
            </div>
            <p className="text-xs text-base-content/50 mt-1">Additional accent color</p>
          </div>
        </div>
      </Card>

      {/* Company Info Section */}
      <Card title="Company Information">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium mb-2">Company Name</label>
            <input
              type="text"
              value={formData.company_name || ''}
              onChange={(e) => handleInputChange('company_name', e.target.value || null)}
              placeholder="Your Company Name"
              className="input input-bordered w-full"
              maxLength={255}
            />
            <p className="text-xs text-base-content/50 mt-1">Displayed instead of "EzSign"</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Tagline</label>
            <input
              type="text"
              value={formData.tagline || ''}
              onChange={(e) => handleInputChange('tagline', e.target.value || null)}
              placeholder="Your company tagline"
              className="input input-bordered w-full"
              maxLength={500}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Support Email</label>
            <input
              type="email"
              value={formData.support_email || ''}
              onChange={(e) => handleInputChange('support_email', e.target.value || null)}
              placeholder="support@yourcompany.com"
              className="input input-bordered w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Custom Page Title</label>
            <input
              type="text"
              value={formData.custom_page_title || ''}
              onChange={(e) => handleInputChange('custom_page_title', e.target.value || null)}
              placeholder="Custom browser tab title"
              className="input input-bordered w-full"
              maxLength={255}
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-2">Email Footer Text</label>
            <textarea
              value={formData.email_footer_text || ''}
              onChange={(e) => handleInputChange('email_footer_text', e.target.value || null)}
              placeholder="Custom footer text for email notifications"
              className="textarea textarea-bordered w-full"
              rows={3}
            />
          </div>
        </div>
      </Card>

      {/* Links Section */}
      <Card title="Custom Links">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium mb-2">Support/Help URL</label>
            <input
              type="url"
              value={formData.support_url || ''}
              onChange={(e) => handleInputChange('support_url', e.target.value || null)}
              placeholder="https://help.yourcompany.com"
              className="input input-bordered w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Privacy Policy URL</label>
            <input
              type="url"
              value={formData.privacy_url || ''}
              onChange={(e) => handleInputChange('privacy_url', e.target.value || null)}
              placeholder="https://yourcompany.com/privacy"
              className="input input-bordered w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Terms of Service URL</label>
            <input
              type="url"
              value={formData.terms_url || ''}
              onChange={(e) => handleInputChange('terms_url', e.target.value || null)}
              placeholder="https://yourcompany.com/terms"
              className="input input-bordered w-full"
            />
          </div>
        </div>
      </Card>

      {/* Display Options Section */}
      <Card title="Display Options">
        <div className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.show_powered_by ?? true}
              onChange={(e) => handleInputChange('show_powered_by', e.target.checked)}
              className="checkbox checkbox-primary"
            />
            <div>
              <span className="font-medium">Show "Powered by EzSign"</span>
              <p className="text-sm text-base-content/60">Display attribution text on signing pages</p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.hide_ezsign_branding ?? false}
              onChange={(e) => handleInputChange('hide_ezsign_branding', e.target.checked)}
              className="checkbox checkbox-primary"
            />
            <div>
              <span className="font-medium">Hide EzSign Branding (Enterprise)</span>
              <p className="text-sm text-base-content/60">Completely remove EzSign branding for white-label experience</p>
            </div>
          </label>
        </div>
      </Card>

      {/* Preview Section */}
      <Card title="Preview">
        <div className="bg-base-200 rounded-lg p-6">
          <div className="flex items-center gap-4 mb-4">
            {logoPreview ? (
              <img src={logoPreview} alt="Logo preview" className="h-10 object-contain" />
            ) : (
              <div
                className="h-10 px-4 rounded flex items-center justify-center font-bold text-white"
                style={{ backgroundColor: formData.primary_color || '#4F46E5' }}
              >
                {formData.company_name || 'EzSign'}
              </div>
            )}
            {formData.tagline && (
              <span className="text-sm text-base-content/60">{formData.tagline}</span>
            )}
          </div>

          <div className="flex gap-3 mb-4">
            <button
              className="px-4 py-2 rounded-lg text-white font-medium"
              style={{ backgroundColor: formData.primary_color || '#4F46E5' }}
            >
              Primary Button
            </button>
            <button
              className="px-4 py-2 rounded-lg text-white font-medium"
              style={{ backgroundColor: formData.secondary_color || '#10B981' }}
            >
              Secondary Button
            </button>
          </div>

          {(formData.show_powered_by ?? true) && !formData.hide_ezsign_branding && (
            <p className="text-xs text-base-content/50">
              Powered by {formData.company_name || 'EzSign'}
            </p>
          )}
        </div>
      </Card>

      {/* Reset Confirmation Modal */}
      <Modal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        title="Reset Branding"
      >
        <div className="space-y-4">
          <p className="text-base-content/70">
            Are you sure you want to reset all branding settings to defaults? This will:
          </p>
          <ul className="list-disc list-inside text-sm text-base-content/60 space-y-1">
            <li>Remove your uploaded logo</li>
            <li>Reset all colors to default</li>
            <li>Clear all custom text and links</li>
            <li>Restore default display options</li>
          </ul>
          <p className="text-sm text-warning font-medium">
            This action cannot be undone.
          </p>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => setIsResetModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleReset}
              loading={resetBranding.isPending}
            >
              Reset to Defaults
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default BrandingSettings;
