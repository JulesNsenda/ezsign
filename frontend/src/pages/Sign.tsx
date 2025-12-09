import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import PdfViewer from '@/components/PdfViewer';
import SignaturePad from '@/components/SignaturePad';
import RadioFieldInput from '@/components/RadioFieldInput';
import Modal from '@/components/Modal';
import Button from '@/components/Button';
import { useSigningSession, useSubmitSignatures } from '@/hooks/useSignature';
import { useToast } from '@/hooks/useToast';
import signatureService, { type SignatureData } from '@/services/signatureService';
import type { SignatureType, RadioOption } from '@/types';

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

  const { data: session, isLoading, error } = useSigningSession(token!);
  const submitSignaturesMutation = useSubmitSignatures();

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
    } catch (err: any) {
      showError(err.response?.data?.error?.message || 'Failed to submit signatures');
    }
  };

  return (
    <div className="min-h-screen bg-base-200">
      {/* Header */}
      <div className="bg-base-100 border-b border-base-300 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
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
                  className="h-full bg-gradient-to-r from-success to-success/80 transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
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

                        const isRadioField = field.type === 'radio';
                        const radioLabel = isRadioField && field.properties?.options
                          ? (field.properties.options as RadioOption[]).find(
                              (opt) => opt.value === sig.text_value
                            )?.label || sig.text_value
                          : null;

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
                            {isRadioField ? (
                              <div className="flex items-center gap-2 px-2">
                                <span className="text-blue-600 font-bold">✓</span>
                                <span className="text-sm font-medium text-blue-800 truncate">
                                  {radioLabel}
                                </span>
                              </div>
                            ) : (
                              <img
                                src={sig.signature_data}
                                alt="Signature"
                                className="max-w-full max-h-full object-contain"
                              />
                            )}
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

      {/* Signature Modal */}
      <Modal
        isOpen={isSignatureModalOpen}
        onClose={() => setIsSignatureModalOpen(false)}
        title={currentField?.type === 'radio' ? 'Select Option' : `Sign ${currentField?.type || 'Field'}`}
        width="500px"
      >
        {currentField?.type === 'radio' ? (
          <RadioFieldInput
            options={(currentField.properties?.options as RadioOption[]) || []}
            orientation={currentField.properties?.orientation as 'horizontal' | 'vertical' || 'vertical'}
            onSave={handleRadioSelection}
            onCancel={() => setIsSignatureModalOpen(false)}
            fieldName={`radio-${currentField.id}`}
          />
        ) : (
          <SignaturePad
            onSave={handleSignField}
            onCancel={() => setIsSignatureModalOpen(false)}
          />
        )}
      </Modal>
    </div>
  );
};

export default Sign;
