'use client';

import { InvoiceProofKeyGate } from '@/components/invoice-proof/InvoiceProofKeyGate';
import { InvoiceProofShell } from '@/components/invoice-proof/InvoiceProofShell';
import { UserDashboard } from '@/components/dashboard/UserDashboard';

import '../invoice-proof/invoice-proof-app.css';

export default function DashboardPage() {
  return (
    <InvoiceProofKeyGate>
      <InvoiceProofShell>
        <UserDashboard />
      </InvoiceProofShell>
    </InvoiceProofKeyGate>
  );
}

