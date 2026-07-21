import React from 'react';
import { Link } from 'react-router-dom';
import { useDefaultBranding } from '@/hooks/useBranding';
import Button from '@/components/Button';
import PublicNavbar from '@/components/PublicNavbar';

/**
 * Public landing page for unauthenticated visitors
 */

const features = [
  {
    title: 'Upload & Prepare',
    description:
      'Upload any PDF, drag and drop signature fields, text boxes, dates, and checkboxes exactly where you need them.',
    iconClass: 'bg-info/10 text-info',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
        />
      </svg>
    ),
  },
  {
    title: 'Send for Signing',
    description:
      'Invite signers via email. Support for single, sequential, and parallel signing workflows to fit any process.',
    iconClass: 'bg-accent/20 text-accent',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
        />
      </svg>
    ),
  },
  {
    title: 'Sign Anywhere',
    description:
      'Signers draw, type, or upload their signature from any device. No account required to sign.',
    iconClass: 'bg-secondary/20 text-secondary',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
        />
      </svg>
    ),
  },
  {
    title: 'Track & Complete',
    description:
      'Real-time status tracking, email notifications, and a full audit trail for every document.',
    iconClass: 'bg-success/10 text-success',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  },
  {
    title: 'Templates',
    description:
      'Save frequently used documents as templates. Create new documents from templates in seconds.',
    iconClass: 'bg-info/10 text-info',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
        />
      </svg>
    ),
  },
  {
    title: 'Team Collaboration',
    description:
      'Create teams, invite members, and share documents. Role-based access keeps everything organized.',
    iconClass: 'bg-accent/20 text-accent',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
        />
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
    description:
      'Track progress in real time. Download the completed document with full audit trail.',
  },
];

const stats = [
  { value: '100%', label: 'Open source & self-hosted' },
  { value: '$0', label: 'Per-document fees' },
  { value: '3', label: 'Signing workflows' },
  { value: '∞', label: 'Documents & signers' },
];

const securityPoints = ['Audit trail', 'Two-factor auth', 'Encrypted API keys', 'Open source'];

const CheckIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

/** Stylized document preview shown in the hero — pure CSS/SVG, no image assets */
const HeroDocumentPreview: React.FC = () => (
  <div className="relative mx-auto max-w-md lg:max-w-none" aria-hidden="true">
    <div className="absolute -top-10 -right-8 w-64 h-64 bg-accent/20 rounded-full blur-3xl" />
    <div className="absolute -bottom-12 -left-10 w-72 h-72 bg-secondary/20 rounded-full blur-3xl" />

    {/* Document card */}
    <div className="relative bg-base-100 rounded-2xl border border-base-300/60 shadow-xl p-6 sm:p-8">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-error/10 text-error flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="h-2.5 w-32 bg-base-300 rounded-full mb-2" />
            <div className="h-2 w-20 bg-base-300/70 rounded-full" />
          </div>
        </div>
        <span className="text-xs font-medium bg-accent/20 text-accent rounded-full px-3 py-1 whitespace-nowrap">
          Awaiting signature
        </span>
      </div>

      <div className="space-y-2.5 mb-6">
        <div className="h-2 bg-base-300/70 rounded-full w-full" />
        <div className="h-2 bg-base-300/70 rounded-full w-11/12" />
        <div className="h-2 bg-base-300/70 rounded-full w-4/5" />
        <div className="h-2 bg-base-300/70 rounded-full w-full" />
        <div className="h-2 bg-base-300/70 rounded-full w-2/3" />
      </div>

      {/* Signature field */}
      <div className="rounded-lg border-2 border-dashed border-info/40 bg-info/5 px-4 py-3 flex items-end justify-between gap-4 mb-6">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-info mb-1">
            Signature
          </div>
          <svg
            className="w-28 h-8 text-neutral"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 120 40"
          >
            <path
              strokeLinecap="round"
              strokeWidth={2.5}
              d="M8 30 C 18 8, 26 8, 30 22 C 33 32, 38 32, 42 20 C 46 10, 52 10, 55 20 C 58 28, 64 30, 72 24 C 80 18, 90 14, 112 18"
            />
          </svg>
        </div>
        <span className="text-xs text-base-content/40 whitespace-nowrap pb-1">Click to sign</span>
      </div>

      <div className="space-y-2.5">
        <div className="h-2 bg-base-300/70 rounded-full w-full" />
        <div className="h-2 bg-base-300/70 rounded-full w-3/4" />
      </div>
    </div>

    {/* Floating status chips */}
    <div className="absolute -top-4 -left-2 sm:-left-6 bg-base-100 rounded-xl border border-base-300/60 shadow-lg px-4 py-3 flex items-center gap-3">
      <div className="w-8 h-8 rounded-full bg-info/10 text-info flex items-center justify-center flex-shrink-0">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
      </div>
      <div>
        <p className="text-sm font-semibold text-neutral leading-tight">Sent to 3 signers</p>
        <p className="text-xs text-base-content/50">Sequential workflow</p>
      </div>
    </div>
    <div className="absolute -bottom-5 -right-2 sm:-right-6 bg-base-100 rounded-xl border border-base-300/60 shadow-lg px-4 py-3 flex items-center gap-3">
      <div className="w-8 h-8 rounded-full bg-success/10 text-success flex items-center justify-center flex-shrink-0">
        <CheckIcon />
      </div>
      <div>
        <p className="text-sm font-semibold text-neutral leading-tight">Document signed</p>
        <p className="text-xs text-base-content/50">Audit trail updated</p>
      </div>
    </div>
  </div>
);

export const Landing: React.FC = () => {
  const { data: brandingData } = useDefaultBranding();
  const branding = brandingData?.branding;

  const displayName = branding?.company_name || 'EzSign';
  const logoUrl = branding?.logo_url || null;
  const primaryColor = branding?.primary_color || '#4F46E5';
  const supportUrl = import.meta.env.VITE_SUPPORT_URL || '';

  // Note: displayName is hardcoded to 'EzSign' in PublicNavbar

  return (
    <div className="min-h-screen bg-base-100">
      <PublicNavbar />

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-base-200 via-base-200 to-base-300">
        <div
          className="absolute -top-32 right-0 w-96 h-96 bg-accent/10 rounded-full blur-3xl pointer-events-none"
          aria-hidden="true"
        />
        <div
          className="absolute -bottom-32 -left-16 w-96 h-96 bg-secondary/10 rounded-full blur-3xl pointer-events-none"
          aria-hidden="true"
        />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-28">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-12 items-center">
            <div className="text-center lg:text-left">
              <span className="inline-flex items-center gap-2 rounded-full border border-base-300/70 bg-base-100/70 px-3.5 py-1.5 text-xs font-medium text-base-content/70 backdrop-blur-sm mb-6">
                <span
                  className="w-1.5 h-1.5 rounded-full bg-success animate-pulse"
                  aria-hidden="true"
                />
                Free & open source — self-host in minutes
              </span>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-neutral tracking-tight leading-tight mb-6">
                Document signing,{' '}
                <span className="bg-gradient-to-r from-warning to-secondary bg-clip-text text-transparent">
                  made simple
                </span>
              </h1>
              <p className="text-lg sm:text-xl text-base-content/60 mb-10 leading-relaxed max-w-xl mx-auto lg:mx-0">
                Upload a PDF, add signature fields, send it for signing. No complexity, no
                per-document fees. Your documents, on your own server.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
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
              <div className="mt-8 flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-2 text-sm text-base-content/60">
                {['Free forever', 'No credit card', 'No signer accounts'].map((point) => (
                  <span key={point} className="flex items-center gap-1.5">
                    <CheckIcon className="w-4 h-4 text-success" />
                    {point}
                  </span>
                ))}
              </div>
            </div>
            <HeroDocumentPreview />
          </div>
        </div>
      </section>

      {/* Stats band */}
      <section className="border-b border-base-300/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <dl className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <dd className="text-3xl font-bold text-neutral mb-1">{stat.value}</dd>
                <dt className="text-sm text-base-content/60">{stat.label}</dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 sm:py-24 bg-base-200/40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold uppercase tracking-widest text-info mb-3">
              Features
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-neutral tracking-tight mb-4">
              Everything you need to sign documents
            </h2>
            <p className="text-lg text-base-content/60 max-w-2xl mx-auto">
              A complete document signing workflow — from upload to completed signature.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="bg-base-100 rounded-xl border border-base-300/60 shadow-sm p-6 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
              >
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${feature.iconClass}`}
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
      <section id="how-it-works" className="py-20 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold uppercase tracking-widest text-info mb-3">
              How it works
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-neutral tracking-tight mb-4">
              Three steps to a signed document
            </h2>
            <p className="text-lg text-base-content/60">
              Get documents signed in minutes, not days.
            </p>
          </div>
          <div className="relative grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-8">
            <div
              className="hidden md:block absolute top-7 left-[16.66%] right-[16.66%] border-t-2 border-dashed border-base-300"
              aria-hidden="true"
            />
            {steps.map((step) => (
              <div key={step.number} className="relative text-center">
                <div className="w-14 h-14 rounded-2xl bg-neutral text-base-100 font-bold text-xl flex items-center justify-center mx-auto mb-5 shadow-sm relative z-10">
                  {step.number}
                </div>
                <h3 className="text-lg font-semibold text-neutral mb-2">{step.title}</h3>
                <p className="text-base-content/60 leading-relaxed max-w-xs mx-auto">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security */}
      <section className="py-20 sm:py-24 bg-base-200/40">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-success/10 flex items-center justify-center mx-auto mb-6">
            <svg
              className="w-8 h-8 text-success"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-neutral tracking-tight mb-4">
            Secure by design
          </h2>
          <p className="text-lg text-base-content/60 max-w-2xl mx-auto mb-10 leading-relaxed">
            Every document gets a complete audit trail. Passwords are hashed with Argon2, API access
            is encrypted, and two-factor authentication is built in. Your documents stay private —
            only you and your signers can access them.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {securityPoints.map((point) => (
              <span
                key={point}
                className="inline-flex items-center gap-1.5 rounded-full bg-success/10 text-success px-4 py-1.5 text-sm font-medium"
              >
                <CheckIcon />
                {point}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-neutral px-6 py-16 sm:px-16 sm:py-20 text-center">
            <div
              className="absolute -top-24 -left-16 w-72 h-72 bg-secondary/20 rounded-full blur-3xl pointer-events-none"
              aria-hidden="true"
            />
            <div
              className="absolute -bottom-24 -right-16 w-72 h-72 bg-accent/20 rounded-full blur-3xl pointer-events-none"
              aria-hidden="true"
            />
            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-bold text-base-100 tracking-tight mb-4">
                Ready to get documents signed?
              </h2>
              <p className="text-lg text-base-100/70 mb-8 max-w-2xl mx-auto">
                Create your free account and send your first document for signing in minutes.
              </p>
              <Link
                to="/register"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-base-100 px-10 py-3 text-lg font-medium text-neutral shadow-sm transition-all duration-200 hover:shadow-md hover:bg-base-100/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-base-100/50"
              >
                Get Started for Free
              </Link>
              <p className="text-sm text-base-100/50 mt-6">No credit card required. Free to use.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-base-300/50 py-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-8">
            <div className="flex items-center gap-3">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={`${displayName} logo`}
                  className="h-7 w-auto object-contain"
                />
              ) : (
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-base-100"
                  style={{ backgroundColor: primaryColor }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                    />
                  </svg>
                </div>
              )}
              <div>
                <p className="text-sm font-semibold text-neutral leading-tight">{displayName}</p>
                <p className="text-xs text-base-content/50">Document signing, made simple.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-base-content/50">
              <Link to="/docs" className="hover:text-neutral transition-colors">
                Documentation
              </Link>
              <Link to="/privacy" className="hover:text-neutral transition-colors">
                Privacy
              </Link>
              <Link to="/terms" className="hover:text-neutral transition-colors">
                Terms
              </Link>
              <Link to="/contact" className="hover:text-neutral transition-colors">
                Contact
              </Link>
              {supportUrl && (
                <a
                  href={supportUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 hover:text-error/70 transition-colors"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
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
          <div className="border-t border-base-300/40 pt-6 text-center md:text-left">
            <p className="text-sm text-base-content/50">
              &copy; {new Date().getFullYear()} {displayName}. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
