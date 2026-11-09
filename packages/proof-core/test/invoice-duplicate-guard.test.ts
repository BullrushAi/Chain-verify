import { describe, it, expect } from 'vitest';

import { isDuplicateEligible } from '../src/duplicate-guard.js';
import {
  scanInvoices,
  type Finding,
  type HistoryRecord,
  type Row,
} from '../src/invoice-scan.js';
import { runControls, type ControlResult } from '../src/control-readiness.js';
import { normalizeMany } from '../src/normalizers/invoice-normalizer.js';

// Duplicate-match eligibility guard (Invoice Proof false-duplicate fix,
// Nov 9 2026): a duplicate match REQUIRES a non-empty invoice number AND a
// non-zero amount. A blank invoice number or a $0.00 amount must NEVER flag
// a duplicate. Run14 stored EXACT_DUPLICATE for an unreadable document with
// a blank invoice number and $0.00 against a $0.00 payment-register record
// paid 2026-11-06.

function ctrl(results: ControlResult[], id: string): ControlResult {
  const r = results.find((c) => c.controlId === id);
  if (!r) throw new Error(`control ${id} not found`);
  return r;
}

function row(overrides: Partial<Row>): Row {
  return {
    vendor: 'Acme Industrial',
    invoiceNo: 'INV-REG-2409',
    amount: 12450,
    rawAmount: '$12,450.00',
    po: 'PO-1',
    bank: '',
    ...overrides,
  };
}

function historyRecord(overrides: Partial<HistoryRecord>): HistoryRecord {
  return {
    invoiceNo: 'INV-REG-2409',
    vendor: 'Acme Industrial',
    amount: 12450,
    po: 'PO-1',
    submittedAt: new Date('2026-11-06T00:00:00Z'),
    ...overrides,
  };
}

// The run14 payment-register record: $0.00 paid 2026-11-06. Tests inject
// 2026-11-09 as "now" so the seed record is inside the 90-day recency window.
const RUN14_NOW = new Date('2026-11-09T12:00:00Z');

function hasDuplicateFinding(findings: Finding[]): boolean {
  return findings.some((f) =>
    /EXACT_DUPLICATE|MODIFIED_DUPLICATE|near-duplicate/i.test(
      `${f.pattern} ${f.detail} ${f.evidence ?? ''}`,
    ),
  );
}

describe('isDuplicateEligible', () => {
  it('accepts a valid invoice number with a non-zero amount', () => {
    expect(isDuplicateEligible('INV-REG-2409', 12450)).toBe(true);
  });

  it('rejects a blank invoice number even with a non-zero amount', () => {
    expect(isDuplicateEligible('', 12450)).toBe(false);
  });

  it('rejects a whitespace-only invoice number', () => {
    expect(isDuplicateEligible('   ', 12450)).toBe(false);
  });

  it('rejects a valid invoice number with a zero amount', () => {
    expect(isDuplicateEligible('INV-ZERO-001', 0)).toBe(false);
  });

  it('rejects a missing invoice number', () => {
    expect(isDuplicateEligible(null, 12450)).toBe(false);
    expect(isDuplicateEligible(undefined, 12450)).toBe(false);
  });

  it('rejects a missing or non-finite amount', () => {
    expect(isDuplicateEligible('INV-REG-2409', null)).toBe(false);
    expect(isDuplicateEligible('INV-REG-2409', undefined)).toBe(false);
    expect(isDuplicateEligible('INV-REG-2409', NaN)).toBe(false);
  });
});

describe('scanInvoices — seed-context payment register', () => {
  it('(a) blank invoice number + $0.00 vs a $0.00 record is NOT a duplicate', () => {
    const findings = scanInvoices(
      [row({ invoiceNo: '', amount: 0, rawAmount: '$0.00' })],
      [],
      [],
      [],
      [historyRecord({ invoiceNo: '', amount: 0 })],
      RUN14_NOW,
    );
    expect(hasDuplicateFinding(findings)).toBe(false);
  });

  it('(b) blank invoice number + non-zero amount vs a matching record is NOT a duplicate', () => {
    const findings = scanInvoices(
      [row({ invoiceNo: '', amount: 12450 })],
      [],
      [],
      [],
      [historyRecord({ invoiceNo: '', amount: 12450 })],
      RUN14_NOW,
    );
    expect(hasDuplicateFinding(findings)).toBe(false);
  });

  it('(c) valid invoice number + $0.00 vs a $0.00 record is NOT a duplicate', () => {
    const findings = scanInvoices(
      [row({ invoiceNo: 'INV-ZERO-001', amount: 0, rawAmount: '$0.00' })],
      [],
      [],
      [],
      [historyRecord({ invoiceNo: 'INV-ZERO-001', amount: 0 })],
      RUN14_NOW,
    );
    expect(hasDuplicateFinding(findings)).toBe(false);
  });

  it('(d) valid invoice number + matching non-zero amount vs the same record IS still a duplicate', () => {
    const findings = scanInvoices(
      [row({ invoiceNo: 'INV-REG-2409', amount: 12450 })],
      [],
      [],
      [],
      [historyRecord({ invoiceNo: 'INV-REG-2409', amount: 12450 })],
      RUN14_NOW,
    );
    const exact = findings.find((f) => f.pattern.includes('EXACT_DUPLICATE'));
    expect(exact).toBeDefined();
    expect(exact?.severity).toBe('critical');
    expect(exact?.detail).toContain('already paid on 2026-11-06');
  });

  it('flags a modified duplicate when the resubmitted amount changed', () => {
    const findings = scanInvoices(
      [row({ invoiceNo: 'INV-REG-2410', amount: 12890, rawAmount: '$12,890.00' })],
      [],
      [],
      [],
      [historyRecord({ invoiceNo: 'INV-REG-2410', amount: 12450 })],
      RUN14_NOW,
    );
    expect(findings.some((f) => f.pattern.includes('MODIFIED_DUPLICATE'))).toBe(true);
  });
});

describe('scanInvoices — history (cross-submission)', () => {
  it('(c) valid invoice number + $0.00 vs a $0.00 history record is NOT a duplicate', () => {
    const findings = scanInvoices(
      [row({ invoiceNo: 'INV-ZERO-002', amount: 0, rawAmount: '$0.00' })],
      [historyRecord({ invoiceNo: 'INV-ZERO-002', amount: 0 })],
    );
    expect(hasDuplicateFinding(findings)).toBe(false);
  });

  it('(d) valid invoice number + matching non-zero amount vs history IS still a duplicate', () => {
    const findings = scanInvoices(
      [row({ invoiceNo: 'INV-HIST-2409', amount: 12450 })],
      [historyRecord({ invoiceNo: 'INV-HIST-2409', amount: 12450 })],
    );
    expect(findings.some((f) => f.pattern.includes('EXACT_DUPLICATE'))).toBe(true);
  });

  it('flags a modified duplicate against history when the amount changed', () => {
    const findings = scanInvoices(
      [row({ invoiceNo: 'INV-HIST-2410', amount: 12890, rawAmount: '$12,890.00' })],
      [historyRecord({ invoiceNo: 'INV-HIST-2410', amount: 12450 })],
    );
    expect(findings.some((f) => f.pattern.includes('MODIFIED_DUPLICATE'))).toBe(true);
  });
});

describe('scanInvoices — intra-batch', () => {
  it('(d) the same valid invoice twice at a non-zero amount IS still a duplicate', () => {
    const findings = scanInvoices([
      row({ invoiceNo: 'INV-BATCH-2409', amount: 12450 }),
      row({ invoiceNo: 'INV-BATCH-2409', amount: 12450 }),
    ]);
    expect(findings.some((f) => f.pattern.includes('EXACT_DUPLICATE'))).toBe(true);
  });

  it('the same valid invoice twice at $0.00 is NOT a duplicate', () => {
    const findings = scanInvoices([
      row({ invoiceNo: 'INV-ZERO-003', amount: 0, rawAmount: '$0.00' }),
      row({ invoiceNo: 'INV-ZERO-003', amount: 0, rawAmount: '$0.00' }),
    ]);
    expect(hasDuplicateFinding(findings)).toBe(false);
  });

  it('two blank-invoice rows at a non-zero amount are NOT duplicates', () => {
    const findings = scanInvoices([
      row({ invoiceNo: '', amount: 12450 }),
      row({ invoiceNo: '', amount: 12450 }),
    ]);
    expect(hasDuplicateFinding(findings)).toBe(false);
  });

  it('flags a modified duplicate when the same invoice appears twice at different amounts', () => {
    const findings = scanInvoices([
      row({ invoiceNo: 'INV-BATCH-2410', amount: 12450 }),
      row({ invoiceNo: 'INV-BATCH-2410', amount: 12890, rawAmount: '$12,890.00' }),
    ]);
    expect(findings.some((f) => f.pattern.includes('MODIFIED_DUPLICATE'))).toBe(true);
  });
});

describe('scanInvoices — near-duplicate grouping', () => {
  it('two valid-number rows at $0.00 under one vendor are NOT near-duplicates', () => {
    const findings = scanInvoices([
      row({ invoiceNo: 'INV-ZERO-101', amount: 0, rawAmount: '$0.00', po: 'PO-A-100' }),
      row({ invoiceNo: 'INV-ZERO-202', amount: 0, rawAmount: '$0.00', po: 'PO-B-200' }),
    ]);
    expect(hasDuplicateFinding(findings)).toBe(false);
  });

  it('a genuine near-duplicate at a non-zero amount still fires', () => {
    // Non-sequential numbers under different POs: the standing-order
    // suppression (C-2) must not swallow this — it only filters sequential
    // numbers under the same PO.
    const findings = scanInvoices([
      row({ invoiceNo: 'INV-7103', amount: 5000, rawAmount: '$5,000.00', po: 'PO-A-100' }),
      row({ invoiceNo: 'INV-9841', amount: 5000, rawAmount: '$5,000.00', po: 'PO-B-200' }),
    ]);
    const near = findings.find((f) => f.pattern === 'Duplicate / near-duplicate payment');
    expect(near).toBeDefined();
    expect(near?.severity).toBe('high');
    expect(near?.detail).toContain('Acme Industrial');
  });
});

describe('scanInvoices — run14 reproduction', () => {
  it('(e) the unreadable all-blank $0.00 document against its $0.00 record paid 2026-11-06 is NOT a duplicate', () => {
    const findings = scanInvoices(
      [row({ vendor: '', invoiceNo: '', amount: 0, rawAmount: '', po: '', bank: '' })],
      [],
      [],
      [],
      [historyRecord({ invoiceNo: '', vendor: '', amount: 0, po: '' })],
      RUN14_NOW,
    );
    // The scan still runs — the missing-PO finding fires for the blank row —
    // but the stored EXACT_DUPLICATE finding must no longer fire.
    expect(findings.length).toBeGreaterThan(0);
    expect(hasDuplicateFinding(findings)).toBe(false);
    expect(
      findings.some((f) => /already paid on 2026-11-06/i.test(`${f.detail} ${f.evidence ?? ''}`)),
    ).toBe(false);
  });
});

describe('runControls — IP-C1 exact duplicate', () => {
  it('(d) the same valid invoice twice at a non-zero amount still fails IP-C1', () => {
    const invoices = normalizeMany([
      { invoice_number: 'INV-DUP-2409', vendor: 'Acme', amount: '12450', po: 'PO-1' },
      { invoice_number: 'INV-DUP-2409', vendor: 'Acme', amount: '12450', po: 'PO-1' },
    ]);
    expect(ctrl(runControls({ invoices }), 'IP-C1').status).toBe('failed');
  });

  it('(c) the same valid invoice twice at $0.00 does NOT fail IP-C1', () => {
    const invoices = normalizeMany([
      { invoice_number: 'INV-ZERO-001', vendor: 'Acme', amount: '0', po: 'PO-1' },
      { invoice_number: 'INV-ZERO-001', vendor: 'Acme', amount: '0', po: 'PO-1' },
    ]);
    // Both rows are guard-ineligible, so the control has nothing to check.
    expect(ctrl(runControls({ invoices }), 'IP-C1').status).toBe('skipped_field_absent');
  });

  it('(a) two blank-invoice rows at a non-zero amount do NOT fail IP-C1', () => {
    const invoices = normalizeMany([
      { invoice_number: '', vendor: 'Acme', amount: '12450', po: 'PO-1' },
      { invoice_number: '', vendor: 'Acme', amount: '12450', po: 'PO-1' },
    ]);
    expect(ctrl(runControls({ invoices }), 'IP-C1').status).toBe('skipped_field_absent');
  });
});

describe('runControls — IP-C2 modified duplicate', () => {
  it('the same valid invoice at two non-zero amounts still fails IP-C2', () => {
    const invoices = normalizeMany([
      { invoice_number: 'INV-MOD-2410', vendor: 'Acme', amount: '12450', po: 'PO-1' },
      { invoice_number: 'INV-MOD-2410', vendor: 'Acme', amount: '12890', po: 'PO-1' },
    ]);
    expect(ctrl(runControls({ invoices }), 'IP-C2').status).toBe('failed');
  });

  it('the same invoice at $0.00 and a non-zero amount does NOT fail IP-C2', () => {
    const invoices = normalizeMany([
      { invoice_number: 'INV-MOD-2411', vendor: 'Acme', amount: '0', po: 'PO-1' },
      { invoice_number: 'INV-MOD-2411', vendor: 'Acme', amount: '12890', po: 'PO-1' },
    ]);
    // The $0.00 row is guard-ineligible, leaving a single eligible row.
    expect(ctrl(runControls({ invoices }), 'IP-C2').status).toBe('passed');
  });
});

describe('runControls — IP-C3 cross-submission duplicate', () => {
  it('(d) a valid invoice matching a prior record at a non-zero amount still fails IP-C3', () => {
    const invoices = normalizeMany([
      { invoice_number: 'INV-REG-2409', vendor: 'Acme', amount: '12450', po: 'PO-1' },
    ]);
    const results = runControls({
      invoices,
      seedContext: [historyRecord({ invoiceNo: 'INV-REG-2409', amount: 12450 })],
    });
    expect(ctrl(results, 'IP-C3').status).toBe('failed');
  });

  it('(c) a valid invoice at $0.00 matching a $0.00 prior record does NOT fail IP-C3', () => {
    const invoices = normalizeMany([
      { invoice_number: 'INV-ZERO-001', vendor: 'Acme', amount: '0', po: 'PO-1' },
    ]);
    const results = runControls({
      invoices,
      seedContext: [historyRecord({ invoiceNo: 'INV-ZERO-001', amount: 0 })],
    });
    expect(ctrl(results, 'IP-C3').status).toBe('skipped_field_absent');
  });

  it('(a) a blank invoice at $0.00 against a blank $0.00 prior record does NOT fail IP-C3', () => {
    const invoices = normalizeMany([
      { invoice_number: '', vendor: 'Acme', amount: '0', po: 'PO-1' },
    ]);
    const results = runControls({
      invoices,
      seedContext: [historyRecord({ invoiceNo: '', amount: 0 })],
    });
    expect(ctrl(results, 'IP-C3').status).toBe('skipped_field_absent');
  });

  it('(b) a blank invoice at a non-zero amount against a matching prior record does NOT fail IP-C3', () => {
    const invoices = normalizeMany([
      { invoice_number: '', vendor: 'Acme', amount: '12450', po: 'PO-1' },
    ]);
    const results = runControls({
      invoices,
      seedContext: [historyRecord({ invoiceNo: '', amount: 12450 })],
    });
    expect(ctrl(results, 'IP-C3').status).toBe('skipped_field_absent');
  });

  it('a valid non-zero invoice does NOT fail IP-C3 when the prior record is $0.00', () => {
    const invoices = normalizeMany([
      { invoice_number: 'INV-REG-2411', vendor: 'Acme', amount: '12450', po: 'PO-1' },
    ]);
    const results = runControls({
      invoices,
      seedContext: [historyRecord({ invoiceNo: 'INV-REG-2411', amount: 0 })],
    });
    // The prior-side guard drops the $0.00 record from the match map.
    expect(ctrl(results, 'IP-C3').status).toBe('passed');
  });
});

describe('runControls — IP-C15 near duplicate', () => {
  it('(f) two valid-number rows at $0.00 under one vendor do NOT fail IP-C15', () => {
    const invoices = normalizeMany([
      { invoice_number: 'INV-ZERO-101', vendor: 'Acme Industrial', amount: '0', po: 'PO-A-100' },
      { invoice_number: 'INV-ZERO-202', vendor: 'Acme Industrial', amount: '0', po: 'PO-B-200' },
    ]);
    expect(ctrl(runControls({ invoices }), 'IP-C15').status).toBe('skipped_field_absent');
  });

  it('(f) a genuine near-duplicate at a non-zero amount still fails IP-C15', () => {
    const invoices = normalizeMany([
      { invoice_number: 'INV-7103', vendor: 'Acme Industrial', amount: '5000', po: 'PO-A-100' },
      { invoice_number: 'INV-9841', vendor: 'Acme Industrial', amount: '5000', po: 'PO-B-200' },
    ]);
    expect(ctrl(runControls({ invoices }), 'IP-C15').status).toBe('failed');
  });
});
