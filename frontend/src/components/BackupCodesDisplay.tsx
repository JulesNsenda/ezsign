import React, { useState } from 'react';
import Button from './Button';

interface BackupCodesDisplayProps {
  codes: string[];
  onRegenerate?: () => void;
  isRegenerating?: boolean;
}

export const BackupCodesDisplay: React.FC<BackupCodesDisplayProps> = ({
  codes,
  onRegenerate,
  isRegenerating = false,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const text = codes.join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const text = `EzSign Backup Codes\n${'='.repeat(30)}\n\nStore these codes in a secure place. Each code can only be used once.\n\n${codes.join('\n')}\n\nGenerated: ${new Date().toLocaleString()}`;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ezsign-backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="p-4 bg-warning/10 border border-warning/30 rounded-xl mb-4">
        <div className="flex gap-3">
          <svg className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <p className="font-semibold text-neutral mb-1">Important: Save these codes!</p>
            <p className="text-sm text-base-content/70">
              Each backup code can only be used once. Store them securely - you won't see them again.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 p-4 bg-base-200 rounded-xl mb-4">
        {codes.map((code, index) => (
          <div
            key={index}
            className="font-mono text-sm text-center py-2 px-3 bg-base-100 rounded-lg border border-base-300"
          >
            {code}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopy}
          icon={
            copied ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )
          }
        >
          {copied ? 'Copied!' : 'Copy All'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownload}
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          }
        >
          Download
        </Button>
        {onRegenerate && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRegenerate}
            loading={isRegenerating}
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            }
          >
            Regenerate
          </Button>
        )}
      </div>
    </div>
  );
};

export default BackupCodesDisplay;
