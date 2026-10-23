'use client';

import { InvoiceProofKeyGate } from '@/components/invoice-proof/InvoiceProofKeyGate';
import { InvoiceProofShell } from '@/components/invoice-proof/InvoiceProofShell';
import { SettingsDashboard } from '@/components/dashboard/SettingsDashboard';

import '../../invoice-proof/invoice-proof-app.css';
import '../dashboard.css';

export default function SettingsPage() {
  return (
    <InvoiceProofKeyGate>
      <InvoiceProofShell>
        <SettingsDashboard />
      </InvoiceProofShell>
    </InvoiceProofKeyGate>
  );
}
