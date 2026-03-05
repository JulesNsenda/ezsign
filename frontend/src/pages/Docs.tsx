import React from 'react';
import { Link } from 'react-router-dom';
import PublicNavbar from '@/components/PublicNavbar';

/**
 * Public documentation page — user guide for EzSign
 */

const sections = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    content: [
      {
        title: 'Create an Account',
        text: 'Visit the registration page and sign up with your email. You\'ll receive a verification email — click the link to confirm your account. A personal team is automatically created for you.',
      },
      {
        title: 'Upload a Document',
        text: 'From the Dashboard, click "Upload Document". Select a PDF file from your computer. The document opens in the preparation view where you can add fields.',
      },
      {
        title: 'Add Signature Fields',
        text: 'In the preparation view, drag and drop fields onto the document pages. Available field types include: signature, text, date, checkbox, radio buttons, and dropdown menus.',
      },
    ],
  },
  {
    id: 'signing-workflows',
    title: 'Signing Workflows',
    content: [
      {
        title: 'Single Signer',
        text: 'The simplest workflow — one person signs the document. Add a signer by email, assign fields to them, and send.',
      },
      {
        title: 'Sequential Signing',
        text: 'Multiple signers sign in a specific order. Each signer receives their invitation only after the previous signer completes. Use this for approval chains.',
      },
      {
        title: 'Parallel Signing',
        text: 'Multiple signers can sign simultaneously in any order. All signers receive their invitation at the same time. Use this when signatures are independent.',
      },
    ],
  },
  {
    id: 'sending-documents',
    title: 'Sending Documents',
    content: [
      {
        title: 'Add Signers',
        text: 'In the preparation view, add signers by entering their email addresses. Each signer needs at least one field assigned to them.',
      },
      {
        title: 'Assign Fields',
        text: 'Click on a field to assign it to a signer. Color coding helps you see which fields belong to which signer.',
      },
      {
        title: 'Send for Signing',
        text: 'Once all fields are assigned, click "Send". Each signer receives an email with a unique, secure link to sign the document. No account is required to sign.',
      },
      {
        title: 'Schedule Sending',
        text: 'You can schedule a document to be sent at a future date and time. The system will automatically send the signing invitations at the scheduled time.',
      },
    ],
  },
  {
    id: 'signing-a-document',
    title: 'Signing a Document',
    content: [
      {
        title: 'Open the Signing Link',
        text: 'Signers receive an email with a secure link. Clicking it opens the document in the browser — no account or download needed.',
      },
      {
        title: 'Complete Your Fields',
        text: 'Fill in all required fields. For signatures, you can draw with your mouse/finger, type your name (auto-generates a signature), or upload an image.',
      },
      {
        title: 'Submit',
        text: 'Once all required fields are filled, click "Submit". Your signature is applied to the document and the next signer is notified (if sequential).',
      },
    ],
  },
  {
    id: 'templates',
    title: 'Templates',
    content: [
      {
        title: 'Create a Template',
        text: 'Save any prepared document as a template. Templates preserve the document, all fields, and their positions — ready to reuse.',
      },
      {
        title: 'Use a Template',
        text: 'Create a new document from a template with one click. Add signers and send — no need to set up fields again.',
      },
      {
        title: 'Share with Your Team',
        text: 'Templates can be shared with your team. Any team member can create documents from shared templates.',
      },
    ],
  },
  {
    id: 'teams',
    title: 'Teams & Collaboration',
    content: [
      {
        title: 'Create a Team',
        text: 'Go to Settings to create a team. Invite members by email — they\'ll receive an invitation link to join.',
      },
      {
        title: 'Roles',
        text: 'Team members can have different roles: Owner (full control), Admin (manage members and settings), or Member (access shared documents and templates).',
      },
      {
        title: 'Shared Documents',
        text: 'Documents created under a team are visible to all team members. Use teams to collaborate on contracts, HR forms, and other shared workflows.',
      },
    ],
  },
  {
    id: 'security',
    title: 'Security',
    content: [
      {
        title: 'Two-Factor Authentication',
        text: 'Enable 2FA in Settings for an extra layer of security. EzSign supports TOTP authenticator apps and backup codes.',
      },
      {
        title: 'Audit Trail',
        text: 'Every document has a complete audit trail recording who signed what, when, and from which IP address. The audit trail is embedded in the completed PDF.',
      },
      {
        title: 'API Keys',
        text: 'Generate API keys in Settings to integrate EzSign with your applications. Keys support scoped permissions — grant only the access your integration needs.',
      },
    ],
  },
  {
    id: 'webhooks',
    title: 'Webhooks',
    content: [
      {
        title: 'Set Up Webhooks',
        text: 'Webhooks notify your systems when events happen — document sent, signed, completed, or cancelled. Configure them in Settings.',
      },
      {
        title: 'Events',
        text: 'Subscribe to specific events: document.sent, document.signed, document.completed, document.cancelled. Each webhook delivery includes event data and an HMAC signature for verification.',
      },
      {
        title: 'Retry Logic',
        text: 'Failed webhook deliveries are automatically retried with exponential backoff. Check delivery logs in Settings to troubleshoot.',
      },
    ],
  },
];

export const Docs: React.FC = () => {
  return (
    <div className="min-h-screen bg-base-100">
      <PublicNavbar />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold text-neutral mb-4">Documentation</h1>
          <p className="text-lg text-base-content/60">
            Learn how to use EzSign to send, sign, and manage documents.
          </p>
          <div className="mt-4 text-sm text-base-content/50">
            Looking for the API? Check the{' '}
            <Link to="/api-reference" className="text-info hover:underline font-medium">API Reference</Link>.
          </div>
        </div>

        {/* Table of Contents */}
        <nav className="mb-12 bg-base-200/50 rounded-xl border border-base-300/50 p-6">
          <h2 className="text-sm font-semibold text-neutral uppercase tracking-wider mb-3">On this page</h2>
          <ul className="space-y-2">
            {sections.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="text-sm text-base-content/60 hover:text-neutral transition-colors"
                >
                  {section.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* Sections */}
        <div className="space-y-16">
          {sections.map((section) => (
            <section key={section.id} id={section.id}>
              <h2 className="text-2xl font-bold text-neutral mb-6 pb-3 border-b border-base-300/50">
                {section.title}
              </h2>
              <div className="space-y-6">
                {section.content.map((item) => (
                  <div key={item.title}>
                    <h3 className="text-lg font-semibold text-neutral mb-2">{item.title}</h3>
                    <p className="text-base-content/70 leading-relaxed">{item.text}</p>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-base-300/50 text-center text-sm text-base-content/50">
          <p>
            Need help?{' '}
            <Link to="/contact" className="text-info hover:underline">Contact us</Link>
            {' | '}
            <Link to="/api-reference" className="text-info hover:underline">API Reference</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Docs;
