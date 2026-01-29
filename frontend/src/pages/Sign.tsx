import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import PdfViewer from '@/components/PdfViewer';
import SignaturePad from '@/components/SignaturePad';
import RadioFieldInput from '@/components/RadioFieldInput';
import DropdownFieldInput from '@/components/DropdownFieldInput';
import TextFieldInput from '@/components/TextFieldInput';
import TextareaFieldInput from '@/components/TextareaFieldInput';
import DateFieldInput from '@/components/DateFieldInput';
import CheckboxFieldInput from '@/components/CheckboxFieldInput';
import CalculatedFieldInput from '@/components/CalculatedFieldInput';
import Modal from '@/components/Modal';
import Button from '@/components/Button';
import { useSigningSession, useSubmitSignatures } from '@/hooks/useSignature';
import { usePublicBranding } from '@/hooks/useBranding';
import { useToast } from '@/hooks/useToast';
import signatureService, { type SignatureData } from '@/services/signatureService';
import { brandingService } from '@/services/brandingService';
import type { SignatureType, RadioOption, ValidationConfig, CalculationConfig, Field } from '@/types';
import {
  parseEmbedConfig,
  createEventEmitter,
  createCommandListener,
  applyEmbedTheme,
  type EmbedConfig,
  type EzSignCommand,
} from '@/services/embedMessaging';

/**
 * Signing page for signers to review and sign documents
 */

export const Sign: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const { error: showError, warning: showWarning } = useToast();

  const [currentPage, setCurrentPage] = useState(0);
  const [currentFieldIndex, setCurrentFieldIndex] = useState<number>(0);
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string>('');
  const [isCompleted, setIsCompleted] = useState(false);
  const [collectedSignatures, setCollectedSignatures] = useState<SignatureData[]>([]);
  const [totalPages] = useState(1); // Will be updated by PdfViewer if available

  // Parse embed configuration from URL
  const embedConfig = useMemo<EmbedConfig>(() => parseEmbedConfig(), []);
  const isEmbedded = embedConfig.isEmbedded;

  // Create event emitter for PostMessage communication
  const eventEmitterRef = useRef<ReturnType<typeof createEventEmitter> | null>(null);

  const { data: session, isLoading, error } = useSigningSession(token!);
  const submitSignaturesMutation = useSubmitSignatures();

  // Fetch team branding if document has a team
  const teamId = session?.document?.team_id;
  const { data: brandingData } = usePublicBranding(teamId || undefined);
  const branding = brandingData?.branding;

  // Apply branding colors as CSS custom properties
  useEffect(() => {
    if (branding && !isEmbedded) {
      // Only apply branding if not in embedded mode (embedded mode has its own theme)
      document.documentElement.style.setProperty('--branding-primary', branding.primary_color);
      document.documentElement.style.setProperty('--branding-secondary', branding.secondary_color);
      if (branding.accent_color) {
        document.documentElement.style.setProperty('--branding-accent', branding.accent_color);
      }
    }
    return () => {
      // Cleanup
      document.documentElement.style.removeProperty('--branding-primary');
      document.documentElement.style.removeProperty('--branding-secondary');
      document.documentElement.style.removeProperty('--branding-accent');
    };
  }, [branding, isEmbedded]);

  // Get branding display values
  const displayName = branding?.company_name || 'EzSign';
  const logoUrl = teamId && branding?.logo_url ? brandingService.getLogoUrl(teamId) : null;
  const showPoweredBy = branding?.show_powered_by ?? true;

  // Initialize event emitter when session is loaded
  useEffect(() => {
    if (session && isEmbedded) {
      eventEmitterRef.current = createEventEmitter(
        session.document.id,
        embedConfig.allowedOrigin
      );
    }
  }, [session, isEmbedded, embedConfig.allowedOrigin]);

  // Apply embed theme customization
  useEffect(() => {
    if (isEmbedded) {
      applyEmbedTheme(embedConfig);
    }
  }, [isEmbedded, embedConfig]);

  // Handle scroll to field command
  const scrollToFieldById = useCallback((fieldId: string) => {
    // This will be called by the command handler
    // Find field in unsignedFields and navigate to it
    const fieldElement = document.querySelector(`[data-field-id="${fieldId}"]`);
    if (fieldElement) {
      fieldElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  // Set up command listener for embedded mode
  useEffect(() => {
    if (!isEmbedded) return;

    const handleCommand = (command: EzSignCommand) => {
      switch (command.type) {
        case 'ezsign:getStatus':
          eventEmitterRef.current?.emitReady(
            session?.signer.id,
            session?.signer.email
          );
          break;
        case 'ezsign:scrollToField':
          if (command.payload?.fieldId) {
            scrollToFieldById(command.payload.fieldId);
          }
          break;
        case 'ezsign:setTheme':
          if (command.payload?.theme) {
            document.documentElement.setAttribute('data-theme', command.payload.theme);
          }
          if (command.payload?.primaryColor) {
            document.documentElement.style.setProperty('--embed-primary', command.payload.primaryColor);
          }
          break;
      }
    };

    const cleanup = createCommandListener(embedConfig.allowedOrigin, handleCommand);
    return cleanup;
  }, [isEmbedded, embedConfig.allowedOrigin, session, scrollToFieldById]);

  // Emit ready event when session is loaded
  useEffect(() => {
    if (session && isEmbedded && eventEmitterRef.current) {
      eventEmitterRef.current.emitReady(session.signer.id, session.signer.email);
    }
  }, [session, isEmbedded]);

  // Emit page change events
  useEffect(() => {
    if (isEmbedded && eventEmitterRef.current) {
      eventEmitterRef.current.emitPageChange(currentPage + 1, totalPages);
    }
  }, [currentPage, totalPages, isEmbedded]);

  // Emit progress updates
  useEffect(() => {
    if (isEmbedded && eventEmitterRef.current && session) {
      const total = session.fields?.length || 0;
      const completed = (session.signatures?.length || 0) + collectedSignatures.length;
      eventEmitterRef.current.emitProgress(completed, total);
    }
  }, [session, collectedSignatures, isEmbedded]);

  // Load PDF URL - MUST be before any conditional returns
  useEffect(() => {
    if (token) {
      setPdfUrl(signatureService.getDownloadUrl(token));
    }
  }, [token]);

  // Jump to current field's page - MUST be before any conditional returns
  useEffect(() => {
    if (session && session.fields && session.signatures) {
      const unsignedFields = session.fields.filter(
        (field) =>
          !session.signatures.some((sig) => sig.field_id === field.id) &&
          !collectedSignatures.some((sig) => sig.field_id === field.id) &&
          (!field.signer_email || field.signer_email === session.signer.email)
      );
      const currentField = unsignedFields[currentFieldIndex];
      if (currentField && currentField.page >= 0) {
        setCurrentPage(currentField.page);
      } else if (session.fields.length > 0 && session.fields[0].page >= 0) {
        setCurrentPage(session.fields[0].page);
      }
    }
  }, [session, currentFieldIndex, collectedSignatures]);

  // Calculate all memoized values BEFORE any conditional returns (React hooks rules)
  const fields = session?.fields || [];
  const signatures = session?.signatures || [];

  const signerFields = useMemo(() => {
    if (!session) return [];
    return fields.filter(
      (field) => !field.signer_email || field.signer_email === session.signer.email
    );
  }, [fields, session]);

  const requiredFields = useMemo(() => {
    return signerFields.filter((field) => field.required);
  }, [signerFields]);

  const completedRequiredFields = useMemo(() => {
    return requiredFields.filter(
      (field) =>
        signatures.some((sig) => sig.field_id === field.id) ||
        collectedSignatures.some((sig) => sig.field_id === field.id)
    );
  }, [requiredFields, signatures, collectedSignatures]);

  const incompleteRequiredFields = useMemo(() => {
    return requiredFields.filter(
      (field) =>
        !signatures.some((sig) => sig.field_id === field.id) &&
        !collectedSignatures.some((sig) => sig.field_id === field.id)
    );
  }, [requiredFields, signatures, collectedSignatures]);

  const allRequiredComplete = incompleteRequiredFields.length === 0;
  const requiredProgress = requiredFields.length > 0
    ? Math.round((completedRequiredFields.length / requiredFields.length) * 100)
    : 100;

  // Create a map of field values for calculated fields
  const fieldValuesMap = useMemo(() => {
    const valuesMap = new Map<string, string | number | boolean | null>();

    // Add values from already saved signatures
    for (const sig of signatures) {
      if (sig.text_value !== undefined && sig.text_value !== null) {
        valuesMap.set(sig.field_id, sig.text_value);
      } else if (sig.checkbox_value !== undefined) {
        valuesMap.set(sig.field_id, sig.checkbox_value);
      }
    }

    // Add values from collected signatures (not yet submitted)
    for (const sig of collectedSignatures) {
      if (sig.text_value !== undefined && sig.text_value !== null) {
        valuesMap.set(sig.field_id, sig.text_value);
      } else if (sig.checkbox_value !== undefined) {
        valuesMap.set(sig.field_id, sig.checkbox_value);
      }
    }

    return valuesMap;
  }, [signatures, collectedSignatures]);

  // NOW we can do conditional returns after all hooks are called
  if (isLoading) {
    return (
      <div className="min-h-screen bg-base-200 flex items-center justify-center">
        <div className="text-center">
          <div className="loading loading-spinner loading-lg text-neutral mb-4"></div>
          <div className="text-lg text-base-content/60">Loading document...</div>
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen bg-base-200 flex items-center justify-center p-4">
        <div className="card-docuseal max-w-md text-center animate-fade-in">
          <div className="w-20 h-20 mx-auto mb-6 bg-error/10 rounded-full flex items-center justify-center">
            <svg className="w-10 h-10 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-neutral mb-3">Invalid or Expired Link</h1>
          <p className="text-base-content/60 leading-relaxed">
            This signing link is no longer valid. Please contact the document sender for a new link.
          </p>
        </div>
      </div>
    );
  }

  if (isCompleted || session.signer.status === 'signed') {
    // For embedded mode, show minimal success state
    if (isEmbedded) {
      return (
        <div className="min-h-screen bg-base-200 flex items-center justify-center p-4">
          <div className="text-center animate-fade-in">
            <div className="w-16 h-16 mx-auto mb-4 bg-success/10 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-neutral mb-2">Successfully Signed!</h1>
            <p className="text-sm text-base-content/60">
              Document signed. You may close this window.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-base-200 flex items-center justify-center p-4">
        <div className="card-docuseal max-w-xl text-center animate-fade-in">
          <div className="w-24 h-24 mx-auto mb-6 bg-success/10 rounded-full flex items-center justify-center">
            <svg className="w-12 h-12 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-neutral mb-4">Successfully Signed!</h1>
          <p className="text-base-content/60 mb-6 leading-relaxed">
            Thank you for signing <span className="font-semibold text-neutral">"{session.document.title}"</span>.
            You will receive a confirmation email shortly.
          </p>
          <Button
            variant="primary"
            size="lg"
            onClick={() => {
              window.location.href = signatureService.getDownloadUrl(token!);
            }}
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            }
          >
            Download Signed Document
          </Button>
        </div>
      </div>
    );
  }

  if (session.signer.status === 'declined') {
    return (
      <div className="min-h-screen bg-base-200 flex items-center justify-center p-4">
        <div className="card-docuseal max-w-md text-center animate-fade-in">
          <div className="w-20 h-20 mx-auto mb-6 bg-warning/10 rounded-full flex items-center justify-center">
            <svg className="w-10 h-10 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-neutral mb-3">Document Declined</h1>
          <p className="text-base-content/60 leading-relaxed">
            You have declined to sign this document.
          </p>
        </div>
      </div>
    );
  }

  // Calculate derived values (non-hook) after conditional returns
  const unsignedFields = fields.filter(
    (field) =>
      !signatures.some((sig) => sig.field_id === field.id) &&
      !collectedSignatures.some((sig) => sig.field_id === field.id) &&
      (!field.signer_email || field.signer_email === session.signer.email)
  );

  const currentField = unsignedFields[currentFieldIndex];
  const totalSigned = signatures.length + collectedSignatures.length;
  const progress = fields.length > 0 ? ((totalSigned / fields.length) * 100).toFixed(0) : '0';

  const handleNavigateToField = (index: number) => {
    if (index >= 0 && index < unsignedFields.length) {
      setCurrentFieldIndex(index);
      const field = unsignedFields[index];
      if (field) {
        setCurrentPage(field.page);
      }
    }
  };

  const handleNextField = () => {
    if (currentFieldIndex < unsignedFields.length - 1) {
      const nextIndex = currentFieldIndex + 1;
      setCurrentFieldIndex(nextIndex);
      const nextField = unsignedFields[nextIndex];
      if (nextField) {
        setCurrentPage(nextField.page);
      }
    }
  };

  const handlePrevField = () => {
    if (currentFieldIndex > 0) {
      const prevIndex = currentFieldIndex - 1;
      setCurrentFieldIndex(prevIndex);
      const prevField = unsignedFields[prevIndex];
      if (prevField) {
        setCurrentPage(prevField.page);
      }
    }
  };

  const handleSignField = (
    signatureData: string,
    signatureType: SignatureType,
    textValue?: string,
    fontFamily?: string
  ) => {
    if (!currentField) return;

    const newSignature: SignatureData = {
      field_id: currentField.id,
      signature_type: signatureType,
      signature_data: signatureData,
      ...(textValue && { text_value: textValue }),
      ...(fontFamily && { font_family: fontFamily }),
    };

    setCollectedSignatures([...collectedSignatures, newSignature]);
    setIsSignatureModalOpen(false);

    // Auto-advance to next field if there are more
    if (currentFieldIndex < unsignedFields.length - 1) {
      setTimeout(() => handleNextField(), 300);
    }
  };

  const handleRadioSelection = (selectedValue: string) => {
    if (!currentField) return;

    // For radio fields, we store the selected value as text_value
    // and create a placeholder signature_data
    const newSignature: SignatureData = {
      field_id: currentField.id,
      signature_type: 'typed' as SignatureType,
      signature_data: `radio:${selectedValue}`, // Marker for radio selection
      text_value: selectedValue,
    };

    setCollectedSignatures([...collectedSignatures, newSignature]);
    setIsSignatureModalOpen(false);

    // Auto-advance to next field if there are more
    if (currentFieldIndex < unsignedFields.length - 1) {
      setTimeout(() => handleNextField(), 300);
    }
  };

  const handleDropdownSelection = (selectedValue: string) => {
    if (!currentField) return;

    // For dropdown fields, we store the selected value as text_value
    // and create a placeholder signature_data
    const newSignature: SignatureData = {
      field_id: currentField.id,
      signature_type: 'typed' as SignatureType,
      signature_data: `dropdown:${selectedValue}`, // Marker for dropdown selection
      text_value: selectedValue,
    };

    setCollectedSignatures([...collectedSignatures, newSignature]);
    setIsSignatureModalOpen(false);

    // Auto-advance to next field if there are more
    if (currentFieldIndex < unsignedFields.length - 1) {
      setTimeout(() => handleNextField(), 300);
    }
  };

  const handleTextareaInput = (value: string) => {
    if (!currentField) return;

    // For textarea fields, we store the multi-line text as text_value
    const newSignature: SignatureData = {
      field_id: currentField.id,
      signature_type: 'typed' as SignatureType,
      signature_data: `textarea:${value}`, // Marker for textarea input
      text_value: value,
    };

    setCollectedSignatures([...collectedSignatures, newSignature]);
    setIsSignatureModalOpen(false);

    // Auto-advance to next field if there are more
    if (currentFieldIndex < unsignedFields.length - 1) {
      setTimeout(() => handleNextField(), 300);
    }
  };

  const handleTextInput = (value: string) => {
    if (!currentField) return;

    const newSignature: SignatureData = {
      field_id: currentField.id,
      signature_type: 'typed' as SignatureType,
      signature_data: `text:${value}`,
      text_value: value,
    };

    setCollectedSignatures([...collectedSignatures, newSignature]);
    setIsSignatureModalOpen(false);

    if (currentFieldIndex < unsignedFields.length - 1) {
      setTimeout(() => handleNextField(), 300);
    }
  };

  const handleDateInput = (_value: string, formattedValue: string) => {
    if (!currentField) return;

    const newSignature: SignatureData = {
      field_id: currentField.id,
      signature_type: 'typed' as SignatureType,
      signature_data: `date:${formattedValue}`,
      text_value: formattedValue,
    };

    setCollectedSignatures([...collectedSignatures, newSignature]);
    setIsSignatureModalOpen(false);

    if (currentFieldIndex < unsignedFields.length - 1) {
      setTimeout(() => handleNextField(), 300);
    }
  };

  const handleCheckboxInput = (checked: boolean) => {
    if (!currentField) return;

    const newSignature: SignatureData = {
      field_id: currentField.id,
      signature_type: 'typed' as SignatureType,
      signature_data: `checkbox:${checked ? 'true' : 'false'}`,
      text_value: checked ? 'checked' : 'unchecked',
    };

    setCollectedSignatures([...collectedSignatures, newSignature]);
    setIsSignatureModalOpen(false);

    if (currentFieldIndex < unsignedFields.length - 1) {
      setTimeout(() => handleNextField(), 300);
    }
  };

  const handleCalculatedInput = (value: string | number | null) => {
    if (!currentField) return;

    const stringValue = value !== null && value !== undefined ? String(value) : '';

    const newSignature: SignatureData = {
      field_id: currentField.id,
      signature_type: 'typed' as SignatureType,
      signature_data: `calculated:${stringValue}`,
      text_value: stringValue,
    };

    setCollectedSignatures([...collectedSignatures, newSignature]);
    setIsSignatureModalOpen(false);

    if (currentFieldIndex < unsignedFields.length - 1) {
      setTimeout(() => handleNextField(), 300);
    }
  };

  // Helper to navigate to a specific field by ID
  const navigateToFieldById = (fieldId: string) => {
    const fieldIndex = unsignedFields.findIndex((f) => f.id === fieldId);
    if (fieldIndex >= 0) {
      setCurrentFieldIndex(fieldIndex);
      const field = unsignedFields[fieldIndex];
      if (field) {
        setCurrentPage(field.page);
      }
    }
  };

  const handleSubmitAllSignatures = async () => {
    if (!token) return;

    // Block submission if required fields are incomplete
    if (!allRequiredComplete) {
      const remainingCount = incompleteRequiredFields.length;
      showWarning(
        `Please complete all required fields. ${remainingCount} required field${remainingCount > 1 ? 's' : ''} remaining.`
      );
      // Navigate to first incomplete required field
      if (incompleteRequiredFields.length > 0) {
        navigateToFieldById(incompleteRequiredFields[0].id);
      }
      return;
    }

    if (collectedSignatures.length === 0) return;

    try {
      await submitSignaturesMutation.mutateAsync({ token, signatures: collectedSignatures });
      setIsCompleted(true);

      // Emit signed event for embedded mode
      if (isEmbedded && eventEmitterRef.current && session) {
        eventEmitterRef.current.emitSigned(session.signer.id);
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.error?.message || 'Failed to submit signatures';
      showError(errorMessage);

      // Emit error event for embedded mode
      if (isEmbedded && eventEmitterRef.current) {
        eventEmitterRef.current.emitError(errorMessage, 'SUBMIT_ERROR');
      }
    }
  };

  // Render the appropriate input component based on field type
  const renderFieldInput = () => {
    if (!currentField) return null;

    // Handle calculated fields - show read-only calculated value
    if (currentField.calculation) {
      return (
        <CalculatedFieldInput
          calculation={currentField.calculation as CalculationConfig}
          fields={fields as Field[]}
          fieldValues={fieldValuesMap}
          onSave={handleCalculatedInput}
          onClose={() => setIsSignatureModalOpen(false)}
        />
      );
    }

    switch (currentField.type) {
      case 'signature':
      case 'initials':
        return (
          <SignaturePad
            onSave={handleSignField}
            onCancel={() => setIsSignatureModalOpen(false)}
          />
        );

      case 'text':
        return (
          <TextFieldInput
            onSave={handleTextInput}
            onCancel={() => setIsSignatureModalOpen(false)}
            placeholder={currentField.properties?.placeholder as string || 'Enter text...'}
            maxLength={currentField.properties?.maxLength as number || 255}
            validation={currentField.properties?.validation as ValidationConfig | undefined}
          />
        );

      case 'date':
        return (
          <DateFieldInput
            onSave={handleDateInput}
            onCancel={() => setIsSignatureModalOpen(false)}
            dateFormat={currentField.properties?.dateFormat as string || 'MM/DD/YYYY'}
          />
        );

      case 'checkbox':
        return (
          <CheckboxFieldInput
            onSave={handleCheckboxInput}
            onCancel={() => setIsSignatureModalOpen(false)}
            label={currentField.properties?.label as string || 'I confirm this selection'}
          />
        );

      case 'radio':
        return (
          <RadioFieldInput
            options={(currentField.properties?.options as RadioOption[]) || []}
            orientation={currentField.properties?.orientation as 'horizontal' | 'vertical' || 'vertical'}
            onSave={handleRadioSelection}
            onCancel={() => setIsSignatureModalOpen(false)}
            fieldName={`radio-${currentField.id}`}
          />
        );

      case 'dropdown':
        return (
          <DropdownFieldInput
            options={(currentField.properties?.options as RadioOption[]) || []}
            placeholder={currentField.properties?.placeholder as string || 'Select an option'}
            onSave={handleDropdownSelection}
            onCancel={() => setIsSignatureModalOpen(false)}
            fieldName={`dropdown-${currentField.id}`}
          />
        );

      case 'textarea':
        return (
          <TextareaFieldInput
            placeholder={currentField.properties?.placeholder as string || 'Enter your text here...'}
            maxLength={currentField.properties?.maxLength as number || 1000}
            rows={currentField.properties?.rows as number || 4}
            onSave={handleTextareaInput}
            onCancel={() => setIsSignatureModalOpen(false)}
            validation={currentField.properties?.validation as ValidationConfig | undefined}
          />
        );

      default:
        return (
          <div className="text-center p-4">
            <p className="text-base-content/60">Unknown field type: {currentField.type}</p>
          </div>
        );
    }
  };

  return (
    <div className={`min-h-screen bg-base-200 ${isEmbedded ? 'embedded-mode' : ''}`}>
      {/* Header - Hidden in embedded mode */}
      {!isEmbedded && (
        <div className="bg-base-100 border-b border-base-300 shadow-sm sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            {/* Branding header with logo */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt={displayName}
                    className="h-8 object-contain"
                  />
                ) : (
                  <div
                    className="px-3 py-1 rounded font-bold text-white text-sm"
                    style={{ backgroundColor: branding?.primary_color || '#4F46E5' }}
                  >
                    {displayName}
                  </div>
                )}
                {branding?.tagline && (
                  <span className="text-sm text-base-content/50 hidden sm:inline">{branding.tagline}</span>
                )}
              </div>
              {showPoweredBy && !branding?.hide_ezsign_branding && (
                <span className="text-xs text-base-content/40">
                  Powered by {displayName}
                </span>
              )}
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="flex-1">
                <h1 className="text-xl sm:text-2xl font-bold text-neutral mb-1">
                  {session.document.title}
                </h1>
                <div className="flex items-center gap-2 text-sm text-base-content/60">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span>{session.signer.name}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-sm text-base-content/60">
                  <span className="font-semibold text-neutral">{totalSigned}</span> of{' '}
                  <span className="font-semibold text-neutral">{fields.length}</span> signed
                </div>
                <div className="w-32 h-2 bg-base-300 rounded-full overflow-hidden">
                  <div
                    className="h-full transition-all duration-500"
                    style={{
                      width: `${progress}%`,
                      backgroundColor: branding?.secondary_color || '#10B981',
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Compact header for embedded mode */}
      {isEmbedded && !embedConfig.hideProgress && (
        <div className="bg-base-100 border-b border-base-300 px-3 py-2 sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-neutral truncate max-w-[50%]">
              {session.document.title}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-base-content/60">
                {totalSigned}/{fields.length}
              </span>
              <div className="w-16 h-1.5 bg-base-300 rounded-full overflow-hidden">
                <div
                  className="h-full bg-success transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className={isEmbedded ? 'p-2 sm:p-3' : 'p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto'}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
          {/* PDF Viewer */}
          <div className="lg:col-span-2 order-2 lg:order-1">
            {pdfUrl && currentPage >= 0 ? (
              <div className="card-docuseal p-2 sm:p-4 animate-fade-in">
                <PdfViewer
                  fileUrl={pdfUrl}
                  currentPage={currentPage + 1}
                  onPageChange={(page) => setCurrentPage(page - 1)}
                  width={700}
                >
                  {() => (
                    <div className="absolute inset-0 pointer-events-none">
                      {/* Highlight current field with pulse animation */}
                      {currentField && currentField.page === currentPage && (
                        <div
                          className="absolute rounded-lg animate-pulse"
                          style={{
                            left: `${currentField.x}px`,
                            top: `${currentField.y}px`,
                            width: `${currentField.width}px`,
                            height: `${currentField.height}px`,
                            backgroundColor: 'rgba(238, 175, 58, 0.25)',
                            border: '3px solid rgba(238, 175, 58, 1)',
                            boxShadow: '0 0 0 4px rgba(238, 175, 58, 0.1)',
                          }}
                        >
                          <div className="absolute -top-7 left-0 bg-accent text-white text-xs font-bold px-2 py-1 rounded-md shadow-lg">
                            Sign Here
                          </div>
                        </div>
                      )}

                      {/* Show completed signatures from session */}
                      {signatures.map((sig) => {
                        const field = fields.find((f) => f.id === sig.field_id);
                        if (!field || field.page !== currentPage) return null;

                        return (
                          <div
                            key={sig.id}
                            className="absolute rounded-lg flex items-center justify-center"
                            style={{
                              left: `${field.x}px`,
                              top: `${field.y}px`,
                              width: `${field.width}px`,
                              height: `${field.height}px`,
                              backgroundColor: 'rgba(16, 185, 129, 0.15)',
                              border: '2px solid rgba(16, 185, 129, 1)',
                            }}
                          >
                            <img
                              src={sig.signature_data}
                              alt="Signature"
                              className="max-w-full max-h-full object-contain"
                            />
                          </div>
                        );
                      })}

                      {/* Show collected signatures (not yet submitted) */}
                      {collectedSignatures.map((sig, idx) => {
                        const field = fields.find((f) => f.id === sig.field_id);
                        if (!field || field.page !== currentPage) return null;

                        // Get display content based on field type
                        const renderFieldContent = () => {
                          switch (field.type) {
                            case 'radio': {
                              const radioLabel = field.properties?.options
                                ? (field.properties.options as RadioOption[]).find(
                                    (opt) => opt.value === sig.text_value
                                  )?.label || sig.text_value
                                : sig.text_value;
                              return (
                                <div className="flex items-center gap-2 px-2">
                                  <span className="text-blue-600 font-bold">●</span>
                                  <span className="text-sm font-medium text-blue-800 truncate">
                                    {radioLabel}
                                  </span>
                                </div>
                              );
                            }
                            case 'dropdown': {
                              const dropdownLabel = field.properties?.options
                                ? (field.properties.options as RadioOption[]).find(
                                    (opt) => opt.value === sig.text_value
                                  )?.label || sig.text_value
                                : sig.text_value;
                              return (
                                <div className="flex items-center gap-2 px-2">
                                  <span className="text-cyan-600 font-bold">▼</span>
                                  <span className="text-sm font-medium text-cyan-800 truncate">
                                    {dropdownLabel}
                                  </span>
                                </div>
                              );
                            }
                            case 'textarea':
                              return (
                                <div className="px-2 text-center overflow-hidden">
                                  <span className="text-xs font-medium text-purple-800 line-clamp-3 whitespace-pre-wrap">
                                    {sig.text_value}
                                  </span>
                                </div>
                              );
                            case 'text':
                              return (
                                <div className="px-2 text-center">
                                  <span className="text-sm font-medium text-blue-800 truncate">
                                    {sig.text_value}
                                  </span>
                                </div>
                              );
                            case 'date':
                              return (
                                <div className="px-2 text-center">
                                  <span className="text-sm font-medium text-blue-800">
                                    {sig.text_value}
                                  </span>
                                </div>
                              );
                            case 'checkbox':
                              return (
                                <div className="flex items-center justify-center">
                                  {sig.text_value === 'checked' ? (
                                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                  ) : (
                                    <span className="text-blue-400 text-xs">—</span>
                                  )}
                                </div>
                              );
                            case 'signature':
                            case 'initials':
                            default:
                              return (
                                <img
                                  src={sig.signature_data}
                                  alt="Signature"
                                  className="max-w-full max-h-full object-contain"
                                />
                              );
                          }
                        };

                        return (
                          <div
                            key={`collected-${idx}`}
                            className="absolute rounded-lg flex items-center justify-center border-2 border-dashed animate-fade-in"
                            style={{
                              left: `${field.x}px`,
                              top: `${field.y}px`,
                              width: `${field.width}px`,
                              height: `${field.height}px`,
                              backgroundColor: 'rgba(59, 130, 246, 0.15)',
                              borderColor: 'rgba(59, 130, 246, 1)',
                            }}
                          >
                            {renderFieldContent()}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </PdfViewer>
              </div>
            ) : (
              <div className="card-docuseal text-center p-8 bg-error/10 border-error/30">
                <div className="text-error text-lg font-semibold mb-2">Unable to load PDF</div>
                <div className="text-sm text-base-content/60">
                  {!pdfUrl ? 'PDF URL is missing' : 'Invalid page number'}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="order-1 lg:order-2">
            <div className="card-docuseal animate-fade-in sticky top-24">
              {unsignedFields.length === 0 ? (
                <div className="text-center">
                  <div className="w-20 h-20 mx-auto mb-4 bg-success/10 rounded-full flex items-center justify-center">
                    <svg className="w-10 h-10 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-neutral mb-2">All Fields Signed!</h3>
                  <p className="text-sm text-base-content/60 mb-6 leading-relaxed">
                    Click below to complete the signing process
                  </p>
                  <Button
                    variant="primary"
                    fullWidth
                    onClick={handleSubmitAllSignatures}
                    loading={submitSignaturesMutation.isPending}
                    disabled={collectedSignatures.length === 0}
                    size="lg"
                    icon={
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    }
                  >
                    Complete Signing
                  </Button>
                </div>
              ) : (
                <>
                  {/* Current Field Card */}
                  {currentField && (
                    <div className="mb-6">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-base-content/60">Current Field</h3>
                        <span className="text-xs font-medium text-accent bg-accent/10 px-2 py-1 rounded-full">
                          {currentFieldIndex + 1} of {unsignedFields.length}
                        </span>
                      </div>
                      <div className="bg-accent/5 border-2 border-accent rounded-xl p-4 mb-4">
                        <div className="flex items-start gap-3 mb-3">
                          <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center flex-shrink-0">
                            <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-neutral mb-1">
                              {currentField.type.charAt(0).toUpperCase() + currentField.type.slice(1)}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-base-content/60">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                              </svg>
                              <span>Page {currentField.page + 1}</span>
                              {currentField.required && (
                                <>
                                  <span>•</span>
                                  <span className="text-error font-medium">Required</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="primary"
                          fullWidth
                          onClick={() => setIsSignatureModalOpen(true)}
                          size="lg"
                          icon={
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          }
                        >
                          Sign This Field
                        </Button>
                      </div>

                      {/* Navigation */}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handlePrevField}
                          disabled={currentFieldIndex === 0}
                          fullWidth
                          icon={
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                          }
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleNextField}
                          disabled={currentFieldIndex >= unsignedFields.length - 1}
                          fullWidth
                          icon={
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          }
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* All Fields List */}
                  <div className="divider-docuseal"></div>
                  <div className="mb-3">
                    <h4 className="text-sm font-semibold text-base-content/60 mb-3">All Fields</h4>
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {unsignedFields.map((field, index) => (
                        <button
                          key={field.id}
                          onClick={() => handleNavigateToField(index)}
                          className={`w-full text-left p-3 rounded-lg border transition-all duration-200 ${
                            index === currentFieldIndex
                              ? 'bg-accent/10 border-accent shadow-sm'
                              : field.required
                                ? 'bg-base-100 border-error/30 hover:bg-base-200 hover:border-error/50'
                                : 'bg-base-100 border-base-300 hover:bg-base-200 hover:border-base-content/20'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold ${
                              index === currentFieldIndex ? 'bg-accent text-white' : 'bg-base-300 text-base-content/60'
                            }`}>
                              {index + 1}
                            </span>
                            <span className="text-sm font-medium text-neutral truncate flex items-center gap-1">
                              {field.type.charAt(0).toUpperCase() + field.type.slice(1)}
                              {field.required && (
                                <span className="text-error text-xs font-bold">*</span>
                              )}
                            </span>
                          </div>
                          <div className="text-xs text-base-content/50 pl-7">
                            Page {field.page + 1}
                            {field.required && (
                              <span className="ml-2 text-error/70">Required</span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Progress Summary */}
              {fields.length > 0 && (
                <>
                  <div className="divider-docuseal"></div>
                  <div>
                    <div className="flex justify-between items-center text-sm mb-2">
                      <span className="text-base-content/60 font-medium">Progress</span>
                      <span className="text-neutral font-bold">{progress}%</span>
                    </div>
                    <div className="h-3 bg-base-300 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-success to-success/80 transition-all duration-500 rounded-full"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="text-xs text-base-content/50 mt-2 text-center">
                      {totalSigned} of {fields.length} fields signed
                    </div>

                    {/* Required fields progress */}
                    {requiredFields.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-base-300">
                        <div className="flex justify-between items-center text-sm mb-2">
                          <span className="text-base-content/60 font-medium flex items-center gap-1">
                            Required
                            <span className="text-error">*</span>
                          </span>
                          <span className={`font-bold ${allRequiredComplete ? 'text-success' : 'text-error'}`}>
                            {completedRequiredFields.length} of {requiredFields.length}
                          </span>
                        </div>
                        <div className="h-2 bg-base-300 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-500 rounded-full ${
                              allRequiredComplete
                                ? 'bg-gradient-to-r from-success to-success/80'
                                : 'bg-gradient-to-r from-error to-error/80'
                            }`}
                            style={{ width: `${requiredProgress}%` }}
                          />
                        </div>
                        {!allRequiredComplete && (
                          <div className="text-xs text-error/70 mt-2 text-center">
                            {incompleteRequiredFields.length} required field{incompleteRequiredFields.length > 1 ? 's' : ''} remaining
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer with branding links - Hidden in embedded mode */}
      {!isEmbedded && (branding?.support_url || branding?.privacy_url || branding?.terms_url || branding?.support_email) && (
        <footer className="bg-base-100 border-t border-base-300 py-4 mt-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-wrap justify-center gap-4 text-sm text-base-content/60">
              {branding.support_url && (
                <a
                  href={branding.support_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-base-content transition-colors"
                >
                  Help & Support
                </a>
              )}
              {branding.support_email && (
                <a
                  href={`mailto:${branding.support_email}`}
                  className="hover:text-base-content transition-colors"
                >
                  Contact: {branding.support_email}
                </a>
              )}
              {branding.privacy_url && (
                <a
                  href={branding.privacy_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-base-content transition-colors"
                >
                  Privacy Policy
                </a>
              )}
              {branding.terms_url && (
                <a
                  href={branding.terms_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-base-content transition-colors"
                >
                  Terms of Service
                </a>
              )}
            </div>
          </div>
        </footer>
      )}

      {/* Field Input Modal */}
      <Modal
        isOpen={isSignatureModalOpen}
        onClose={() => setIsSignatureModalOpen(false)}
        title={getModalTitle(currentField?.type)}
        width="500px"
      >
        {renderFieldInput()}
      </Modal>
    </div>
  );
};

// Helper function to get modal title based on field type
const getModalTitle = (fieldType?: string): string => {
  switch (fieldType) {
    case 'signature':
      return 'Add Your Signature';
    case 'initials':
      return 'Add Your Initials';
    case 'date':
      return 'Select Date';
    case 'text':
      return 'Enter Text';
    case 'textarea':
      return 'Enter Text';
    case 'checkbox':
      return 'Confirm Checkbox';
    case 'radio':
      return 'Select Option';
    case 'dropdown':
      return 'Select from List';
    default:
      return 'Complete Field';
  }
};

export default Sign;
