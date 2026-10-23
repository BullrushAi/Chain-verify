'use client';

import { InvoiceProofKeyGate } from '@/components/invoice-proof/InvoiceProofKeyGate';
import { InvoiceProofShell } from '@/components/invoice-proof/InvoiceProofShell';
import { ApiKeysDashboard } from '@/components/dashboard/ApiKeysDashboard';

import '../../invoice-proof/invoice-proof-app.css';
import '../dashboard.css';

export default function ApiKeysPage() {
  return (
    <InvoiceProofKeyGate>
      <InvoiceProofShell>
        <ApiKeysDashboard />
      </InvoiceProofShell>
    </InvoiceProofKeyGate>
  );
}
