import React from 'react';
import { Link } from 'react-router-dom';
import { useDefaultBranding } from '@/hooks/useBranding';
import Button from '@/components/Button';

/**
 * Public landing page for unauthenticated visitors
 */

const features = [
  {
    title: 'Upload & Prepare',
    description: 'Upload any PDF, drag and drop signature fields, text boxes, dates, and checkboxes exactly where you need them.',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>
    ),
  },
  {
    title: 'Send for Signing',
    description: 'Invite signers via email. Support for single, sequential, and parallel signing workflows to fit any process.',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    title: 'Sign Anywhere',
    description: 'Signers draw, type, or upload their signature from any device. No account required to sign.',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    ),
  },
  {
    title: 'Track & Complete',
    description: 'Real-time status tracking, email notifications, and a full audit trail for every document.',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: 'Templates',
    description: 'Save frequently used documents as templates. Create new documents from templates in seconds.',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
      </svg>
    ),
  },
  {
    title: 'Team Collaboration',
    description: 'Create teams, invite members, and share documents. Role-based access keeps everything organized.',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
];

const steps = [
  {
    number: '1',
    title: 'Upload your document',
    description: 'Upload a PDF and place signature fields, text boxes, dates, and more.',
  },
  {
    number: '2',
    title: 'Send to signers',
    description: 'Add signers by email. They receive a secure link to sign — no account needed.',
  },
  {
    number: '3',
    title: 'Get it signed',
    description: 'Track progress in real time. Download the completed document with full audit trail.',
  },
];

export const Landing: React.FC = () => {
  const { data: brandingData } = useDefaultBranding();
  const branding = brandingData?.branding;

  const displayName = branding?.company_name || 'EzSign';
  const logoUrl = branding?.logo_url || null;
  const primaryColor = branding?.primary_color || '#4F46E5';
  const supportUrl = import.meta.env.VITE_SUPPORT_URL || '';

  return (
    <div className="min-h-screen bg-base-100">
      {/* Navigation */}
      <nav className="border-b border-base-300/50 bg-base-100/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
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
            </div>
            <div className="flex items-center gap-3">
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
              <Link to="/login">
                <Button variant="ghost" size="sm">Sign In</Button>
              </Link>
              <Link to="/register">
                <Button variant="primary" size="sm">Get Started</Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-gradient-to-br from-base-200 via-base-200 to-base-300">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
          <div className="text-center max-w-3xl mx-auto">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-neutral leading-tight mb-6">
              Document signing,{' '}
              <span className="bg-gradient-to-r from-info to-info/70 bg-clip-text text-transparent">
                made simple
              </span>
            </h1>
            <p className="text-lg sm:text-xl text-base-content/60 mb-10 max-w-2xl mx-auto leading-relaxed">
              Upload a PDF, add signature fields, send it for signing. No complexity, no per-document fees.
              Free and open source.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/register">
                <Button variant="primary" size="lg" className="px-8">
                  Start Signing for Free
                </Button>
              </Link>
              <a href="#how-it-works">
                <Button variant="outline" size="lg" className="px-8">
                  See How It Works
                </Button>
              </a>
            </div>
            <p className="text-sm text-base-content/40 mt-6">
              No credit card required. Free to use.
            </p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-neutral mb-4">
              Everything you need to sign documents
            </h2>
            <p className="text-lg text-base-content/60 max-w-2xl mx-auto">
              A complete document signing workflow — from upload to completed signature.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="bg-base-100 rounded-xl border border-base-300/50 p-6 transition-all duration-200 hover:shadow-md hover:border-base-300"
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-base-100 mb-4"
                  style={{ backgroundColor: primaryColor }}
                >
                  {feature.icon}
                </div>
                <h3 className="text-lg font-semibold text-neutral mb-2">{feature.title}</h3>
                <p className="text-base-content/60 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 sm:py-24 bg-base-200/50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-neutral mb-4">
              Three steps to a signed document
            </h2>
            <p className="text-lg text-base-content/60">
              Get documents signed in minutes, not days.
            </p>
          </div>
          <div className="space-y-8">
            {steps.map((step) => (
              <div
                key={step.number}
                className="flex items-start gap-6 bg-base-100 rounded-xl border border-base-300/50 p-6"
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-base-100 font-bold text-xl flex-shrink-0"
                  style={{ backgroundColor: primaryColor }}
                >
                  {step.number}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-neutral mb-1">{step.title}</h3>
                  <p className="text-base-content/60 leading-relaxed">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security */}
      <section className="py-20 sm:py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-success/10 flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-neutral mb-4">
            Secure by design
          </h2>
          <p className="text-lg text-base-content/60 max-w-2xl mx-auto mb-10 leading-relaxed">
            Every document gets a complete audit trail. Passwords are hashed with Argon2,
            API access is encrypted, and two-factor authentication is built in.
            Your documents stay private — only you and your signers can access them.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-base-content/50">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-success" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              <span>Audit trail</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-success" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              <span>Two-factor auth</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-success" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              <span>Encrypted API keys</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-success" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              <span>Open source</span>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 sm:py-24 bg-gradient-to-br from-base-200 via-base-200 to-base-300">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-neutral mb-4">
            Ready to get documents signed?
          </h2>
          <p className="text-lg text-base-content/60 mb-8">
            Create your free account and send your first document for signing in minutes.
          </p>
          <Link to="/register">
            <Button variant="primary" size="lg" className="px-10">
              Get Started for Free
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-base-300/50 py-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              {logoUrl ? (
                <img src={logoUrl} alt={`${displayName} logo`} className="h-6 w-auto object-contain" />
              ) : (
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-base-100"
                  style={{ backgroundColor: primaryColor }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </div>
              )}
              <span className="text-sm text-base-content/50">&copy; {new Date().getFullYear()} {displayName}. All rights reserved.</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-base-content/50">
              <Link to="/privacy" className="hover:text-neutral transition-colors">Privacy</Link>
              <Link to="/terms" className="hover:text-neutral transition-colors">Terms</Link>
              <Link to="/contact" className="hover:text-neutral transition-colors">Contact</Link>
              {supportUrl && (
                <a
                  href={supportUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 hover:text-error/70 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                  Support
                </a>
              )}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
