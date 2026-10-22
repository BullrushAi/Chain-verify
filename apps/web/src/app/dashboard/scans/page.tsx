'use client';
import Link from 'next/link';
import { InvoiceProofKeyGate } from '@/components/invoice-proof/InvoiceProofKeyGate';
import { InvoiceProofShell } from '@/components/invoice-proof/InvoiceProofShell';
import '../../invoice-proof/invoice-proof-app.css';
export default function ScansPage() {
  return <InvoiceProofKeyGate><InvoiceProofShell><div className='ipa-panel'><div className='ipa-row' style={{justifyContent:'space-between'}}><h1 className='ipa-h1'>Scans / History</h1><Link className='ipa-link' href='/dashboard'>Back to Dashboard</Link></div><p className='ipa-muted'>History is available via the overview API; extend this page as needed.</p></div></InvoiceProofShell></InvoiceProofKeyGate>;
}
