'use client';

import { InvoiceProofKeyGate } from '@/components/invoice-proof/InvoiceProofKeyGate';
import { InvoiceProofShell } from '@/components/invoice-proof/InvoiceProofShell';
import { BillingDashboard } from '@/components/dashboard/BillingDashboard';

import '../../invoice-proof/invoice-proof-app.css';

export default function BillingPage() {
  return (
    <InvoiceProofKeyGate>
      <InvoiceProofShell>
        <BillingDashboard />
      </InvoiceProofShell>
    </InvoiceProofKeyGate>
  );
}
