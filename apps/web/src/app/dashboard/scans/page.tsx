'use client';

import { InvoiceProofKeyGate } from '@/components/invoice-proof/InvoiceProofKeyGate';
import { InvoiceProofShell } from '@/components/invoice-proof/InvoiceProofShell';
import { ScansDashboard } from '@/components/dashboard/ScansDashboard';

import '../../invoice-proof/invoice-proof-app.css';
import '../dashboard.css';

export default function ScansPage() {
  return (
    <InvoiceProofKeyGate>
      <InvoiceProofShell>
        <ScansDashboard />
      </InvoiceProofShell>
    </InvoiceProofKeyGate>
  );
}
