import { CustomerAuthForm } from '@/components/auth/CustomerAuthForm';
import { InvoiceProofShell } from '@/components/invoice-proof/InvoiceProofShell';

import '../invoice-proof/invoice-proof-app.css';

export const metadata = { title: 'Create your account — ChainVerify' };

export default function SignupPage() {
  return (
    <InvoiceProofShell narrow>
      <CustomerAuthForm mode="signup" />
    </InvoiceProofShell>
  );
}
