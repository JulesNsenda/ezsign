import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Professional footer component
 */

export const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-base-100 border-t border-base-300 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          {/* Left side - Copyright */}
          <div className="text-sm text-base-content/60">
            © {currentYear} EzSign. All rights reserved.
          </div>

          {/* Right side - Links */}
          <div className="flex items-center gap-6">
            <Link
              to="/privacy"
              className="text-sm text-base-content/60 hover:text-neutral transition-colors"
            >
              Privacy Policy
            </Link>
            <Link
              to="/terms"
              className="text-sm text-base-content/60 hover:text-neutral transition-colors"
            >
              Terms of Service
            </Link>
            <Link
              to="/contact"
              className="text-sm text-base-content/60 hover:text-neutral transition-colors"
            >
              Contact
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
