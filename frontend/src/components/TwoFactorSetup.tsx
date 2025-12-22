import React, { useState } from 'react';
import Button from './Button';
import BackupCodesDisplay from './BackupCodesDisplay';
import { twoFactorService, type TwoFactorSetupResult } from '@/services/twoFactorService';

interface TwoFactorSetupProps {
  onComplete: () => void;
  onCancel: () => void;
}

type SetupStep = 'init' | 'verify' | 'backup';

export const TwoFactorSetup: React.FC<TwoFactorSetupProps> = ({ onComplete, onCancel }) => {
  const [step, setStep] = useState<SetupStep>('init');
  const [setupData, setSetupData] = useState<TwoFactorSetupResult | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleInitSetup = async () => {
    setIsLoading(true);
    setError('');

    try {
      const data = await twoFactorService.initSetup();
      setSetupData(data);
      setStep('verify');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to initialize 2FA setup');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async () => {
    if (verificationCode.length !== 6) {
      setError('Please enter a 6-digit code');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const codes = await twoFactorService.completeSetup(verificationCode);
      setBackupCodes(codes);
      setStep('backup');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Invalid verification code');
    } finally {
      setIsLoading(false);
    }
  };

  const handleComplete = () => {
    onComplete();
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Step Indicator */}
      <div className="flex items-center justify-center gap-2">
        {['init', 'verify', 'backup'].map((s, index) => (
          <React.Fragment key={s}>
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                step === s
                  ? 'bg-neutral text-base-100'
                  : ['init', 'verify', 'backup'].indexOf(step) > index
                  ? 'bg-success text-success-content'
                  : 'bg-base-300 text-base-content/60'
              }`}
            >
              {['init', 'verify', 'backup'].indexOf(step) > index ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                index + 1
              )}
            </div>
            {index < 2 && (
              <div
                className={`w-12 h-1 rounded ${
                  ['init', 'verify', 'backup'].indexOf(step) > index ? 'bg-success' : 'bg-base-300'
                }`}
              />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-start gap-3 bg-error/10 border border-error/20 rounded-xl p-4">
          <svg className="w-5 h-5 text-error flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-error text-sm font-medium">{error}</span>
        </div>
      )}

      {/* Step 1: Initialize */}
      {step === 'init' && (
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-neutral/10 rounded-2xl flex items-center justify-center">
            <svg className="w-8 h-8 text-neutral" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-neutral mb-2">Enable Two-Factor Authentication</h3>
          <p className="text-sm text-base-content/60 mb-6">
            Add an extra layer of security to your account by requiring a code from your authenticator app when you sign in.
          </p>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={handleInitSetup} loading={isLoading}>
              Get Started
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Scan QR Code and Verify */}
      {step === 'verify' && setupData && (
        <div>
          <h3 className="text-lg font-semibold text-neutral mb-4 text-center">Scan QR Code</h3>

          <div className="flex flex-col items-center gap-4 mb-6">
            <div className="p-4 bg-white rounded-xl border border-base-300">
              <img
                src={setupData.qrCodeDataUrl}
                alt="2FA QR Code"
                className="w-48 h-48"
              />
            </div>

            <div className="text-center">
              <p className="text-sm text-base-content/60 mb-2">
                Scan this QR code with your authenticator app
              </p>
              <p className="text-xs text-base-content/40">
                (Google Authenticator, Authy, 1Password, etc.)
              </p>
            </div>
          </div>

          <div className="p-4 bg-base-200 rounded-xl mb-6">
            <p className="text-xs text-base-content/60 mb-2 font-medium">
              Can't scan? Enter this key manually:
            </p>
            <code className="text-sm font-mono text-neutral break-all">
              {setupData.manualEntryKey}
            </code>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-semibold text-neutral mb-2">
              Enter the 6-digit code from your app
            </label>
            <input
              type="text"
              value={verificationCode}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                setVerificationCode(value);
              }}
              placeholder="000000"
              className="input-docuseal text-center text-2xl tracking-widest font-mono"
              maxLength={6}
              autoFocus
            />
          </div>

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              onClick={handleVerify}
              loading={isLoading}
              disabled={verificationCode.length !== 6}
            >
              Verify & Enable
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Backup Codes */}
      {step === 'backup' && (
        <div>
          <div className="text-center mb-6">
            <div className="w-16 h-16 mx-auto mb-4 bg-success/10 rounded-2xl flex items-center justify-center">
              <svg className="w-8 h-8 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-neutral mb-2">Two-Factor Authentication Enabled!</h3>
            <p className="text-sm text-base-content/60">
              Save these backup codes in a secure place. You can use them to access your account if you lose your device.
            </p>
          </div>

          <BackupCodesDisplay codes={backupCodes} />

          <div className="flex justify-end mt-6">
            <Button onClick={handleComplete}>
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TwoFactorSetup;
