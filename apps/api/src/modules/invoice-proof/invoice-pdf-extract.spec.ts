import { describe, expect, it } from 'vitest';

import { extractInvoiceFieldsFromText } from '@chain-verify/proof-core/invoice-pdf-extract.js';

const CLEAN_INVOICE = `Acme Industrial Supply
123 Market Street, Springfield, IL

Invoice #: INV-4471
Invoice Date: 03/14/2026
PO Number: PO-9920
Payment Terms: Net 30

Description           Qty   Amount
Steel brackets         10   $450.00
Mounting hardware       5   $300.00

Subtotal: $750.00
Tax: $0.00
Total Due: $750.00

Remit to:
Routing #: 021000021
Account #: ****6789
`;

describe('extractInvoiceFieldsFromText', () => {
  it('extracts core fields from a clean text invoice with high confidence', () => {
    const r = extractInvoiceFieldsFromText(CLEAN_INVOICE, 1);
    expect(r.status).toBe('OK');
    expect(r.confidence).toBeGreaterThanOrEqual(0.75);
    expect(r.fields.invoiceNo).toBe('INV-4471');
    expect(r.fields.amount).toBe(750);
    expect(r.fields.po).toBe('PO-9920');
    expect(r.fields.invoiceDate).toBe('03/14/2026');
    expect(r.fields.paymentTerms?.toLowerCase()).toBe('net 30');
    expect(r.fields.bankRouting).toBe('021000021');
    expect(r.fields.bankAccountLast4).toBe('6789');
    expect(r.fields.vendor).toBe('Acme Industrial Supply');
  });

  it('picks the grand total, not a line item or subtotal', () => {
    const r = extractInvoiceFieldsFromText(CLEAN_INVOICE, 1);
    expect(r.fields.amount).toBe(750);
  });

  it('returns TEXT_EXTRACTION_FAILED for empty text (scanned/image-only PDF)', () => {
    const r = extractInvoiceFieldsFromText('', 3);
    expect(r.status).toBe('TEXT_EXTRACTION_FAILED');
    expect(r.confidence).toBe(0);
    expect(r.warnings[0]).toMatch(/scanned|image-only/i);
  });

  it('returns TEXT_EXTRACTION_FAILED when chars-per-page is below threshold', () => {
    const r = extractInvoiceFieldsFromText('x', 5);
    expect(r.status).toBe('TEXT_EXTRACTION_FAILED');
  });

  it('returns NEEDS_REVIEW when core fields are missing', () => {
    const r = extractInvoiceFieldsFromText(
      'Some unrelated document text that is long enough to have a text layer but no invoice fields at all here.',
      1,
    );
    expect(r.status).toBe('NEEDS_REVIEW');
    expect(r.confidence).toBeLessThan(0.6);
    expect(r.warnings.join(' ')).toMatch(/review/i);
  });

  it('extracts fields from space-joined single-line text (real unpdf output shape)', () => {
    // unpdf/pdf.js commonly returns text with items joined by spaces and few newlines.
    const text =
      'Vendor: Globex Manufacturing Invoice #: INV-7788 Invoice Date: 04/02/2026 ' +
      'PO Number: PO-3310 Payment Terms: Net 45 Total Due: $12,400.00 Routing #: 121000248';
    const r = extractInvoiceFieldsFromText(text, 1);
    expect(r.status).toBe('OK');
    expect(r.fields.vendor).toBe('Globex Manufacturing');
    expect(r.fields.invoiceNo).toBe('INV-7788');
    expect(r.fields.amount).toBe(12400);
    expect(r.fields.po).toBe('PO-3310');
    expect(r.fields.bankRouting).toBe('121000248');
  });

  it('never throws on null/garbage input', () => {
    expect(() => extractInvoiceFieldsFromText(undefined as unknown as string, 0)).not.toThrow();
    const r = extractInvoiceFieldsFromText(undefined as unknown as string, 0);
    expect(r.status).toBe('TEXT_EXTRACTION_FAILED');
  });

  it('extracts only the last 4 of an account number, never the full number', () => {
    const r = extractInvoiceFieldsFromText(CLEAN_INVOICE, 1);
    expect(r.fields.bankAccountLast4).toBe('6789');
    // The full masked account string (****6789) must never be captured — only the last 4.
    expect(r.fields.bankAccountLast4).toHaveLength(4);
    expect(r.fields).not.toHaveProperty('bankAccountNumber');
  });

  // Real pdf.js/unpdf output: a header row ("Invoice No. Balance Due") is emitted
  // immediately followed by the values row, so the label and its value are separated
  // by OTHER column headers. These are verbatim strings pulled from real STV invoices
  // (see testing/proof-products/results/drive-corpus-test-2026-07-03.md) that previously
  // broke the extractor.
  describe('real-world multi-column PDF text (header-row-then-values)', () => {
    it('City of Moab: pulls the invoice number and amount past intervening header words, not the "Balance" header itself', () => {
      const text =
        'Phone: 435-259-5123 Fax: 435-259-4135 CITY OF MOAB 217 E CENTER ST MOAB, UT 84532 ' +
        'INVOICE Bill Date Invoice No. Balance Due 06/04/2026 154249 $3,500.00 Due Date: ' +
        '07/04/2026 DESCRIPTION AMOUNT Bill To: LYKOS ACQUISITION LLC 79 W 900 N SUITE B ' +
        'SPRINGVILLE UT 84663 ACCOUNT NO. 10505820 Notice: Late charges are assessed at the ' +
        'interest rate of 3.00% per month on the unpaid balance. Amount: 3,500.00 SUNSET RIM ' +
        'WATER DEVELOPMENT REVIEW 3,500.00 Please include this Account Number 10505820 with ' +
        'your payment.';
      const r = extractInvoiceFieldsFromText(text, 1);
      expect(r.fields.invoiceNo).toBe('154249');
      expect(r.fields.amount).toBe(3500);
      expect(r.fields.vendor).toBe('CITY OF MOAB');
    });

    it('Terradyne: skips "DATE TOTAL DUE DUE DATE TERMS ENCLOSED" header words to reach the real invoice number, and picks the vendor letterhead over the Bill To recipient', () => {
      const text =
        'Terradyne Engineering, Inc. 354 E Glade Rd EULESS, TX 76039 US +18179527217 ' +
        'accounting@terradyne.com www.terradyne.com Invoice BILL TO Aubrey Palmer Summa Elite ' +
        'LLC 1412 Main Street Ste 410 Dallas, TX 75202 SHIP TO Aubrey Palmer Summa Elite LLC ' +
        '1412 Main Street Ste 410 Dallas, TX 75202 INVOICE # DATE TOTAL DUE DUE DATE TERMS ' +
        'ENCLOSED D242098-024 06/22/2026 $512.50 06/22/2026 Due on receipt ACTIVITY ' +
        'DESCRIPTION QTY RATE AMOUNT 2 - CMT Rock Creek Apartments 1 512.50 512.50 Ways to ' +
        'pay SUBTOTAL 512.50 TAX (0%) 0.00 TOTAL 512.50 BALANCE DUE $512.50';
      const r = extractInvoiceFieldsFromText(text, 1);
      expect(r.fields.invoiceNo).toBe('D242098-024');
      expect(r.fields.amount).toBe(512.5);
      expect(r.fields.vendor).toBe('Terradyne Engineering, Inc.');
    });

    it('Wright: "Invoice Date" must not be mistaken for the "Invoice #" label', () => {
      const text =
        'Invoice Date 5/18/2026 Invoice # 4927 Bill To Michael Watson Summa Elite, LLC 79 W ' +
        '900 N Suite B Springville, UT 84663 Due Date 5/18/2026';
      const r = extractInvoiceFieldsFromText(text, 1);
      expect(r.fields.invoiceNo).toBe('4927');
    });
  });
});

describe('conflicting final totals (two-totals fix)', () => {
  // Regression input is the verbatim OCR text from the failed desktop OCR run
  // (chainverify-real-ocr-desktop epoch 1): the application claimed 1234.56.
  const TWO_TOTALS_OCR_TEXT =
    'INVOICE\n\nVendor: SYNTHETIC TEST VENDOR LLC\nInvoice Number: INV-SYNTH-2026-001\nDate: October 27, 2026\n\nAmount Due: $1,234.56\n\nTotal: $9,999.99\n';

  it('withholds the amount and reasons on conflicting Amount Due vs Total', () => {
    const r = extractInvoiceFieldsFromText(TWO_TOTALS_OCR_TEXT, 1);
    expect(r.fields.amount).toBeUndefined();
    expect(r.fields.amountAmbiguity).toMatch(/Amount Due vs Total/);
    expect(r.status).toBe('NEEDS_REVIEW');
    expect(r.warnings.join(' ')).toMatch(/Conflicting final totals/);
  });

  it('withholds on conflicting tier-1 labels with no paid relationship', () => {
    const text =
      'Vendor: Acme Co\nInvoice #: INV-1\nDate: 03/14/2026\nAmount Due: $100.00\nBalance Due: $200.00\n';
    const r = extractInvoiceFieldsFromText(text, 1);
    expect(r.fields.amount).toBeUndefined();
    expect(r.fields.amountAmbiguity).toMatch(/Conflicting final totals/);
  });

  it('still claims the reconciled total for subtotal + tax + total', () => {
    const text =
      'Vendor: Acme Co\nInvoice #: INV-2\nDate: 03/14/2026\nSubtotal: $1,000.00\nTax: $80.00\nTotal: $1,080.00\n';
    const r = extractInvoiceFieldsFromText(text, 1);
    expect(r.fields.amount).toBe(1080);
    expect(r.fields.amountAmbiguity).toBeUndefined();
  });

  it('preserves the partial-payment relationship (Total minus Paid equals Balance)', () => {
    const text =
      'Vendor: Acme Co\nInvoice #: INV-3\nDate: 03/14/2026\nTotal: $1,000.00\nAmount Paid: $400.00\nBalance Due: $600.00\n';
    const r = extractInvoiceFieldsFromText(text, 1);
    expect(r.fields.amount).toBe(600);
    expect(r.fields.amountAmbiguity).toBeUndefined();
  });

  it('claims when the same value appears under several total labels', () => {
    const text =
      'Vendor: Acme Co\nInvoice #: INV-4\nDate: 03/14/2026\nAmount Due: $1,080.00\nTotal: $1,080.00\n';
    const r = extractInvoiceFieldsFromText(text, 1);
    expect(r.fields.amount).toBe(1080);
    expect(r.fields.amountAmbiguity).toBeUndefined();
  });

  it('keeps the tier-3 bare-amount fallback when no final-total label exists', () => {
    const text =
      'Vendor: Acme Co\nInvoice #: INV-5\nDate: 03/14/2026\nAmount: $250.00\n';
    const r = extractInvoiceFieldsFromText(text, 1);
    expect(r.fields.amount).toBe(250);
    expect(r.fields.amountAmbiguity).toBeUndefined();
  });

  it('withholds the amount but keeps bank fields on conflicting totals with bank details', () => {
    const text = TWO_TOTALS_OCR_TEXT + 'Routing #: 021000021\nAccount #: ****6789\n';
    const r = extractInvoiceFieldsFromText(text, 1);
    expect(r.fields.amount).toBeUndefined();
    expect(r.fields.amountAmbiguity).toMatch(/Conflicting final totals/);
    expect(r.fields.bankRouting).toBe('021000021');
    expect(r.fields.bankAccountLast4).toBe('6789');
  });
});

function targetedInvoice(body: string) {
  return 'Acme Industrial Supply\nInvoice #: INV-TARGET-1\nInvoice Date: 03/14/2026\n' + body;
}

describe('targeted acceptance: label-invariant partial payment and explicit zero (v1.1-targeted)', () => {
  it('partial: Total 1000, Paid 400, Amount Due 600 claims 600', () => {
    const r = extractInvoiceFieldsFromText(targetedInvoice('Total: $1,000.00\nPaid: $400.00\nAmount Due: $600.00\n'), 1);
    expect(r.fields.amountAmbiguity).toBeUndefined();
    expect(r.fields.amount).toBe(600);
  });
  it('partial: Invoice Total 1000, Paid 400, Amount Due 600 claims 600, not 1000', () => {
    const r = extractInvoiceFieldsFromText(targetedInvoice('Invoice Total: $1,000.00\nPaid: $400.00\nAmount Due: $600.00\n'), 1);
    expect(r.fields.amountAmbiguity).toBeUndefined();
    expect(r.fields.amount).toBe(600);
  });
  it('partial: Grand Total 1000, Paid 400, Amount Due 600 claims 600, not 1000', () => {
    const r = extractInvoiceFieldsFromText(targetedInvoice('Grand Total: $1,000.00\nPaid: $400.00\nAmount Due: $600.00\n'), 1);
    expect(r.fields.amountAmbiguity).toBeUndefined();
    expect(r.fields.amount).toBe(600);
  });
  it('control: Total 1000, Paid 400, Balance Due 600 claims 600', () => {
    const r = extractInvoiceFieldsFromText(targetedInvoice('Total: $1,000.00\nPaid: $400.00\nBalance Due: $600.00\n'), 1);
    expect(r.fields.amountAmbiguity).toBeUndefined();
    expect(r.fields.amount).toBe(600);
  });
  it('fully paid: Total 1000, Paid 1000, Amount Due 0 preserves explicit zero, not 1000', () => {
    const r = extractInvoiceFieldsFromText(targetedInvoice('Total: $1,000.00\nPaid: $1,000.00\nAmount Due: $0.00\n'), 1);
    expect(r.fields.amountAmbiguity).toBeUndefined();
    expect(r.fields.amount).toBe(0);
  });
  it('clean: Subtotal 1000, Tax 80, Total 1080, Balance Due 1080 claims 1080', () => {
    const r = extractInvoiceFieldsFromText(targetedInvoice('Subtotal: $1,000.00\nTax: $80.00\nTotal: $1,080.00\nBalance Due: $1,080.00\n'), 1);
    expect(r.fields.amountAmbiguity).toBeUndefined();
    expect(r.fields.amount).toBe(1080);
  });
  it('line items: 500 plus 500 with Total 1000 claims 1000 and lineItemsTotal 1000', () => {
    const r = extractInvoiceFieldsFromText(targetedInvoice('Widget A $500.00\nWidget B $500.00\nTotal: $1,000.00\n'), 1);
    expect(r.fields.amountAmbiguity).toBeUndefined();
    expect(r.fields.amount).toBe(1000);
    expect(r.fields.lineItemsTotal).toBe(1000);
  });
});

describe('label-role validation (v1.2)', () => {
  it('withholds when Invoice Total 600, Paid 400, Balance Due 1000 cannot reconcile (600-400 is not 1000)', () => {
    const r = extractInvoiceFieldsFromText(targetedInvoice('Invoice Total: $600.00\nAmount Paid: $400.00\nBalance Due: $1,000.00\n'), 1);
    expect(r.fields.amount).toBeUndefined();
    expect(r.fields.amountAmbiguity).toMatch(/Conflicting final totals/);
    expect(r.status).toBe('NEEDS_REVIEW');
  });
  it('withholds on two distinct due values: Amount Due 1000 vs Balance Due 600 with Paid 400', () => {
    const r = extractInvoiceFieldsFromText(targetedInvoice('Amount Due: $1,000.00\nBalance Due: $600.00\nPaid: $400.00\n'), 1);
    expect(r.fields.amount).toBeUndefined();
    expect(r.fields.amountAmbiguity).toMatch(/Conflicting final totals/);
    expect(r.status).toBe('NEEDS_REVIEW');
  });
  it('withholds on two distinct gross values: Invoice Total 1000 vs Grand Total 600 with Paid 400', () => {
    const r = extractInvoiceFieldsFromText(targetedInvoice('Invoice Total: $1,000.00\nGrand Total: $600.00\nPaid: $400.00\n'), 1);
    expect(r.fields.amount).toBeUndefined();
    expect(r.fields.amountAmbiguity).toMatch(/Conflicting final totals/);
    expect(r.status).toBe('NEEDS_REVIEW');
  });
  it('withholds when a second due value contradicts the reconciled due: Total 1000, Paid 400, Amount Due 600, Balance Due 1000', () => {
    const r = extractInvoiceFieldsFromText(targetedInvoice('Total: $1,000.00\nPaid: $400.00\nAmount Due: $600.00\nBalance Due: $1,000.00\n'), 1);
    expect(r.fields.amount).toBeUndefined();
    expect(r.fields.amountAmbiguity).toMatch(/Conflicting final totals/);
    expect(r.status).toBe('NEEDS_REVIEW');
  });
  it('withholds on multiple distinct paid values: Total 1000, Payment Received 400, Payment Received 100, Balance Due 600', () => {
    const r = extractInvoiceFieldsFromText(targetedInvoice('Total: $1,000.00\nPayment Received: $400.00\nPayment Received: $100.00\nBalance Due: $600.00\n'), 1);
    expect(r.fields.amount).toBeUndefined();
    expect(r.fields.amountAmbiguity).toBeDefined();
    expect(r.status).toBe('NEEDS_REVIEW');
  });
  it('withholds on multiple distinct paid values in reversed order: Total 1000, Payment Received 100, Payment Received 400, Balance Due 600', () => {
    const r = extractInvoiceFieldsFromText(targetedInvoice('Total: $1,000.00\nPayment Received: $100.00\nPayment Received: $400.00\nBalance Due: $600.00\n'), 1);
    expect(r.fields.amount).toBeUndefined();
    expect(r.fields.amountAmbiguity).toBeDefined();
    expect(r.status).toBe('NEEDS_REVIEW');
  });
});

describe('due-label synonyms (v1.3)', () => {
  it('partial: Invoice Total 1000, Paid 400, Total Due 600 claims 600', () => {
    const r = extractInvoiceFieldsFromText(targetedInvoice('Invoice Total: $1,000.00\nPaid: $400.00\nTotal Due: $600.00\n'), 1);
    expect(r.fields.amountAmbiguity).toBeUndefined();
    expect(r.fields.amount).toBe(600);
  });
  it('partial: Invoice Total 1000, Paid 400, Total Amount Due 600 claims 600', () => {
    const r = extractInvoiceFieldsFromText(targetedInvoice('Invoice Total: $1,000.00\nPaid: $400.00\nTotal Amount Due: $600.00\n'), 1);
    expect(r.fields.amountAmbiguity).toBeUndefined();
    expect(r.fields.amount).toBe(600);
  });
  it('fully paid: Total 1000, Paid 1000, Total Due 0 preserves explicit zero, not 1000', () => {
    const r = extractInvoiceFieldsFromText(targetedInvoice('Total: $1,000.00\nPaid: $1,000.00\nTotal Due: $0.00\n'), 1);
    expect(r.fields.amountAmbiguity).toBeUndefined();
    expect(r.fields.amount).toBe(0);
  });
  it('fully paid: Total 1000, Paid 1000, Total Amount Due 0 preserves explicit zero, not 1000', () => {
    const r = extractInvoiceFieldsFromText(targetedInvoice('Total: $1,000.00\nPaid: $1,000.00\nTotal Amount Due: $0.00\n'), 1);
    expect(r.fields.amountAmbiguity).toBeUndefined();
    expect(r.fields.amount).toBe(0);
  });
});


describe('paid-zero contradiction (v1.4)', () => {
  it('withholds when Amount Paid 400 contradicts Total Paid 0: Invoice Total 1000, Balance Due 600', () => {
    const r = extractInvoiceFieldsFromText(targetedInvoice('Invoice Total: $1,000.00\nAmount Paid: $400.00\nTotal Paid: $0.00\nBalance Due: $600.00\n'), 1);
    expect(r.fields.amount).toBeUndefined();
    expect(r.fields.amountAmbiguity).toMatch(/Conflicting paid amounts/);
    expect(r.status).toBe('NEEDS_REVIEW');
  });
  it('withholds in reversed paid order: Invoice Total 1000, Total Paid 0, Amount Paid 400, Balance Due 600', () => {
    const r = extractInvoiceFieldsFromText(targetedInvoice('Invoice Total: $1,000.00\nTotal Paid: $0.00\nAmount Paid: $400.00\nBalance Due: $600.00\n'), 1);
    expect(r.fields.amount).toBeUndefined();
    expect(r.fields.amountAmbiguity).toMatch(/Conflicting paid amounts/);
    expect(r.status).toBe('NEEDS_REVIEW');
  });
});
