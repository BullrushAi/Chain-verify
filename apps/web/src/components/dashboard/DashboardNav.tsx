'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useInvoiceProofSession } from '@/components/invoice-proof/useInvoiceProofSession';

/** The six dashboard sections, in nav order. */
export const DASHBOARD_NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard', slug: 'dashboard' },
  { href: '/dashboard/scans', label: 'Scans', slug: 'scans' },
  { href: '/dashboard/api-keys', label: 'API Keys', slug: 'api-keys' },
  { href: '/dashboard/billing', label: 'Billing', slug: 'billing' },
  { href: '/dashboard/organization', label: 'Organization', slug: 'organization' },
  { href: '/dashboard/settings', label: 'Settings', slug: 'settings' },
] as const;

/** Where a new scan starts (the older InvoiceProof dashboard's New scan target). */
export const NEW_SCAN_HREF = '/invoice-proof/scan';

export interface DashboardNavProps {
  /** Organization name when the page already knows it; otherwise the nav loads it. */
  orgName?: string | null;
  /** Slug of the current page, for the active link. */
  current?: string;
}

/**
 * Shared top navigation for every dashboard page (Task 2): the six sections,
 * the organization name, the signed-in email, New scan, and Sign out.
 * Pages that already know the org name pass it in; the rest let the nav load
 * it from the overview endpoint (a failed load only hides the name — the nav
 * stays usable and the page's own load reports errors).
 */
export function DashboardNav({ orgName, current }: DashboardNavProps) {
  const { apiKey, email, signOut } = useInvoiceProofSession();
  const [loadedOrgName, setLoadedOrgName] = useState<string | null>(null);

  useEffect(() => {
    if (orgName !== undefined) return;
    let cancelled = false;
    void fetch('/api/proxy/user-dashboard/overview', {
      headers: apiKey ? { 'x-chain-verify-api-key': apiKey } : {},
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.organization?.name) setLoadedOrgName(data.organization.name);
      })
      .catch(() => {
        /* The page's own load reports errors; the nav stays usable without the name. */
      });
    return () => {
      cancelled = true;
    };
  }, [orgName, apiKey]);

  const shownOrgName = orgName ?? loadedOrgName;

  return (
    <nav className='ipa-dashnav' aria-label='Dashboard'>
      <div className='ipa-dashnav-links'>
        {DASHBOARD_NAV_LINKS.map((link) => (
          <Link
            key={link.slug}
            className={current === link.slug ? 'ipa-dashnav-link is-active' : 'ipa-dashnav-link'}
            href={link.href}
            aria-current={current === link.slug ? 'page' : undefined}
          >
            {link.label}
          </Link>
        ))}
      </div>
      <div className='ipa-dashnav-account'>
        {shownOrgName ? <span className='ipa-dashnav-org'>{shownOrgName}</span> : null}
        {email ? (
          <span className='ipa-muted'>Signed in as {email}</span>
        ) : (
          <span className='ipa-muted'>Signed in with API key</span>
        )}
        <Link className='ipa-btn ipa-btn-primary' href={NEW_SCAN_HREF}>
          New scan
        </Link>
        <button type='button' className='ipa-btn' onClick={() => signOut()}>
          Sign out
        </button>
      </div>
    </nav>
  );
}
