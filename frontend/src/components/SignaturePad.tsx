import React, { useRef, useState, useEffect } from 'react';
import SignatureCanvas from 'signature_pad';
import Button from './Button';

/**
 * Signature pad component with drawn, typed, and uploaded signature options
 */

export type SignatureType = 'drawn' | 'typed' | 'uploaded';

export interface SignaturePadProps {
  onSave: (signatureData: string, type: SignatureType, textValue?: string, fontFamily?: string) => void;
  onCancel?: () => void;
  width?: number;
  height?: number;
}

export const SignaturePad: React.FC<SignaturePadProps> = ({
  onSave,
  onCancel,
  width = 400,
  height = 200,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const signaturePadRef = useRef<SignatureCanvas | null>(null);
  const [mode, setMode] = useState<SignatureType>('drawn');
  const [typedText, setTypedText] = useState('');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);

  useEffect(() => {
    if (canvasRef.current && mode === 'drawn') {
      signaturePadRef.current = new SignatureCanvas(canvasRef.current, {
        backgroundColor: 'white',
        penColor: 'black',
      });
    }

    return () => {
      signaturePadRef.current?.off();
    };
  }, [mode]);

  const handleClear = () => {
    if (mode === 'drawn') {
      signaturePadRef.current?.clear();
    } else if (mode === 'typed') {
      setTypedText('');
    } else if (mode === 'uploaded') {
      setUploadedImage(null);
    }
  };

  const handleSave = () => {
    let signatureData = '';
    let textValue: string | undefined;
    let fontFamily: string | undefined;

    if (mode === 'drawn') {
      if (signaturePadRef.current?.isEmpty()) {
        alert('Please provide a signature');
        return;
      }
      signatureData = signaturePadRef.current?.toDataURL() || '';
    } else if (mode === 'typed') {
      if (!typedText.trim()) {
        alert('Please type your name');
        return;
      }
      // Create a canvas with typed text
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      const font = '"Brush Script MT", cursive';
      if (ctx) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = 'black';
        ctx.font = `36px ${font}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(typedText, width / 2, height / 2);
      }
      signatureData = canvas.toDataURL();
      textValue = typedText;
      fontFamily = font;
    } else if (mode === 'uploaded') {
      if (!uploadedImage) {
        alert('Please upload a signature image');
        return;
      }
      signatureData = uploadedImage;
    }

    onSave(signatureData, mode, textValue, fontFamily);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        alert('Please upload an image file');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        setUploadedImage(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Mode Selector */}
      <div className="flex gap-2 pb-3 border-b border-base-300">
        <button
          onClick={() => setMode('drawn')}
          className={`
            px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200
            ${mode === 'drawn'
              ? 'bg-accent text-white shadow-sm'
              : 'bg-base-200 text-base-content hover:bg-base-300'
            }
          `}
        >
          <span className="flex items-center gap-2">
            <span>✍️</span>
            <span>Draw</span>
          </span>
        </button>
        <button
          onClick={() => setMode('typed')}
          className={`
            px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200
            ${mode === 'typed'
              ? 'bg-accent text-white shadow-sm'
              : 'bg-base-200 text-base-content hover:bg-base-300'
            }
          `}
        >
          <span className="flex items-center gap-2">
            <span>📝</span>
            <span>Type</span>
          </span>
        </button>
        <button
          onClick={() => setMode('uploaded')}
          className={`
            px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200
            ${mode === 'uploaded'
              ? 'bg-accent text-white shadow-sm'
              : 'bg-base-200 text-base-content hover:bg-base-300'
            }
          `}
        >
          <span className="flex items-center gap-2">
            <span>📤</span>
            <span>Upload</span>
          </span>
        </button>
      </div>

      {/* Signature Input Area */}
      <div className="border-2 border-base-300 rounded-lg bg-base-100 overflow-hidden shadow-sm">
        {mode === 'drawn' && (
          <canvas
            ref={canvasRef}
            width={width}
            height={height}
            className="block touch-none"
          />
        )}

        {mode === 'typed' && (
          <div
            className="flex items-center justify-center p-4"
            style={{ width: `${width}px`, height: `${height}px` }}
          >
            <input
              type="text"
              value={typedText}
              onChange={(e) => setTypedText(e.target.value)}
              placeholder="Type your name"
              className="w-full text-center text-4xl bg-transparent border-none outline-none focus:ring-0"
              style={{ fontFamily: '"Brush Script MT", cursive' }}
            />
          </div>
        )}

        {mode === 'uploaded' && (
          <div
            className="flex flex-col items-center justify-center gap-4 p-4"
            style={{ width: `${width}px`, height: `${height}px` }}
          >
            {uploadedImage ? (
              <img
                src={uploadedImage}
                alt="Uploaded signature"
                className="max-w-full max-h-full object-contain"
              />
            ) : (
              <>
                <div className="text-6xl">📤</div>
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <span className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent text-white rounded-lg font-medium text-sm hover:bg-accent/90 transition-all duration-200 shadow-sm">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    Choose File
                  </span>
                </label>
                <div className="text-xs text-base-content/60">
                  Upload PNG or JPG image
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 justify-end pt-2">
        <Button variant="outline" size="md" onClick={handleClear}>
          Clear
        </Button>
        {onCancel && (
          <Button variant="outline" size="md" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button variant="primary" size="md" onClick={handleSave}>
          Save Signature
        </Button>
      </div>
    </div>
  );
};

export default SignaturePad;
