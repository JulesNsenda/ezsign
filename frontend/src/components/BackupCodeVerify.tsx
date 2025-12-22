import React, { useState } from 'react';
import Button from './Button';

interface BackupCodeVerifyProps {
  onVerify: (code: string) => Promise<void>;
  onCancel: () => void;
  onUseTOTP: () => void;
  isLoading?: boolean;
  error?: string;
}

export const BackupCodeVerify: React.FC<BackupCodeVerifyProps> = ({
  onVerify,
  onCancel,
  onUseTOTP,
  isLoading = false,
  error,
}) => {
  const [code, setCode] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedCode = code.trim().toUpperCase();
    if (normalizedCode) {
      onVerify(normalizedCode);
    }
  };

  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="text-center mb-6">
        <div className="w-16 h-16 mx-auto mb-4 bg-warning/10 rounded-2xl flex items-center justify-center">
          <svg className="w-8 h-8 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        </div>
        <h2 className="text-2xl font-semibold text-neutral mb-2">Use Backup Code</h2>
        <p className="text-base-content/60 text-sm">
          Enter one of your backup codes to sign in
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-3 mb-6 bg-error/10 border border-error/20 rounded-xl p-4">
          <svg className="w-5 h-5 text-error flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-error text-sm font-medium">{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="mb-6">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="XXXX-XXXX"
            className="input-docuseal text-center text-xl tracking-wider font-mono uppercase"
            autoFocus
            disabled={isLoading}
          />
          <p className="text-xs text-base-content/60 mt-2 text-center">
            Backup codes are case-insensitive
          </p>
        </div>

        <Button
          type="submit"
          fullWidth
          size="lg"
          loading={isLoading}
          disabled={!code.trim()}
        >
          Verify Backup Code
        </Button>
      </form>

      <div className="mt-6 text-center">
        <button
          type="button"
          onClick={onUseTOTP}
          className="text-sm text-neutral hover:text-neutral/80 transition-colors font-medium hover:underline underline-offset-4"
        >
          Use authenticator app instead
        </button>
      </div>

      <div className="mt-4 text-center">
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-base-content/60 hover:text-base-content transition-colors"
        >
          Back to login
        </button>
      </div>
    </div>
  );
};

export default BackupCodeVerify;
