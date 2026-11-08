import { CustomerAuthForm } from '@/components/auth/CustomerAuthForm';
import { InvoiceProofShell } from '@/components/invoice-proof/InvoiceProofShell';

import '../invoice-proof/invoice-proof-app.css';

export const metadata = { title: 'Sign in — ChainVerify' };

export default function LoginPage() {
  return (
    <InvoiceProofShell narrow>
      <CustomerAuthForm mode="login" />
    </InvoiceProofShell>
  );
}
