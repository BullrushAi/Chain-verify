'use client';

import Link from 'next/link';
import { useState } from 'react';

import { errorMessage, InvoiceProofApiError, invoiceProofApi } from '@/lib/invoice-proof/client';
import type { ImportKind } from '@/lib/invoice-proof/types';

import { CsvImportSection } from './CsvImportSection';
import { useInvoiceProofSession } from './useInvoiceProofSession';

const SECTIONS: Array<{ kind: ImportKind; title: string; placeholder: string; button: string }> = [
  {
    kind: 'vendor',
    title: 'Vendor master',
    placeholder: 'vendorName,city,state,bankRoutingNumber,bankAccountLast4',
    button: 'Import vendors',
  },
  {
    kind: 'po',
    title: 'Open PO register',
    placeholder: 'poNumber,vendorName,authorizedAmount',
    button: 'Import POs',
  },
  {
    kind: 'payment',
    title: 'Payment history',
    placeholder: 'invoiceNo,vendor,amount,poNumber,paidAt',
    button: 'Import payment history',
  },
];

const KIND_LABELS: Record<ImportKind, string> = {
  vendor: 'Vendor',
  po: 'PO',
  payment: 'Payment history',
};

export function DataImportPanel() {
  const { apiKey, authKind, signOut } = useInvoiceProofSession();
  const [values, setValues] = useState<Record<ImportKind, string>>({ vendor: '', po: '', payment: '' });
  const [busy, setBusy] = useState<ImportKind | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  async function runImport(kind: ImportKind) {
    setBusy(kind);
    setStatus(null);
    try {
      const result = await invoiceProofApi.importCsv(apiKey, kind, values[kind]);
      setStatus({ ok: true, text: `${KIND_LABELS[kind]} import complete: ${result.imported} rows.` });
    } catch (err) {
      if (err instanceof InvoiceProofApiError && (err.status === 401 || err.status === 403)) {
        // This panel takes an API key only. An email session has no key
        // (apiKey is ''), so a 401/403 here says nothing about the
        // email session — it must NOT sign the user out. The gate's signOut
        // posts /api/auth/logout, which deletes every session (CBV fix
        // round Task 3b, Nov 8 2026). For an email session, show the error
        // and keep the session. API-key sessions keep the old behaviour:
        // a rejected key signs out to the key gate.
        if (authKind === 'email') {
          setStatus({ ok: false, text: 'This page signs in with an API key. Your email sign-in is still active — open your scans from your dashboard instead.' });
          return;
        }
        signOut('That API key was not accepted. Check the key and try again.');
        return;
      }
      setStatus({ ok: false, text: errorMessage(err, 'Import failed.') });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <header>
        <p className="ipa-eyebrow">InvoiceProof</p>
        <h1 className="ipa-title">Data bootstrap</h1>
        <p className="ipa-sub">
          Upload CSV exports of your vendor master, open POs, and payment history so scans have full
          context from day one.
        </p>
      </header>

      {SECTIONS.map((section) => (
        <CsvImportSection
          key={section.kind}
          title={section.title}
          placeholder={section.placeholder}
          buttonLabel={section.button}
          value={values[section.kind]}
          busy={busy === section.kind}
          onChange={(next) => setValues((prev) => ({ ...prev, [section.kind]: next }))}
          onImport={() => void runImport(section.kind)}
        />
      ))}

      {status ? (
        <p className={`ipa-alert ${status.ok ? 'ipa-alert-ok' : 'ipa-alert-error'}`} role="status">
          {status.text}
        </p>
      ) : null}

      {authKind === 'email' && status && !status.ok ? (
        <Link href="/dashboard/scans" className="ipa-link">
          Open your scans in your dashboard
        </Link>
      ) : null}

      <div className="ipa-actions">
        <Link href="/invoice-proof/settings/integrations" className="ipa-link">
          ERP integrations
        </Link>
        <Link href="/invoice-proof/dashboard" className="ipa-link">
          Back to dashboard
        </Link>
      </div>
    </>
  );
}
