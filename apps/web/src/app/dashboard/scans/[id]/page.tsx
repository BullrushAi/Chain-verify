'use client';

import { InvoiceProofKeyGate } from '@/components/invoice-proof/InvoiceProofKeyGate';
import { InvoiceProofShell } from '@/components/invoice-proof/InvoiceProofShell';
import { ScanDetailDashboard } from '@/components/dashboard/ScanDetailDashboard';

import '../../../invoice-proof/invoice-proof-app.css';
import '../../dashboard.css';

export default function ScanDetailPage({ params }: { params: { id: string } }) {
  return (
    <InvoiceProofKeyGate>
      <InvoiceProofShell>
        <ScanDetailDashboard scanId={params.id} />
      </InvoiceProofShell>
    </InvoiceProofKeyGate>
  );
}
