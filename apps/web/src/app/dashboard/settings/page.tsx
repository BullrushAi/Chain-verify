'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { InvoiceProofKeyGate } from '@/components/invoice-proof/InvoiceProofKeyGate';
import { InvoiceProofShell } from '@/components/invoice-proof/InvoiceProofShell';
import { DashboardNav } from '@/components/dashboard/DashboardNav';

import '../../invoice-proof/invoice-proof-app.css';
import '../dashboard.css';

/**
 * Settings is merged into Organization (Task 2): the old Settings page only
 * repeated the organization table plus a key count, so it now opens
 * /dashboard/organization, which carries that key count too.
 */
export default function SettingsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard/organization');
  }, [router]);
  return (
    <InvoiceProofKeyGate>
      <InvoiceProofShell>
        <div className='ipa-stack'>
          <DashboardNav current='settings' />
          <div className='ipa-panel'>
            <h1 className='ipa-h1'>Settings</h1>
            <p className='ipa-sub'>
              Settings has moved into Organization — the two pages showed the same details.{' '}
              <Link className='ipa-link' href='/dashboard/organization'>Open Organization</Link>.
            </p>
          </div>
        </div>
      </InvoiceProofShell>
    </InvoiceProofKeyGate>
  );
}
