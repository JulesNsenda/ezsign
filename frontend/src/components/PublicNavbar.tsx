import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useDefaultBranding } from '@/hooks/useBranding';
import Button from '@/components/Button';

/**
 * Shared navbar for public pages (landing, login, register, etc.)
 * Shows EzSign branding with Sign In / Get Started buttons.
 * On mobile, secondary links collapse into a hamburger menu; the primary CTA stays visible.
 */

export const PublicNavbar: React.FC = () => {
  const location = useLocation();
  const { data: brandingData } = useDefaultBranding();
  const branding = brandingData?.branding;
  const [menuOpen, setMenuOpen] = useState(false);

  const displayName = 'EzSign';
  const logoUrl = branding?.logo_url || null;
  const supportUrl = import.meta.env.VITE_SUPPORT_URL || '';

  const isLoginPage = location.pathname === '/login';
  const isRegisterPage = location.pathname === '/register';

  const closeMenu = () => setMenuOpen(false);

  return (
    <nav className="border-b border-base-300/50 bg-base-100/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3 h-16">
          <Link
            to="/"
            className="flex items-center gap-3 hover:opacity-80 transition-opacity min-w-0"
            onClick={closeMenu}
          >
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={`${displayName} logo`}
                className="h-8 w-auto object-contain"
              />
            ) : (
              <img
                src="/icon-192.png"
                alt=""
                className="w-9 h-9 rounded-xl shadow-sm ring-1 ring-base-content/10 flex-shrink-0"
              />
            )}
            <span className="text-xl font-bold text-neutral truncate">{displayName}</span>
          </Link>

          {/* Desktop navigation */}
          <div className="hidden sm:flex items-center gap-3">
            <Link
              to="/docs"
              className="text-sm text-base-content/60 hover:text-neutral transition-colors font-medium"
            >
              Documentation
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
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                  />
                </svg>
                Support
              </a>
            )}
            {!isLoginPage && (
              <Link to="/login">
                <Button variant="ghost" size="sm">
                  Sign In
                </Button>
              </Link>
            )}
            {!isRegisterPage && (
              <Link to="/register">
                <Button variant="primary" size="sm">
                  Get Started
                </Button>
              </Link>
            )}
          </div>

          {/* Mobile: primary CTA + menu toggle */}
          <div className="flex sm:hidden items-center gap-2">
            {!isRegisterPage && (
              <Link to="/register" onClick={closeMenu}>
                <Button variant="primary" size="sm">
                  Get Started
                </Button>
              </Link>
            )}
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-expanded={menuOpen}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              className="p-2 rounded-lg text-base-content/70 hover:bg-base-200 active:bg-base-300 transition-colors"
            >
              {menuOpen ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu panel */}
      {menuOpen && (
        <div className="sm:hidden border-t border-base-300/50 bg-base-100/95 backdrop-blur-sm">
          <div className="px-4 py-3 space-y-1">
            {!isLoginPage && (
              <Link
                to="/login"
                onClick={closeMenu}
                className="block px-3 py-2.5 rounded-lg text-sm font-medium text-base-content/70 hover:bg-base-200 hover:text-neutral transition-colors"
              >
                Sign In
              </Link>
            )}
            <Link
              to="/docs"
              onClick={closeMenu}
              className="block px-3 py-2.5 rounded-lg text-sm font-medium text-base-content/70 hover:bg-base-200 hover:text-neutral transition-colors"
            >
              Documentation
            </Link>
            {supportUrl && (
              <a
                href={supportUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={closeMenu}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-base-content/70 hover:bg-base-200 hover:text-error/70 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                  />
                </svg>
                Support
              </a>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};

export default PublicNavbar;
