import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import PublicNavbar from '@/components/PublicNavbar';

/**
 * Combined documentation page with Manual and API tabs
 */

type Tab = 'manual' | 'api';

/* ────────────────────────────────────────────────────────────────
   MANUAL TAB — Step-by-step illustrated user guide
   ──────────────────────────────────────────────────────────────── */

const StepNumber: React.FC<{ n: number }> = ({ n }) => (
  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-lg border-2 border-primary/20">
    {n}
  </div>
);

const Tip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex items-start gap-3 mt-4 bg-info/5 border border-info/15 rounded-xl p-4">
    <svg className="w-5 h-5 text-info flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
    <span className="text-sm text-base-content/70">{children}</span>
  </div>
);

const FieldBadge: React.FC<{ name: string; color: string }> = ({ name, color }) => (
  <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg ${color}`}>
    {name}
  </span>
);

const IllustrationBox: React.FC<{ children: React.ReactNode; caption?: string }> = ({ children, caption }) => (
  <div className="my-6 rounded-xl border border-base-300/50 bg-base-200/30 overflow-hidden">
    <div className="p-6 flex items-center justify-center min-h-[180px]">{children}</div>
    {caption && <div className="text-xs text-center text-base-content/40 border-t border-base-300/30 py-2 px-4">{caption}</div>}
  </div>
);

const WorkflowDiagram: React.FC<{ type: 'single' | 'sequential' | 'parallel' }> = ({ type }) => {
  const boxClass = 'px-4 py-2 rounded-lg text-xs font-medium border';
  if (type === 'single') {
    return (
      <div className="flex items-center gap-3">
        <div className={`${boxClass} bg-primary/10 border-primary/20 text-primary`}>You</div>
        <svg className="w-6 h-4 text-base-content/30" fill="none" stroke="currentColor" viewBox="0 0 24 16"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2 8h16m0 0l-4-4m4 4l-4 4" /></svg>
        <div className={`${boxClass} bg-success/10 border-success/20 text-success`}>Signer</div>
        <svg className="w-6 h-4 text-base-content/30" fill="none" stroke="currentColor" viewBox="0 0 24 16"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2 8h16m0 0l-4-4m4 4l-4 4" /></svg>
        <div className={`${boxClass} bg-info/10 border-info/20 text-info`}>Done</div>
      </div>
    );
  }
  if (type === 'sequential') {
    return (
      <div className="flex items-center gap-2 flex-wrap justify-center">
        <div className={`${boxClass} bg-primary/10 border-primary/20 text-primary`}>You</div>
        <svg className="w-5 h-4 text-base-content/30" fill="none" stroke="currentColor" viewBox="0 0 24 16"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2 8h16m0 0l-4-4m4 4l-4 4" /></svg>
        <div className={`${boxClass} bg-warning/10 border-warning/20 text-warning`}>Signer 1</div>
        <svg className="w-5 h-4 text-base-content/30" fill="none" stroke="currentColor" viewBox="0 0 24 16"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2 8h16m0 0l-4-4m4 4l-4 4" /></svg>
        <div className={`${boxClass} bg-success/10 border-success/20 text-success`}>Signer 2</div>
        <svg className="w-5 h-4 text-base-content/30" fill="none" stroke="currentColor" viewBox="0 0 24 16"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2 8h16m0 0l-4-4m4 4l-4 4" /></svg>
        <div className={`${boxClass} bg-error/10 border-error/20 text-error`}>Signer 3</div>
        <svg className="w-5 h-4 text-base-content/30" fill="none" stroke="currentColor" viewBox="0 0 24 16"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2 8h16m0 0l-4-4m4 4l-4 4" /></svg>
        <div className={`${boxClass} bg-info/10 border-info/20 text-info`}>Done</div>
      </div>
    );
  }
  // parallel
  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`${boxClass} bg-primary/10 border-primary/20 text-primary`}>You send</div>
      <div className="flex items-start gap-6 mt-1">
        {['Signer A', 'Signer B', 'Signer C'].map((s) => (
          <div key={s} className="flex flex-col items-center gap-1">
            <svg className="w-4 h-5 text-base-content/30" fill="none" stroke="currentColor" viewBox="0 0 16 20"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 2v16m0 0l-3-3m3 3l3-3" /></svg>
            <div className={`${boxClass} bg-success/10 border-success/20 text-success`}>{s}</div>
          </div>
        ))}
      </div>
      <div className="text-xs text-base-content/40 mt-1">All sign simultaneously</div>
    </div>
  );
};

const ManualTab: React.FC = () => {
  const tocSections = [
    { id: 'm-getting-started', title: '1. Getting Started' },
    { id: 'm-uploading', title: '2. Uploading Documents' },
    { id: 'm-fields', title: '3. Adding Fields' },
    { id: 'm-signers', title: '4. Adding Signers & Sending' },
    { id: 'm-workflows', title: '5. Signing Workflows' },
    { id: 'm-signing', title: '6. Signing a Document' },
    { id: 'm-templates', title: '7. Templates' },
    { id: 'm-teams', title: '8. Teams & Collaboration' },
    { id: 'm-security', title: '9. Security' },
    { id: 'm-webhooks', title: '10. Webhooks' },
  ];

  return (
    <div>
      {/* Table of Contents */}
      <nav className="mb-12 bg-base-200/30 rounded-xl border border-base-300/50 p-6">
        <h2 className="text-sm font-semibold text-neutral uppercase tracking-wider mb-4">Contents</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {tocSections.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="text-sm text-base-content/60 hover:text-primary transition-colors">
              {s.title}
            </a>
          ))}
        </div>
      </nav>

      {/* ── 1. Getting Started ── */}
      <section id="m-getting-started" className="mb-16">
        <h2 className="text-2xl font-bold text-neutral mb-2 pb-3 border-b border-base-300/50">1. Getting Started</h2>
        <p className="text-base-content/60 mb-8">Create your account and start sending documents for signature in minutes.</p>

        <div className="space-y-8">
          <div className="flex items-start gap-4">
            <StepNumber n={1} />
            <div>
              <h3 className="text-lg font-semibold text-neutral mb-2">Create your account</h3>
              <p className="text-base-content/70 leading-relaxed">
                Click <strong>"Get Started"</strong> in the top-right corner. Enter your name, email address, and a password
                (at least 8 characters, with letters and numbers). Click <strong>"Create Account"</strong>.
              </p>
              <Tip>A personal team is automatically created for you, so you can start uploading documents right away.</Tip>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <StepNumber n={2} />
            <div>
              <h3 className="text-lg font-semibold text-neutral mb-2">Verify your email</h3>
              <p className="text-base-content/70 leading-relaxed">
                Check your inbox for a verification email from EzSign. Click the confirmation link to activate your account.
                If you don't see the email, check your spam folder.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <StepNumber n={3} />
            <div>
              <h3 className="text-lg font-semibold text-neutral mb-2">Explore the Dashboard</h3>
              <p className="text-base-content/70 leading-relaxed">
                After logging in, you'll land on your <strong>Dashboard</strong>. From here you can upload documents,
                manage templates, invite team members, and track the status of all your signing requests.
              </p>

              <IllustrationBox caption="Dashboard overview — your documents, templates, and activity at a glance">
                <div className="w-full max-w-md space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    </div>
                    <div className="flex-1">
                      <div className="h-3 bg-neutral/10 rounded w-40 mb-1.5"></div>
                      <div className="h-2 bg-base-content/5 rounded w-24"></div>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full bg-warning/10 text-warning font-medium">Pending</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                      <svg className="w-5 h-5 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <div className="flex-1">
                      <div className="h-3 bg-neutral/10 rounded w-32 mb-1.5"></div>
                      <div className="h-2 bg-base-content/5 rounded w-20"></div>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full bg-success/10 text-success font-medium">Completed</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-info/10 flex items-center justify-center">
                      <svg className="w-5 h-5 text-info" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    </div>
                    <div className="flex-1">
                      <div className="h-3 bg-neutral/10 rounded w-36 mb-1.5"></div>
                      <div className="h-2 bg-base-content/5 rounded w-28"></div>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full bg-info/10 text-info font-medium">Draft</span>
                  </div>
                </div>
              </IllustrationBox>
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. Uploading Documents ── */}
      <section id="m-uploading" className="mb-16">
        <h2 className="text-2xl font-bold text-neutral mb-2 pb-3 border-b border-base-300/50">2. Uploading Documents</h2>
        <p className="text-base-content/60 mb-8">Upload any PDF file to prepare it for signing.</p>

        <div className="space-y-8">
          <div className="flex items-start gap-4">
            <StepNumber n={1} />
            <div>
              <h3 className="text-lg font-semibold text-neutral mb-2">Click "Upload Document"</h3>
              <p className="text-base-content/70 leading-relaxed">
                From the Dashboard or the Documents page, click the <strong>"Upload Document"</strong> button.
                A file picker opens — select a <strong>PDF file</strong> from your computer.
              </p>
              <Tip>Maximum file size is 10 MB. Only PDF files are supported. If you have a Word or image file, convert it to PDF first.</Tip>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <StepNumber n={2} />
            <div>
              <h3 className="text-lg font-semibold text-neutral mb-2">Choose a team (optional)</h3>
              <p className="text-base-content/70 leading-relaxed">
                If you belong to multiple teams, select which team this document belongs to using the team selector.
                Team documents are visible to all team members.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <StepNumber n={3} />
            <div>
              <h3 className="text-lg font-semibold text-neutral mb-2">Prepare the document</h3>
              <p className="text-base-content/70 leading-relaxed">
                After upload, the document opens in the <strong>Preparation View</strong> where you can see every page
                rendered, add fields, assign signers, and configure the signing workflow before sending.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. Adding Fields ── */}
      <section id="m-fields" className="mb-16">
        <h2 className="text-2xl font-bold text-neutral mb-2 pb-3 border-b border-base-300/50">3. Adding Fields</h2>
        <p className="text-base-content/60 mb-8">Place signature and form fields anywhere on your document pages.</p>

        <p className="text-base-content/70 leading-relaxed mb-6">
          In the preparation view, use the <strong>field toolbar</strong> on the left side to drag fields onto the document.
          Click any placed field to reposition, resize, or delete it. Each field type serves a different purpose:
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
          <FieldBadge name="Signature" color="bg-primary/10 text-primary border border-primary/20" />
          <FieldBadge name="Text Input" color="bg-info/10 text-info border border-info/20" />
          <FieldBadge name="Date" color="bg-success/10 text-success border border-success/20" />
          <FieldBadge name="Checkbox" color="bg-warning/10 text-warning border border-warning/20" />
          <FieldBadge name="Radio Button" color="bg-error/10 text-error border border-error/20" />
          <FieldBadge name="Dropdown" color="bg-secondary/10 text-secondary border border-secondary/20" />
        </div>

        <IllustrationBox caption="Drag fields from the toolbar and drop them onto any page">
          <div className="flex items-center gap-6">
            <div className="border border-dashed border-base-content/20 rounded-lg p-3 space-y-2 text-xs text-base-content/50">
              <div className="px-3 py-1.5 border border-primary/30 rounded bg-primary/5 text-primary font-medium">Signature</div>
              <div className="px-3 py-1.5 border border-info/30 rounded bg-info/5 text-info font-medium">Text</div>
              <div className="px-3 py-1.5 border border-success/30 rounded bg-success/5 text-success font-medium">Date</div>
            </div>
            <svg className="w-8 h-6 text-base-content/20" fill="none" stroke="currentColor" viewBox="0 0 32 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12h20m0 0l-6-6m6 6l-6 6" /></svg>
            <div className="border border-base-300 rounded-lg w-32 h-44 bg-white/50 relative shadow-sm">
              <div className="absolute top-3 left-3 right-3 space-y-1.5">
                <div className="h-1.5 bg-base-content/8 rounded w-full"></div>
                <div className="h-1.5 bg-base-content/8 rounded w-3/4"></div>
                <div className="h-1.5 bg-base-content/8 rounded w-5/6"></div>
              </div>
              <div className="absolute bottom-8 left-3 w-20 h-8 border-2 border-dashed border-primary/40 rounded bg-primary/5 flex items-center justify-center">
                <span className="text-[10px] text-primary/60">Signature</span>
              </div>
              <div className="absolute bottom-16 right-3 w-14 h-5 border-2 border-dashed border-success/40 rounded bg-success/5 flex items-center justify-center">
                <span className="text-[10px] text-success/60">Date</span>
              </div>
            </div>
          </div>
        </IllustrationBox>

        <Tip>
          You can mark fields as <strong>required</strong> or <strong>optional</strong>. Required fields must be completed before the signer can submit.
          Click a field to see its settings.
        </Tip>
      </section>

      {/* ── 4. Adding Signers & Sending ── */}
      <section id="m-signers" className="mb-16">
        <h2 className="text-2xl font-bold text-neutral mb-2 pb-3 border-b border-base-300/50">4. Adding Signers & Sending</h2>
        <p className="text-base-content/60 mb-8">Assign signers and send your document for signature.</p>

        <div className="space-y-8">
          <div className="flex items-start gap-4">
            <StepNumber n={1} />
            <div>
              <h3 className="text-lg font-semibold text-neutral mb-2">Add signers by email</h3>
              <p className="text-base-content/70 leading-relaxed">
                In the preparation view, enter each signer's email address. You can add as many signers as needed.
                Each signer is assigned a <strong>color</strong> so you can easily see which fields belong to whom.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <StepNumber n={2} />
            <div>
              <h3 className="text-lg font-semibold text-neutral mb-2">Assign fields to signers</h3>
              <p className="text-base-content/70 leading-relaxed">
                Click on each field and assign it to a signer. The field's border changes to match the signer's color.
                Every signer must have <strong>at least one field</strong> assigned to them.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <StepNumber n={3} />
            <div>
              <h3 className="text-lg font-semibold text-neutral mb-2">Send for signing</h3>
              <p className="text-base-content/70 leading-relaxed">
                Click <strong>"Send"</strong>. Each signer receives an email with a unique, secure link.
                They can open the document and sign directly in their browser — <strong>no account required</strong>.
              </p>
              <Tip>
                You can also <strong>schedule sending</strong> for a future date and time. The system will automatically
                send invitations at the scheduled time.
              </Tip>
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. Signing Workflows ── */}
      <section id="m-workflows" className="mb-16">
        <h2 className="text-2xl font-bold text-neutral mb-2 pb-3 border-b border-base-300/50">5. Signing Workflows</h2>
        <p className="text-base-content/60 mb-8">Choose how multiple signers interact with your document.</p>

        <div className="space-y-10">
          <div>
            <h3 className="text-lg font-semibold text-neutral mb-3">Single Signer</h3>
            <p className="text-base-content/70 leading-relaxed mb-4">
              The simplest workflow — one person signs the document. Perfect for simple agreements, acknowledgements, or consent forms.
            </p>
            <IllustrationBox>
              <WorkflowDiagram type="single" />
            </IllustrationBox>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-neutral mb-3">Sequential Signing</h3>
            <p className="text-base-content/70 leading-relaxed mb-4">
              Multiple signers sign <strong>in a specific order</strong>. Each signer receives their invitation only after
              the previous person completes. Great for <strong>approval chains</strong> where a manager must sign before a director.
            </p>
            <IllustrationBox caption="Each signer must complete before the next one is notified">
              <WorkflowDiagram type="sequential" />
            </IllustrationBox>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-neutral mb-3">Parallel Signing</h3>
            <p className="text-base-content/70 leading-relaxed mb-4">
              All signers receive their invitation <strong>at the same time</strong> and can sign in any order.
              Best when signatures are independent — like multiple parties signing a contract simultaneously.
            </p>
            <IllustrationBox caption="All signers can sign simultaneously in any order">
              <WorkflowDiagram type="parallel" />
            </IllustrationBox>
          </div>
        </div>
      </section>

      {/* ── 6. Signing a Document ── */}
      <section id="m-signing" className="mb-16">
        <h2 className="text-2xl font-bold text-neutral mb-2 pb-3 border-b border-base-300/50">6. Signing a Document</h2>
        <p className="text-base-content/60 mb-8">What the signing experience looks like for your signers.</p>

        <div className="space-y-8">
          <div className="flex items-start gap-4">
            <StepNumber n={1} />
            <div>
              <h3 className="text-lg font-semibold text-neutral mb-2">Open the signing link</h3>
              <p className="text-base-content/70 leading-relaxed">
                Signers receive an email with a <strong>secure, unique link</strong>. Clicking it opens the document
                directly in the browser. No account creation, no app download — just click and sign.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <StepNumber n={2} />
            <div>
              <h3 className="text-lg font-semibold text-neutral mb-2">Complete all fields</h3>
              <p className="text-base-content/70 leading-relaxed mb-4">
                The signer sees only the fields assigned to them, highlighted for easy identification.
                For <strong>signature fields</strong>, there are three options:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-base-200/50 rounded-xl p-4 border border-base-300/30 text-center">
                  <svg className="w-8 h-8 mx-auto mb-2 text-primary/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  <div className="text-sm font-medium text-neutral">Draw</div>
                  <div className="text-xs text-base-content/50 mt-1">Use mouse or finger</div>
                </div>
                <div className="bg-base-200/50 rounded-xl p-4 border border-base-300/30 text-center">
                  <svg className="w-8 h-8 mx-auto mb-2 text-primary/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <div className="text-sm font-medium text-neutral">Type</div>
                  <div className="text-xs text-base-content/50 mt-1">Auto-generated style</div>
                </div>
                <div className="bg-base-200/50 rounded-xl p-4 border border-base-300/30 text-center">
                  <svg className="w-8 h-8 mx-auto mb-2 text-primary/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <div className="text-sm font-medium text-neutral">Upload</div>
                  <div className="text-xs text-base-content/50 mt-1">Upload an image</div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <StepNumber n={3} />
            <div>
              <h3 className="text-lg font-semibold text-neutral mb-2">Submit</h3>
              <p className="text-base-content/70 leading-relaxed">
                Once all required fields are filled, click <strong>"Submit"</strong>. The signature is applied permanently.
                If the workflow is sequential, the next signer is automatically notified. Once all signers complete,
                you receive a copy of the finished document with the full audit trail embedded.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 7. Templates ── */}
      <section id="m-templates" className="mb-16">
        <h2 className="text-2xl font-bold text-neutral mb-2 pb-3 border-b border-base-300/50">7. Templates</h2>
        <p className="text-base-content/60 mb-8">Save time by reusing document layouts you send frequently.</p>

        <div className="space-y-8">
          <div className="flex items-start gap-4">
            <StepNumber n={1} />
            <div>
              <h3 className="text-lg font-semibold text-neutral mb-2">Create a template</h3>
              <p className="text-base-content/70 leading-relaxed">
                After preparing a document with fields, save it as a template. The template preserves the PDF,
                all field positions, types, and settings — ready to reuse at any time.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <StepNumber n={2} />
            <div>
              <h3 className="text-lg font-semibold text-neutral mb-2">Use a template</h3>
              <p className="text-base-content/70 leading-relaxed">
                Go to <strong>Templates</strong> and click <strong>"Use Template"</strong>. A new document is created instantly
                with all fields pre-configured. Just add signers and send — no need to set up fields again.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <StepNumber n={3} />
            <div>
              <h3 className="text-lg font-semibold text-neutral mb-2">Share with your team</h3>
              <p className="text-base-content/70 leading-relaxed">
                Templates can be shared with your team so any member can create documents from them.
                Perfect for standardized contracts, NDA forms, HR onboarding documents, and more.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 8. Teams ── */}
      <section id="m-teams" className="mb-16">
        <h2 className="text-2xl font-bold text-neutral mb-2 pb-3 border-b border-base-300/50">8. Teams & Collaboration</h2>
        <p className="text-base-content/60 mb-8">Work together with your organization.</p>

        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-neutral mb-2">Create a team</h3>
            <p className="text-base-content/70 leading-relaxed">
              Go to <strong>Settings</strong> and create a team. Invite members by email — they'll receive an invitation
              link to join. You can manage multiple teams for different departments or clients.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-neutral mb-2">Roles</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
              <div className="bg-base-200/50 rounded-xl p-4 border border-base-300/30">
                <div className="text-sm font-bold text-neutral mb-1">Owner</div>
                <div className="text-xs text-base-content/60">Full control over team, billing, and all settings. Can delete the team.</div>
              </div>
              <div className="bg-base-200/50 rounded-xl p-4 border border-base-300/30">
                <div className="text-sm font-bold text-neutral mb-1">Admin</div>
                <div className="text-xs text-base-content/60">Manage members, invite users, configure team settings.</div>
              </div>
              <div className="bg-base-200/50 rounded-xl p-4 border border-base-300/30">
                <div className="text-sm font-bold text-neutral mb-1">Member</div>
                <div className="text-xs text-base-content/60">Access shared documents, templates, and send documents for signing.</div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-neutral mb-2">Shared documents</h3>
            <p className="text-base-content/70 leading-relaxed">
              Documents created under a team are visible to all team members. This makes it easy to
              collaborate on contracts, track signing progress, and maintain a shared document history.
            </p>
          </div>
        </div>
      </section>

      {/* ── 9. Security ── */}
      <section id="m-security" className="mb-16">
        <h2 className="text-2xl font-bold text-neutral mb-2 pb-3 border-b border-base-300/50">9. Security</h2>
        <p className="text-base-content/60 mb-8">Your documents and data are protected at every level.</p>

        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-neutral mb-2">Two-Factor Authentication (2FA)</h3>
            <p className="text-base-content/70 leading-relaxed">
              Enable 2FA in <strong>Settings</strong> for an extra layer of security. EzSign supports <strong>TOTP authenticator apps</strong>
              (Google Authenticator, Authy, etc.) and <strong>backup codes</strong> in case you lose access to your device.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-neutral mb-2">Audit Trail</h3>
            <p className="text-base-content/70 leading-relaxed">
              Every document maintains a complete audit trail recording <strong>who signed, when, and from which IP address</strong>.
              The audit trail is embedded directly in the completed PDF as a certificate page, providing
              tamper-evident proof of every action.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-neutral mb-2">API Keys</h3>
            <p className="text-base-content/70 leading-relaxed">
              Generate API keys in Settings to integrate EzSign with your applications. Keys support
              <strong> scoped permissions</strong> — grant only the access your integration needs (read-only, documents-only, etc.).
            </p>
          </div>
        </div>
      </section>

      {/* ── 10. Webhooks ── */}
      <section id="m-webhooks" className="mb-16">
        <h2 className="text-2xl font-bold text-neutral mb-2 pb-3 border-b border-base-300/50">10. Webhooks</h2>
        <p className="text-base-content/60 mb-8">Get real-time notifications when things happen in EzSign.</p>

        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-neutral mb-2">Set up webhooks</h3>
            <p className="text-base-content/70 leading-relaxed">
              Go to <strong>Settings &rarr; Webhooks</strong> and add a URL. EzSign will send HTTP POST requests to your
              URL whenever subscribed events occur — no polling needed.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-neutral mb-2">Available events</h3>
            <div className="grid grid-cols-2 gap-2 mt-3">
              {['document.sent', 'document.signed', 'document.completed', 'document.cancelled'].map((evt) => (
                <code key={evt} className="text-xs bg-base-200 border border-base-300/50 rounded-lg px-3 py-2 text-base-content/70 font-mono">
                  {evt}
                </code>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-neutral mb-2">Security & reliability</h3>
            <p className="text-base-content/70 leading-relaxed">
              Every webhook delivery includes an <strong>HMAC-SHA256 signature</strong> so you can verify it came from EzSign.
              Failed deliveries are automatically retried with <strong>exponential backoff</strong>. Check delivery logs in Settings to troubleshoot.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};

/* ────────────────────────────────────────────────────────────────
   API TAB — Developer reference with request/response examples
   ──────────────────────────────────────────────────────────────── */

const CodeBlock: React.FC<{ title?: string; lang?: string; children: string }> = ({ title, lang, children }) => (
  <div className="rounded-xl border border-base-300/50 overflow-hidden my-4">
    {title && (
      <div className="bg-neutral/5 border-b border-base-300/50 px-4 py-2 flex items-center justify-between">
        <span className="text-xs font-medium text-base-content/50">{title}</span>
        {lang && <span className="text-xs text-base-content/30">{lang}</span>}
      </div>
    )}
    <pre className="bg-neutral/[0.03] p-4 overflow-x-auto text-sm font-mono text-base-content/80 leading-relaxed">
      {children}
    </pre>
  </div>
);

const MethodBadge: React.FC<{ method: string }> = ({ method }) => {
  const colors: Record<string, string> = {
    GET: 'bg-success/15 text-success',
    POST: 'bg-info/15 text-info',
    PUT: 'bg-warning/15 text-warning',
    DELETE: 'bg-error/15 text-error',
  };
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded ${colors[method] || 'bg-base-200 text-base-content/60'}`}>
      {method}
    </span>
  );
};

interface ApiEndpoint {
  method: string;
  path: string;
  description: string;
  auth: boolean;
  curl?: string;
  successResponse?: string;
  errorResponse?: string;
}

interface ApiSection {
  id: string;
  title: string;
  description: string;
  endpoints: ApiEndpoint[];
}

const apiSections: ApiSection[] = [
  {
    id: 'api-auth',
    title: 'Authentication',
    description: 'Register, login, and manage sessions. Most endpoints return JWT tokens for subsequent authenticated requests.',
    endpoints: [
      {
        method: 'POST',
        path: '/api/auth/register',
        description: 'Create a new user account. A personal team is automatically created.',
        auth: false,
        curl: `curl -X POST https://your-domain.com/api/auth/register \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "user@example.com",
    "password": "securePass123",
    "name": "Jane Doe"
  }'`,
        successResponse: `{
  "user": {
    "id": "usr_abc123",
    "email": "user@example.com",
    "name": "Jane Doe"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "team": {
    "id": "team_xyz789",
    "name": "user's Team"
  }
}`,
        errorResponse: `{
  "error": {
    "message": "Email already registered",
    "code": "DUPLICATE_EMAIL"
  }
}`,
      },
      {
        method: 'POST',
        path: '/api/auth/login',
        description: 'Login and receive access + refresh tokens. May require 2FA verification.',
        auth: false,
        curl: `curl -X POST https://your-domain.com/api/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "user@example.com",
    "password": "securePass123"
  }'`,
        successResponse: `{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "usr_abc123",
    "email": "user@example.com",
    "name": "Jane Doe"
  }
}`,
        errorResponse: `{
  "error": {
    "message": "Invalid email or password",
    "code": "INVALID_CREDENTIALS"
  }
}`,
      },
      {
        method: 'GET',
        path: '/api/auth/me',
        description: 'Get the currently authenticated user profile.',
        auth: true,
        curl: `curl https://your-domain.com/api/auth/me \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"`,
        successResponse: `{
  "user": {
    "id": "usr_abc123",
    "email": "user@example.com",
    "name": "Jane Doe",
    "email_verified": true,
    "two_factor_enabled": false
  }
}`,
      },
      {
        method: 'POST',
        path: '/api/auth/refresh',
        description: 'Exchange a refresh token for a new access token.',
        auth: false,
        curl: `curl -X POST https://your-domain.com/api/auth/refresh \\
  -H "Content-Type: application/json" \\
  -d '{ "refreshToken": "eyJhbGciOiJIUzI1NiIs..." }'`,
        successResponse: `{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}`,
      },
    ],
  },
  {
    id: 'api-documents',
    title: 'Documents',
    description: 'Upload, manage, and send documents for signing.',
    endpoints: [
      {
        method: 'POST',
        path: '/api/documents',
        description: 'Upload a new PDF document. Use multipart/form-data with a "file" field.',
        auth: true,
        curl: `curl -X POST https://your-domain.com/api/documents \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \\
  -F "file=@contract.pdf" \\
  -F "title=Service Agreement" \\
  -F "team_id=team_xyz789"`,
        successResponse: `{
  "document": {
    "id": "doc_def456",
    "title": "Service Agreement",
    "status": "draft",
    "page_count": 3,
    "file_size": 245760,
    "team_id": "team_xyz789",
    "created_at": "2026-03-05T10:30:00Z"
  }
}`,
        errorResponse: `{
  "error": {
    "message": "File must be a PDF",
    "code": "INVALID_FILE_TYPE"
  }
}`,
      },
      {
        method: 'GET',
        path: '/api/documents',
        description: 'List documents with pagination. Supports ?page, ?limit, ?status, and ?search query parameters.',
        auth: true,
        curl: `curl "https://your-domain.com/api/documents?page=1&limit=10&status=pending" \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"`,
        successResponse: `{
  "documents": [
    {
      "id": "doc_def456",
      "title": "Service Agreement",
      "status": "pending",
      "page_count": 3,
      "created_at": "2026-03-05T10:30:00Z",
      "signers_count": 2,
      "signed_count": 1
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 42,
    "totalPages": 5
  }
}`,
      },
      {
        method: 'GET',
        path: '/api/documents/:id',
        description: 'Get a single document with its fields and signers.',
        auth: true,
        curl: `curl https://your-domain.com/api/documents/doc_def456 \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"`,
        successResponse: `{
  "document": {
    "id": "doc_def456",
    "title": "Service Agreement",
    "status": "pending",
    "page_count": 3,
    "workflow_type": "sequential",
    "fields": [...],
    "signers": [...]
  }
}`,
        errorResponse: `{
  "error": {
    "message": "Document not found",
    "code": "NOT_FOUND"
  }
}`,
      },
      {
        method: 'POST',
        path: '/api/documents/:id/send',
        description: 'Send the document for signing. All signers must have fields assigned.',
        auth: true,
        curl: `curl -X POST https://your-domain.com/api/documents/doc_def456/send \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{ "message": "Please sign this agreement." }'`,
        successResponse: `{
  "document": {
    "id": "doc_def456",
    "status": "pending",
    "sent_at": "2026-03-05T11:00:00Z"
  },
  "message": "Document sent to 2 signers"
}`,
        errorResponse: `{
  "error": {
    "message": "All signers must have at least one field assigned",
    "code": "VALIDATION_ERROR"
  }
}`,
      },
      {
        method: 'DELETE',
        path: '/api/documents/:id',
        description: 'Delete a document. Only draft documents can be deleted.',
        auth: true,
        curl: `curl -X DELETE https://your-domain.com/api/documents/doc_def456 \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"`,
        successResponse: `{
  "message": "Document deleted"
}`,
      },
    ],
  },
  {
    id: 'api-fields',
    title: 'Fields',
    description: 'Add and manage signature/form fields on documents.',
    endpoints: [
      {
        method: 'POST',
        path: '/api/documents/:id/fields',
        description: 'Create a field on a document page.',
        auth: true,
        curl: `curl -X POST https://your-domain.com/api/documents/doc_def456/fields \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "type": "signature",
    "page": 1,
    "x": 100,
    "y": 500,
    "width": 200,
    "height": 60,
    "required": true,
    "signer_email": "signer@example.com"
  }'`,
        successResponse: `{
  "field": {
    "id": "fld_ghi789",
    "type": "signature",
    "page": 1,
    "x": 100,
    "y": 500,
    "width": 200,
    "height": 60,
    "required": true,
    "signer_id": "sgn_jkl012"
  }
}`,
      },
      {
        method: 'POST',
        path: '/api/documents/:id/fields/bulk',
        description: 'Create or update multiple fields at once.',
        auth: true,
        curl: `curl -X POST https://your-domain.com/api/documents/doc_def456/fields/bulk \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "fields": [
      { "type": "signature", "page": 1, "x": 100, "y": 500, "width": 200, "height": 60 },
      { "type": "date", "page": 1, "x": 350, "y": 500, "width": 120, "height": 30 }
    ]
  }'`,
        successResponse: `{
  "fields": [
    { "id": "fld_001", "type": "signature", "page": 1 },
    { "id": "fld_002", "type": "date", "page": 1 }
  ]
}`,
      },
    ],
  },
  {
    id: 'api-signers',
    title: 'Signers',
    description: 'Add signers to documents and manage signing assignments.',
    endpoints: [
      {
        method: 'POST',
        path: '/api/documents/:id/signers',
        description: 'Add a signer to a document.',
        auth: true,
        curl: `curl -X POST https://your-domain.com/api/documents/doc_def456/signers \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "signer@example.com",
    "name": "John Smith",
    "order": 1
  }'`,
        successResponse: `{
  "signer": {
    "id": "sgn_jkl012",
    "email": "signer@example.com",
    "name": "John Smith",
    "order": 1,
    "status": "pending"
  }
}`,
        errorResponse: `{
  "error": {
    "message": "Signer with this email already exists on this document",
    "code": "DUPLICATE_SIGNER"
  }
}`,
      },
      {
        method: 'POST',
        path: '/api/documents/:id/signers/:signerId/resend',
        description: 'Resend the signing invitation email to a signer.',
        auth: true,
        curl: `curl -X POST https://your-domain.com/api/documents/doc_def456/signers/sgn_jkl012/resend \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"`,
        successResponse: `{
  "message": "Invitation resent to signer@example.com"
}`,
      },
    ],
  },
  {
    id: 'api-signing',
    title: 'Public Signing',
    description: 'Endpoints used by signers via their unique token link. No authentication required.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/signing/:token',
        description: 'Load a document for signing using the unique token from the email link.',
        auth: false,
        curl: `curl https://your-domain.com/api/signing/abc123def456`,
        successResponse: `{
  "document": {
    "id": "doc_def456",
    "title": "Service Agreement",
    "page_count": 3
  },
  "signer": {
    "id": "sgn_jkl012",
    "name": "John Smith",
    "fields": [
      { "id": "fld_ghi789", "type": "signature", "page": 1, "x": 100, "y": 500 }
    ]
  }
}`,
        errorResponse: `{
  "error": {
    "message": "Invalid or expired signing link",
    "code": "INVALID_TOKEN"
  }
}`,
      },
      {
        method: 'POST',
        path: '/api/signing/:token/sign',
        description: 'Submit a signature or field value for the signer.',
        auth: false,
        curl: `curl -X POST https://your-domain.com/api/signing/abc123def456/sign \\
  -H "Content-Type: application/json" \\
  -d '{
    "fieldId": "fld_ghi789",
    "signature": "data:image/png;base64,iVBOR...",
    "signatureType": "draw"
  }'`,
        successResponse: `{
  "message": "Signature submitted successfully",
  "completed": false,
  "remaining_fields": 0
}`,
      },
    ],
  },
  {
    id: 'api-templates',
    title: 'Templates',
    description: 'Create reusable templates and generate documents from them.',
    endpoints: [
      {
        method: 'POST',
        path: '/api/templates',
        description: 'Create a template from an existing document.',
        auth: true,
        curl: `curl -X POST https://your-domain.com/api/templates \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "document_id": "doc_def456",
    "name": "Standard NDA",
    "description": "Non-disclosure agreement template",
    "team_id": "team_xyz789"
  }'`,
        successResponse: `{
  "template": {
    "id": "tpl_mno345",
    "name": "Standard NDA",
    "description": "Non-disclosure agreement template",
    "page_count": 2,
    "fields_count": 4
  }
}`,
      },
      {
        method: 'POST',
        path: '/api/templates/:id/documents',
        description: 'Create a new document from a template with pre-configured fields.',
        auth: true,
        curl: `curl -X POST https://your-domain.com/api/templates/tpl_mno345/documents \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "NDA - Acme Corp",
    "team_id": "team_xyz789"
  }'`,
        successResponse: `{
  "document": {
    "id": "doc_pqr678",
    "title": "NDA - Acme Corp",
    "status": "draft",
    "page_count": 2,
    "fields_count": 4
  }
}`,
      },
    ],
  },
  {
    id: 'api-teams',
    title: 'Teams',
    description: 'Create and manage teams for collaboration.',
    endpoints: [
      {
        method: 'POST',
        path: '/api/teams',
        description: 'Create a new team.',
        auth: true,
        curl: `curl -X POST https://your-domain.com/api/teams \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{ "name": "Engineering" }'`,
        successResponse: `{
  "team": {
    "id": "team_stu901",
    "name": "Engineering",
    "role": "owner",
    "members_count": 1
  }
}`,
      },
      {
        method: 'POST',
        path: '/api/teams/:id/members',
        description: 'Add a member to a team by email.',
        auth: true,
        curl: `curl -X POST https://your-domain.com/api/teams/team_stu901/members \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{ "email": "colleague@example.com", "role": "member" }'`,
        successResponse: `{
  "member": {
    "user_id": "usr_vwx234",
    "email": "colleague@example.com",
    "role": "member",
    "joined_at": "2026-03-05T12:00:00Z"
  }
}`,
        errorResponse: `{
  "error": {
    "message": "User is already a member of this team",
    "code": "ALREADY_MEMBER"
  }
}`,
      },
    ],
  },
  {
    id: 'api-webhooks',
    title: 'Webhooks',
    description: 'Set up webhooks to receive real-time event notifications.',
    endpoints: [
      {
        method: 'POST',
        path: '/api/webhooks',
        description: 'Create a webhook subscription.',
        auth: true,
        curl: `curl -X POST https://your-domain.com/api/webhooks \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://your-app.com/webhooks/ezsign",
    "events": ["document.completed", "document.signed"],
    "secret": "your-webhook-secret"
  }'`,
        successResponse: `{
  "webhook": {
    "id": "whk_yza567",
    "url": "https://your-app.com/webhooks/ezsign",
    "events": ["document.completed", "document.signed"],
    "active": true,
    "created_at": "2026-03-05T12:00:00Z"
  }
}`,
      },
    ],
  },
  {
    id: 'api-keys',
    title: 'API Keys',
    description: 'Create and manage API keys for programmatic access.',
    endpoints: [
      {
        method: 'POST',
        path: '/api/api-keys',
        description: 'Create a new API key with scoped permissions.',
        auth: true,
        curl: `curl -X POST https://your-domain.com/api/api-keys \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "CI/CD Pipeline",
    "scopes": ["documents:read", "documents:write", "templates:read"]
  }'`,
        successResponse: `{
  "apiKey": {
    "id": "key_bcd890",
    "name": "CI/CD Pipeline",
    "key": "ezs_live_abc123def456ghi789",
    "scopes": ["documents:read", "documents:write", "templates:read"],
    "created_at": "2026-03-05T12:00:00Z"
  }
}`,
        errorResponse: `{
  "error": {
    "message": "Invalid scope: documents:delete",
    "code": "INVALID_SCOPE"
  }
}`,
      },
    ],
  },
];

const ApiEndpointCard: React.FC<{ endpoint: ApiEndpoint }> = ({ endpoint }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-base-300/50 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-base-200/30 transition-colors text-left"
      >
        <MethodBadge method={endpoint.method} />
        <code className="text-sm font-mono text-neutral flex-1">{endpoint.path}</code>
        {endpoint.auth && (
          <span className="text-xs bg-warning/10 text-warning px-2 py-0.5 rounded font-medium hidden sm:inline">auth</span>
        )}
        <svg
          className={`w-4 h-4 text-base-content/40 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-base-300/50 px-4 py-4 bg-base-200/10">
          <p className="text-sm text-base-content/70 mb-4">{endpoint.description}</p>

          {endpoint.curl && (
            <CodeBlock title="Request" lang="bash">
              {endpoint.curl}
            </CodeBlock>
          )}

          {endpoint.successResponse && (
            <CodeBlock title="Response — 200 OK" lang="json">
              {endpoint.successResponse}
            </CodeBlock>
          )}

          {endpoint.errorResponse && (
            <CodeBlock title="Error Response — 4xx" lang="json">
              {endpoint.errorResponse}
            </CodeBlock>
          )}
        </div>
      )}
    </div>
  );
};

const ApiTab: React.FC = () => (
  <div>
    {/* Authentication info */}
    <div className="bg-base-200/30 rounded-xl border border-base-300/50 p-6 mb-10">
      <h2 className="text-lg font-semibold text-neutral mb-3">Authentication</h2>
      <p className="text-sm text-base-content/70 mb-4">
        Most endpoints require authentication. You can authenticate using either a <strong>JWT access token</strong> or an <strong>API key</strong>.
      </p>

      <div className="space-y-3">
        <div>
          <div className="text-xs font-medium text-base-content/50 mb-1">Option 1 — Bearer Token</div>
          <pre className="bg-neutral/[0.03] rounded-lg p-3 font-mono text-sm overflow-x-auto">
            <span className="text-base-content/50">Authorization:</span> <span className="text-info">Bearer</span> <span className="text-base-content/60">{'<access-token>'}</span>
          </pre>
        </div>
        <div>
          <div className="text-xs font-medium text-base-content/50 mb-1">Option 2 — API Key</div>
          <pre className="bg-neutral/[0.03] rounded-lg p-3 font-mono text-sm overflow-x-auto">
            <span className="text-base-content/50">X-API-Key:</span> <span className="text-base-content/60">{'<your-api-key>'}</span>
          </pre>
        </div>
      </div>

      <p className="text-xs text-base-content/40 mt-4">
        Get an access token via <code className="bg-base-200 px-1.5 py-0.5 rounded">POST /api/auth/login</code> or create an API key in Settings.
      </p>
    </div>

    {/* Base URL */}
    <div className="bg-base-200/30 rounded-xl border border-base-300/50 p-6 mb-10">
      <h2 className="text-lg font-semibold text-neutral mb-2">Base URL</h2>
      <p className="text-sm text-base-content/70 mb-3">All API endpoints are relative to your EzSign instance:</p>
      <pre className="bg-neutral/[0.03] rounded-lg p-3 font-mono text-sm">
        <span className="text-info">https://</span><span className="text-base-content/60">your-domain.com</span>
      </pre>
      <p className="text-xs text-base-content/40 mt-3">All request and response bodies use JSON (Content-Type: application/json) unless stated otherwise.</p>
    </div>

    {/* Table of Contents */}
    <nav className="mb-10 bg-base-200/30 rounded-xl border border-base-300/50 p-6">
      <h2 className="text-sm font-semibold text-neutral uppercase tracking-wider mb-3">Resources</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {apiSections.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="text-sm text-base-content/60 hover:text-primary transition-colors">
            {s.title}
            <span className="text-base-content/30 ml-1">({s.endpoints.length})</span>
          </a>
        ))}
      </div>
    </nav>

    {/* Endpoint Sections */}
    <div className="space-y-12">
      {apiSections.map((section) => (
        <section key={section.id} id={section.id}>
          <h2 className="text-2xl font-bold text-neutral mb-2">{section.title}</h2>
          <p className="text-base-content/60 mb-6">{section.description}</p>
          <div className="space-y-3">
            {section.endpoints.map((ep) => (
              <ApiEndpointCard key={`${ep.method}-${ep.path}`} endpoint={ep} />
            ))}
          </div>
        </section>
      ))}
    </div>
  </div>
);

/* ────────────────────────────────────────────────────────────────
   MAIN PAGE
   ──────────────────────────────────────────────────────────────── */

export const Docs: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('manual');

  return (
    <div className="min-h-screen bg-base-100">
      <PublicNavbar />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-neutral mb-3">Documentation</h1>
          <p className="text-lg text-base-content/60">
            Everything you need to use EzSign and integrate it into your workflow.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-10 bg-base-200/50 rounded-xl p-1 w-fit">
          <button
            onClick={() => setActiveTab('manual')}
            className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'manual'
                ? 'bg-base-100 text-neutral shadow-sm'
                : 'text-base-content/50 hover:text-neutral'
            }`}
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              Manual
            </span>
          </button>
          <button
            onClick={() => setActiveTab('api')}
            className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'api'
                ? 'bg-base-100 text-neutral shadow-sm'
                : 'text-base-content/50 hover:text-neutral'
            }`}
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              API Reference
            </span>
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'manual' ? <ManualTab /> : <ApiTab />}

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-base-300/50 text-center text-sm text-base-content/50">
          <p>
            Need help?{' '}
            <Link to="/contact" className="text-info hover:underline">Contact us</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Docs;
