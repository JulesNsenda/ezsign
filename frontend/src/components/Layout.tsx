import React, { useState, useEffect } from 'react';
import Header from './Header';
import Sidebar from './Sidebar';
import Footer from './Footer';

/**
 * Professional responsive layout with collapsible sidebar and footer
 */

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Load collapsed state from localStorage
  useEffect(() => {
    const savedState = localStorage.getItem('sidebarCollapsed');
    if (savedState !== null) {
      setIsSidebarCollapsed(savedState === 'true');
    }
  }, []);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const closeSidebar = () => {
    setIsSidebarOpen(false);
  };

  const toggleSidebarCollapse = () => {
    const newState = !isSidebarCollapsed;
    setIsSidebarCollapsed(newState);
    localStorage.setItem('sidebarCollapsed', String(newState));
  };

  return (
    <div className="flex flex-col h-screen bg-base-200">
      {/* Skip Links for keyboard navigation */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100000] focus:px-4 focus:py-2 focus:bg-neutral focus:text-base-100 focus:rounded-lg focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-accent"
      >
        Skip to main content
      </a>
      <a
        href="#sidebar-nav"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-48 focus:z-[100000] focus:px-4 focus:py-2 focus:bg-neutral focus:text-base-100 focus:rounded-lg focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-accent"
      >
        Skip to navigation
      </a>

      <Header onMenuToggle={toggleSidebar} />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          isOpen={isSidebarOpen}
          onClose={closeSidebar}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={toggleSidebarCollapse}
        />

        <main
          id="main-content"
          className="flex-1 overflow-auto bg-base-200 lg:ml-0 flex flex-col"
          tabIndex={-1}
        >
          <div className="animate-fade-in flex-1">
            {children}
          </div>
          <Footer />
        </main>
      </div>
    </div>
  );
};

export default Layout;
