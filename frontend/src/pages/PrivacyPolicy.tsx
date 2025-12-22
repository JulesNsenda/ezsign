import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Privacy Policy page
 */
export const PrivacyPolicy: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-base-200 via-base-200 to-base-300">
      {/* Header */}
      <header className="bg-base-100 border-b border-base-300 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-neutral hover:text-neutral/80 transition-colors">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-neutral to-neutral/80 text-base-100 flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </div>
            <span className="font-bold text-lg">EzSign</span>
          </Link>
          <Link to="/login" className="text-sm font-medium text-neutral hover:text-neutral/80 transition-colors">
            Sign In
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-base-100 rounded-2xl shadow-sm border border-base-300 p-8 md:p-12">
          <h1 className="text-3xl font-bold text-neutral mb-2">Privacy Policy</h1>
          <p className="text-sm text-base-content/60 mb-8">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

          <div className="prose prose-neutral max-w-none">
            <h2 className="text-xl font-semibold text-neutral mt-8 mb-4">1. Introduction</h2>
            <p className="text-base-content/80 mb-4">
              Welcome to EzSign. We respect your privacy and are committed to protecting your personal data.
              This privacy policy explains how we collect, use, and safeguard your information when you use our
              document signing platform.
            </p>

            <h2 className="text-xl font-semibold text-neutral mt-8 mb-4">2. Information We Collect</h2>
            <p className="text-base-content/80 mb-4">We collect information that you provide directly to us, including:</p>
            <ul className="list-disc pl-6 text-base-content/80 mb-4 space-y-2">
              <li>Account information (name, email address, password)</li>
              <li>Documents you upload for signing</li>
              <li>Signature data and signing activity</li>
              <li>Communication preferences</li>
            </ul>

            <h2 className="text-xl font-semibold text-neutral mt-8 mb-4">3. How We Use Your Information</h2>
            <p className="text-base-content/80 mb-4">We use the information we collect to:</p>
            <ul className="list-disc pl-6 text-base-content/80 mb-4 space-y-2">
              <li>Provide, maintain, and improve our services</li>
              <li>Process and complete document signing transactions</li>
              <li>Send you technical notices and support messages</li>
              <li>Respond to your comments and questions</li>
              <li>Protect against fraudulent or illegal activity</li>
            </ul>

            <h2 className="text-xl font-semibold text-neutral mt-8 mb-4">4. Data Security</h2>
            <p className="text-base-content/80 mb-4">
              We implement appropriate security measures to protect your personal information against unauthorized
              access, alteration, disclosure, or destruction. This includes encryption of data in transit and at rest,
              secure authentication mechanisms, and regular security audits.
            </p>

            <h2 className="text-xl font-semibold text-neutral mt-8 mb-4">5. Data Retention</h2>
            <p className="text-base-content/80 mb-4">
              We retain your personal data only for as long as necessary to fulfill the purposes for which it was
              collected, including to satisfy legal, accounting, or reporting requirements. Signed documents are
              retained according to your account settings and applicable legal requirements.
            </p>

            <h2 className="text-xl font-semibold text-neutral mt-8 mb-4">6. Your Rights</h2>
            <p className="text-base-content/80 mb-4">You have the right to:</p>
            <ul className="list-disc pl-6 text-base-content/80 mb-4 space-y-2">
              <li>Access your personal data</li>
              <li>Correct inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Export your data in a portable format</li>
              <li>Opt out of marketing communications</li>
            </ul>

            <h2 className="text-xl font-semibold text-neutral mt-8 mb-4">7. Cookies</h2>
            <p className="text-base-content/80 mb-4">
              We use essential cookies to maintain your session and provide core functionality. We do not use
              tracking cookies for advertising purposes.
            </p>

            <h2 className="text-xl font-semibold text-neutral mt-8 mb-4">8. Changes to This Policy</h2>
            <p className="text-base-content/80 mb-4">
              We may update this privacy policy from time to time. We will notify you of any changes by posting
              the new policy on this page and updating the "Last updated" date.
            </p>

            <h2 className="text-xl font-semibold text-neutral mt-8 mb-4">9. Contact Us</h2>
            <p className="text-base-content/80 mb-4">
              If you have any questions about this privacy policy or our data practices, please contact us at{' '}
              <Link to="/contact" className="text-primary hover:underline">our contact page</Link>.
            </p>
          </div>
        </div>

        {/* Footer Links */}
        <div className="mt-8 text-center text-sm text-base-content/60">
          <Link to="/terms" className="hover:text-neutral transition-colors">Terms of Service</Link>
          <span className="mx-3">|</span>
          <Link to="/contact" className="hover:text-neutral transition-colors">Contact</Link>
        </div>
      </main>
    </div>
  );
};

export default PrivacyPolicy;
