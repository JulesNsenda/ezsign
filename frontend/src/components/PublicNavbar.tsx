import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useDefaultBranding } from '@/hooks/useBranding';
import Button from '@/components/Button';

/**
 * Shared navbar for public pages (landing, login, register, etc.)
 * Shows EzSign branding with Sign In / Get Started buttons
 */

export const PublicNavbar: React.FC = () => {
  const location = useLocation();
  const { data: brandingData } = useDefaultBranding();
  const branding = brandingData?.branding;

  const displayName = 'EzSign';
  const logoUrl = branding?.logo_url || null;
  const primaryColor = branding?.primary_color || '#4F46E5';
  const supportUrl = import.meta.env.VITE_SUPPORT_URL || '';

  const isLoginPage = location.pathname === '/login';
  const isRegisterPage = location.pathname === '/register';

  return (
    <nav className="border-b border-base-300/50 bg-base-100/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            {logoUrl ? (
              <img src={logoUrl} alt={`${displayName} logo`} className="h-8 w-auto object-contain" />
            ) : (
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center text-base-100 shadow-sm"
                style={{ backgroundColor: primaryColor }}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </div>
            )}
            <span className="text-xl font-bold text-neutral">{displayName}</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/docs" className="text-sm text-base-content/60 hover:text-neutral transition-colors font-medium">
              Docs
            </Link>
            <Link to="/api-reference" className="text-sm text-base-content/60 hover:text-neutral transition-colors font-medium">
              API
            </Link>
            {supportUrl && (
              <a
                href={supportUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-base-content/50 hover:text-error/70 transition-colors"
                title="Support this project"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
                <span className="hidden sm:inline">Support</span>
              </a>
            )}
            {!isLoginPage && (
              <Link to="/login">
                <Button variant="ghost" size="sm">Sign In</Button>
              </Link>
            )}
            {!isRegisterPage && (
              <Link to="/register">
                <Button variant="primary" size="sm">Get Started</Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default PublicNavbar;
