import React, { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/contexts/ThemeContext';
import { useNavigate } from 'react-router-dom';

/**
 * Professional header component with mobile menu support
 */

interface HeaderProps {
  onMenuToggle?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onMenuToggle }) => {
  const { user, logout } = useAuth();
  const { resolvedTheme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <header className="bg-base-100 border-b border-base-300 sticky top-0 z-30 shadow-sm">
      <div className="flex justify-between items-center px-4 lg:px-6 py-4">
        <div className="flex items-center gap-4">
          {/* Mobile menu button */}
          <button
            onClick={onMenuToggle}
            className="lg:hidden p-2 rounded-lg hover:bg-base-200 transition-colors"
            aria-label="Toggle menu"
          >
            <svg className="w-6 h-6 text-base-content" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="text-2xl font-bold text-neutral">
            EzSign
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Theme toggle button */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg bg-base-200 hover:bg-base-300 border border-base-300 transition-all duration-200 hover:shadow-md"
            aria-label={`Switch to ${resolvedTheme === 'light' ? 'dark' : 'light'} mode`}
            title={`Switch to ${resolvedTheme === 'light' ? 'dark' : 'light'} mode`}
          >
            {resolvedTheme === 'light' ? (
              <svg className="w-5 h-5 text-base-content" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-base-content" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            )}
          </button>

          {/* User menu */}
          <div className="relative">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="flex items-center gap-2 px-3 py-2 bg-base-200 hover:bg-base-300 border border-base-300 rounded-full transition-all duration-200 hover:shadow-md"
            >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-neutral to-neutral/80 text-base-100 flex items-center justify-center font-semibold text-sm shadow-sm">
              {user?.email?.[0]?.toUpperCase() || 'U'}
            </div>
            <span className="hidden sm:inline text-base-content text-sm font-medium max-w-[150px] truncate">
              {user?.email}
            </span>
            <svg
              className={`w-4 h-4 text-base-content/60 transition-transform duration-200 ${isMenuOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {isMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsMenuOpen(false)}
              />
              <div className="absolute top-full right-0 mt-2 bg-base-100 border border-base-300 rounded-xl shadow-xl min-w-[220px] z-50 animate-slide-down overflow-hidden">
                <div className="px-4 py-3 border-b border-base-300 bg-base-200/30">
                  <div className="text-sm font-semibold text-base-content">
                    {user?.email}
                  </div>
                  <div className="text-xs text-base-content/60 capitalize mt-1 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-success"></span>
                    {user?.role}
                  </div>
                </div>

                <button
                  onClick={handleLogout}
                  className="w-full px-4 py-3 text-left text-sm hover:bg-base-200 transition-all duration-200 text-error font-medium flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Logout
                </button>
              </div>
            </>
          )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
