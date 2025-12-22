import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Terms of Service page
 */
export const TermsOfService: React.FC = () => {
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
          <h1 className="text-3xl font-bold text-neutral mb-2">Terms of Service</h1>
          <p className="text-sm text-base-content/60 mb-8">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

          <div className="prose prose-neutral max-w-none">
            <h2 className="text-xl font-semibold text-neutral mt-8 mb-4">1. Acceptance of Terms</h2>
            <p className="text-base-content/80 mb-4">
              By accessing or using EzSign, you agree to be bound by these Terms of Service. If you do not
              agree to these terms, please do not use our services.
            </p>

            <h2 className="text-xl font-semibold text-neutral mt-8 mb-4">2. Description of Service</h2>
            <p className="text-base-content/80 mb-4">
              EzSign provides an electronic document signing platform that enables users to upload, prepare,
              send, and sign documents electronically. Our services include document management, signature
              collection, and audit trail generation.
            </p>

            <h2 className="text-xl font-semibold text-neutral mt-8 mb-4">3. User Accounts</h2>
            <p className="text-base-content/80 mb-4">You agree to:</p>
            <ul className="list-disc pl-6 text-base-content/80 mb-4 space-y-2">
              <li>Provide accurate and complete registration information</li>
              <li>Maintain the security of your account credentials</li>
              <li>Notify us immediately of any unauthorized use</li>
              <li>Accept responsibility for all activities under your account</li>
            </ul>

            <h2 className="text-xl font-semibold text-neutral mt-8 mb-4">4. Acceptable Use</h2>
            <p className="text-base-content/80 mb-4">You agree not to:</p>
            <ul className="list-disc pl-6 text-base-content/80 mb-4 space-y-2">
              <li>Use the service for any unlawful purpose</li>
              <li>Upload malicious content or malware</li>
              <li>Attempt to gain unauthorized access to our systems</li>
              <li>Interfere with or disrupt the service</li>
              <li>Violate any applicable laws or regulations</li>
            </ul>

            <h2 className="text-xl font-semibold text-neutral mt-8 mb-4">5. Electronic Signatures</h2>
            <p className="text-base-content/80 mb-4">
              By using EzSign to sign documents electronically, you acknowledge that electronic signatures
              created through our platform are legally binding to the extent permitted by applicable law.
              You are responsible for ensuring that electronic signatures are appropriate for your specific
              use case and jurisdiction.
            </p>

            <h2 className="text-xl font-semibold text-neutral mt-8 mb-4">6. Intellectual Property</h2>
            <p className="text-base-content/80 mb-4">
              The EzSign platform, including its design, features, and content, is protected by intellectual
              property laws. You retain ownership of documents you upload, but grant us a limited license
              to process them for providing our services.
            </p>

            <h2 className="text-xl font-semibold text-neutral mt-8 mb-4">7. Limitation of Liability</h2>
            <p className="text-base-content/80 mb-4">
              To the maximum extent permitted by law, EzSign shall not be liable for any indirect, incidental,
              special, consequential, or punitive damages arising from your use of the service. Our total
              liability shall not exceed the amount you paid for the service in the past twelve months.
            </p>

            <h2 className="text-xl font-semibold text-neutral mt-8 mb-4">8. Disclaimer of Warranties</h2>
            <p className="text-base-content/80 mb-4">
              The service is provided "as is" without warranties of any kind, either express or implied,
              including but not limited to warranties of merchantability, fitness for a particular purpose,
              and non-infringement.
            </p>

            <h2 className="text-xl font-semibold text-neutral mt-8 mb-4">9. Termination</h2>
            <p className="text-base-content/80 mb-4">
              We may suspend or terminate your account at any time for violation of these terms or for any
              other reason at our discretion. Upon termination, your right to use the service will immediately
              cease.
            </p>

            <h2 className="text-xl font-semibold text-neutral mt-8 mb-4">10. Changes to Terms</h2>
            <p className="text-base-content/80 mb-4">
              We reserve the right to modify these terms at any time. We will notify you of significant
              changes by posting a notice on our website or sending you an email. Continued use of the
              service after changes constitutes acceptance of the new terms.
            </p>

            <h2 className="text-xl font-semibold text-neutral mt-8 mb-4">11. Governing Law</h2>
            <p className="text-base-content/80 mb-4">
              These terms shall be governed by and construed in accordance with applicable laws, without
              regard to conflict of law principles.
            </p>

            <h2 className="text-xl font-semibold text-neutral mt-8 mb-4">12. Contact</h2>
            <p className="text-base-content/80 mb-4">
              For questions about these Terms of Service, please visit our{' '}
              <Link to="/contact" className="text-primary hover:underline">contact page</Link>.
            </p>
          </div>
        </div>

        {/* Footer Links */}
        <div className="mt-8 text-center text-sm text-base-content/60">
          <Link to="/privacy" className="hover:text-neutral transition-colors">Privacy Policy</Link>
          <span className="mx-3">|</span>
          <Link to="/contact" className="hover:text-neutral transition-colors">Contact</Link>
        </div>
      </main>
    </div>
  );
};

export default TermsOfService;
