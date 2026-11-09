/**
 * Duplicate-match eligibility guard (Invoice Proof false-duplicate fix, Nov 9 2026).
 *
 * A duplicate match REQUIRES a non-empty invoice number AND a non-zero amount.
 * A blank/missing invoice number or an amount of zero/missing must NEVER flag a
 * duplicate. An unreadable $0.00 document with a blank invoice number matched a
 * $0.00 payment-register record and was flagged EXACT_DUPLICATE (run14).
 *
 * Apply on BOTH sides of a match: the submitted invoice and the prior/payment-
 * register record must each carry a real invoice number and a real (non-zero)
 * amount. Genuine duplicates always satisfy this; blank/zero rows never do.
 */
export function isDuplicateEligible(
  invoiceNo: string | null | undefined,
  amount: number | null | undefined,
): boolean {
  return (
    typeof invoiceNo === "string" &&
    invoiceNo.trim() !== "" &&
    typeof amount === "number" &&
    Number.isFinite(amount) &&
    amount !== 0
  );
}
