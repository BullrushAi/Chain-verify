'use client';

import { InvoiceProofKeyGate } from '@/components/invoice-proof/InvoiceProofKeyGate';
import { InvoiceProofShell } from '@/components/invoice-proof/InvoiceProofShell';
import { OrganizationDashboard } from '@/components/dashboard/OrganizationDashboard';

import '../../invoice-proof/invoice-proof-app.css';

export default function OrgPage() {
  return (
    <InvoiceProofKeyGate>
      <InvoiceProofShell>
        <OrganizationDashboard />
      </InvoiceProofShell>
    </InvoiceProofKeyGate>
  );
}
