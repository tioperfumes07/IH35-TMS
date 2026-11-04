// ACCT-F11104 — QuickBooks bill-payment EVIDENCE for open USMCA bills (read-only proposal).
//
// OWNER (Jorge, 2026-11-04): "the bills are unpaid because we have not applied payments. you can check
// quickbooks, most bill payments appear in quickbooks." / 09:12 CT: "this qbo account was transportation,
// then we transitioned to usmca, but it is mixed, before aug 7, it was all transportation, but bill payments
// should still be correct."
//
// This module is PURE: it takes the open USMCA app bills, the QBO Bills + BillPayments dated on/after the
// USMCA cutover, and the unmatched USMCA bank debits, and returns a reviewable proposal
// bill -> QBO bill -> QBO payment -> app bank line. It writes nothing and computes no GL.
//
// Match rules (measured on prod 2026-11-04 against the 08-07..08-15 slice of the QBO mirror: 14 of 15
// doc-number hits tie on amount under this rule):
//   * QBO driver bills carry DocNumber "<load>-<settlement>[-USMCA-nnn]"; the app bill_number is the load
//     number. A QBO bill is a candidate when the DocNumber equals the app bill_number OR its part before the
//     first "-" equals it.
//   * QBO bills are entered NET of the deductions the app records as non-cash bill payments (escrow $25/$35,
//     advances), so the QBO bill total must equal the app bill's OPEN balance (amount_cents - paid_cents).
//   * Vendor names must agree (accent/case/punctuation-insensitive; at least 2 shared name tokens, or one
//     name contains the other) — QBO spells some drivers differently ("Collardo" vs "Collado").
//   * QBO bill date within 14 days of the app bill date.
//   * QBO activity dated before the cutover is never a candidate (it is Transportation's history), and an
//     app bill dated before the cutover is flagged in its own group, never matched.
// A row is POSTABLE only when the bill, the QBO payment and the bank line are each an exact unique 1:1:
// one QBO bill, fully settled by exactly one QBO payment line for the open balance, that payment's every
// linked bill is an exactly-matched app bill, and exactly one unmatched USMCA bank debit equals the payment
// total within 5 days and is claimed by no other payment.

export const QBO_EVIDENCE_CUTOVER_DATE = "2026-08-07";
const BILL_DATE_WINDOW_DAYS = 14;
const BANK_DATE_WINDOW_DAYS = 5;

export type EvidenceAppBill = {
  id: string;
  bill_number: string | null;
  bill_date: string; // YYYY-MM-DD
  amount_cents: number;
  paid_cents: number;
  vendor_name: string | null;
  bill_category: string | null;
  driver_bill_id: string | null;
  settlement_id: string | null;
};

export type EvidenceQboBill = {
  id: string;
  doc_number: string | null;
  vendor_name: string | null;
  txn_date: string;
  total_cents: number;
  balance_cents: number;
};

export type EvidenceQboPaymentLine = { amount_cents: number; bill_ids: string[] };

export type EvidenceQboBillPayment = {
  id: string;
  doc_number: string | null;
  vendor_name: string | null;
  txn_date: string;
  total_cents: number;
  pay_type: string | null;
  bank_account_qbo_id: string | null;
  lines: EvidenceQboPaymentLine[];
};

export type EvidenceBankLine = {
  id: string;
  bank_account_id: string;
  transaction_date: string;
  amount_cents: number; // signed; debits are negative
  description: string | null;
  status: string | null;
};

export type EvidenceGroup = "exact_unique" | "ambiguous" | "no_qbo_payment" | "pre_cutover_flagged";

export type EvidenceRow = {
  group: EvidenceGroup;
  reason: string;
  postable: boolean;
  app_bill_id: string;
  bill_number: string | null;
  vendor_name: string | null;
  bill_category: string | null;
  bill_date: string;
  open_cents: number;
  driver_bill_id: string | null;
  settlement_id: string | null;
  qbo_bill_ids: string[];
  qbo_bill_doc_numbers: string[];
  qbo_payment_id: string | null;
  qbo_payment_doc_number: string | null;
  qbo_payment_date: string | null;
  qbo_payment_total_cents: number | null;
  qbo_payment_pay_type: string | null;
  qbo_payment_fully_mapped: boolean | null;
  bank_status: "unique" | "none" | "multiple" | "not_evaluated";
  bank_line_ids: string[];
};

export type EvidenceGroupTotal = { count: number; open_cents: number };

export type EvidenceProposal = {
  cutover_date: string;
  rows: EvidenceRow[];
  totals: Record<EvidenceGroup, EvidenceGroupTotal> & { postable: EvidenceGroupTotal };
  qbo_bills_considered: number;
  qbo_payments_considered: number;
  bank_lines_considered: number;
};

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function normalizeName(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return stripAccents(raw)
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

export function vendorNamesAgree(a: string | null | undefined, b: string | null | undefined): boolean {
  const ta = normalizeName(a);
  const tb = normalizeName(b);
  if (ta.length === 0 || tb.length === 0) return false;
  const ja = ta.join(" ");
  const jb = tb.join(" ");
  if (ja === jb || ja.includes(jb) || jb.includes(ja)) return true;
  const setB = new Set(tb);
  const shared = ta.filter((t) => setB.has(t)).length;
  return shared >= 2;
}

export function qboDocMatchesBillNumber(docNumber: string | null, billNumber: string | null): boolean {
  if (!docNumber || !billNumber) return false;
  const doc = docNumber.trim().toLowerCase();
  const bn = billNumber.trim().toLowerCase();
  if (!bn) return false;
  if (doc === bn) return true;
  return doc.split("-")[0]?.trim() === bn;
}

function dayDiff(a: string, b: string): number {
  const ta = Date.parse(`${a.slice(0, 10)}T00:00:00Z`);
  const tb = Date.parse(`${b.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return Number.POSITIVE_INFINITY;
  return Math.abs(ta - tb) / 86_400_000;
}

function emptyTotals(): EvidenceProposal["totals"] {
  return {
    exact_unique: { count: 0, open_cents: 0 },
    ambiguous: { count: 0, open_cents: 0 },
    no_qbo_payment: { count: 0, open_cents: 0 },
    pre_cutover_flagged: { count: 0, open_cents: 0 },
    postable: { count: 0, open_cents: 0 },
  };
}

export function buildQboBillPaymentEvidence(input: {
  appBills: EvidenceAppBill[];
  qboBills: EvidenceQboBill[];
  qboBillPayments: EvidenceQboBillPayment[];
  bankLines: EvidenceBankLine[];
  cutoverDate?: string;
}): EvidenceProposal {
  const cutover = input.cutoverDate ?? QBO_EVIDENCE_CUTOVER_DATE;
  // Pre-cutover QBO activity is Transportation's history: never a candidate.
  const qboBills = input.qboBills.filter((b) => b.txn_date.slice(0, 10) >= cutover);
  const qboPayments = input.qboBillPayments.filter((p) => p.txn_date.slice(0, 10) >= cutover);
  const bankDebits = input.bankLines.filter((l) => l.amount_cents < 0);

  // QBO bill id -> payment lines that settle it.
  const linesByBill = new Map<string, Array<{ payment: EvidenceQboBillPayment; amount_cents: number; shared: boolean }>>();
  for (const p of qboPayments) {
    for (const line of p.lines) {
      for (const billId of line.bill_ids) {
        const arr = linesByBill.get(billId) ?? [];
        arr.push({ payment: p, amount_cents: line.amount_cents, shared: line.bill_ids.length > 1 });
        linesByBill.set(billId, arr);
      }
    }
  }

  const rows: EvidenceRow[] = [];
  const candidateByApp = new Map<string, EvidenceQboBill[]>();
  const claimsByQboBill = new Map<string, string[]>();

  for (const b of input.appBills) {
    const open = b.amount_cents - b.paid_cents;
    if (b.bill_date.slice(0, 10) >= cutover) {
      const cands = qboBills.filter(
        (q) =>
          qboDocMatchesBillNumber(q.doc_number, b.bill_number) &&
          vendorNamesAgree(q.vendor_name, b.vendor_name) &&
          q.total_cents === open &&
          dayDiff(q.txn_date, b.bill_date) <= BILL_DATE_WINDOW_DAYS
      );
      candidateByApp.set(b.id, cands);
      if (cands.length === 1) {
        const claim = claimsByQboBill.get(cands[0]!.id) ?? [];
        claim.push(b.id);
        claimsByQboBill.set(cands[0]!.id, claim);
      }
    }
  }

  for (const b of input.appBills) {
    const open = b.amount_cents - b.paid_cents;
    const base: EvidenceRow = {
      group: "no_qbo_payment",
      reason: "",
      postable: false,
      app_bill_id: b.id,
      bill_number: b.bill_number,
      vendor_name: b.vendor_name,
      bill_category: b.bill_category,
      bill_date: b.bill_date.slice(0, 10),
      open_cents: open,
      driver_bill_id: b.driver_bill_id,
      settlement_id: b.settlement_id,
      qbo_bill_ids: [],
      qbo_bill_doc_numbers: [],
      qbo_payment_id: null,
      qbo_payment_doc_number: null,
      qbo_payment_date: null,
      qbo_payment_total_cents: null,
      qbo_payment_pay_type: null,
      qbo_payment_fully_mapped: null,
      bank_status: "not_evaluated",
      bank_line_ids: [],
    };

    if (b.bill_date.slice(0, 10) < cutover) {
      rows.push({ ...base, group: "pre_cutover_flagged", reason: `bill_date_before_${cutover}` });
      continue;
    }

    const cands = candidateByApp.get(b.id) ?? [];
    base.qbo_bill_ids = cands.map((c) => c.id);
    base.qbo_bill_doc_numbers = cands.map((c) => c.doc_number ?? "");

    if (cands.length === 0) {
      const docOnly = qboBills.filter(
        (q) => qboDocMatchesBillNumber(q.doc_number, b.bill_number) && vendorNamesAgree(q.vendor_name, b.vendor_name)
      );
      if (docOnly.length > 0) {
        rows.push({
          ...base,
          group: "ambiguous",
          reason: "qbo_bill_found_amount_or_date_differs",
          qbo_bill_ids: docOnly.map((c) => c.id),
          qbo_bill_doc_numbers: docOnly.map((c) => c.doc_number ?? ""),
        });
      } else {
        rows.push({ ...base, group: "no_qbo_payment", reason: "no_matching_qbo_bill" });
      }
      continue;
    }
    if (cands.length > 1) {
      rows.push({ ...base, group: "ambiguous", reason: "multiple_qbo_bills_match" });
      continue;
    }
    const qb = cands[0]!;
    if ((claimsByQboBill.get(qb.id) ?? []).length > 1) {
      rows.push({ ...base, group: "ambiguous", reason: "qbo_bill_matches_multiple_app_bills" });
      continue;
    }
    const lines = linesByBill.get(qb.id) ?? [];
    if (lines.length === 0) {
      rows.push({ ...base, group: "no_qbo_payment", reason: qb.balance_cents > 0 ? "qbo_bill_open_unpaid" : "qbo_bill_closed_without_bill_payment" });
      continue;
    }
    if (lines.length > 1) {
      rows.push({ ...base, group: "ambiguous", reason: "qbo_bill_settled_by_multiple_payments" });
      continue;
    }
    const { payment, amount_cents } = lines[0]!;
    const withPayment: EvidenceRow = {
      ...base,
      qbo_payment_id: payment.id,
      qbo_payment_doc_number: payment.doc_number,
      qbo_payment_date: payment.txn_date.slice(0, 10),
      qbo_payment_total_cents: payment.total_cents,
      qbo_payment_pay_type: payment.pay_type,
    };
    if (amount_cents !== open) {
      rows.push({ ...withPayment, group: "ambiguous", reason: "qbo_payment_amount_differs_from_open_balance" });
      continue;
    }
    rows.push({ ...withPayment, group: "exact_unique", reason: "doc_vendor_amount_date_unique" });
  }

  // Payment-level checks for the exact rows: does every bill the payment settles map to an exact app bill?
  const exactQboBillIds = new Set(rows.filter((r) => r.group === "exact_unique").flatMap((r) => r.qbo_bill_ids));
  const fullyMapped = new Map<string, boolean>();
  for (const p of qboPayments) {
    const billIds = p.lines.flatMap((l) => l.bill_ids);
    const linesSum = p.lines.reduce((s, l) => s + l.amount_cents, 0);
    fullyMapped.set(p.id, billIds.length > 0 && billIds.every((id) => exactQboBillIds.has(id)) && linesSum === p.total_cents);
  }

  // Bank side: one unmatched USMCA debit equal to the payment total within the window, claimed by one payment.
  const bankByPayment = new Map<string, EvidenceBankLine[]>();
  const paymentsByBank = new Map<string, Set<string>>();
  const exactPaymentIds = new Set(rows.filter((r) => r.group === "exact_unique" && r.qbo_payment_id).map((r) => r.qbo_payment_id!));
  for (const pid of exactPaymentIds) {
    const p = qboPayments.find((x) => x.id === pid)!;
    const hits = bankDebits.filter(
      (l) => -l.amount_cents === p.total_cents && dayDiff(l.transaction_date, p.txn_date) <= BANK_DATE_WINDOW_DAYS
    );
    bankByPayment.set(pid, hits);
    for (const h of hits) {
      const s = paymentsByBank.get(h.id) ?? new Set<string>();
      s.add(pid);
      paymentsByBank.set(h.id, s);
    }
  }

  const totals = emptyTotals();
  for (const r of rows) {
    if (r.group === "exact_unique" && r.qbo_payment_id) {
      const hits = bankByPayment.get(r.qbo_payment_id) ?? [];
      r.qbo_payment_fully_mapped = fullyMapped.get(r.qbo_payment_id) ?? false;
      r.bank_line_ids = hits.map((h) => h.id);
      if (hits.length === 0) r.bank_status = "none";
      else if (hits.length > 1 || (paymentsByBank.get(hits[0]!.id)?.size ?? 0) > 1) r.bank_status = "multiple";
      else r.bank_status = "unique";
      r.postable = r.bank_status === "unique" && r.qbo_payment_fully_mapped === true;
    }
    totals[r.group].count += 1;
    totals[r.group].open_cents += r.open_cents;
    if (r.postable) {
      totals.postable.count += 1;
      totals.postable.open_cents += r.open_cents;
    }
  }

  return {
    cutover_date: cutover,
    rows,
    totals,
    qbo_bills_considered: qboBills.length,
    qbo_payments_considered: qboPayments.length,
    bank_lines_considered: bankDebits.length,
  };
}

/** Map a raw QBO BillPayment JSON object to the matcher shape (LinkedTxn TxnType=Bill only). */
export function mapQboBillPayment(row: Record<string, unknown>): EvidenceQboBillPayment {
  const vendor = row.VendorRef as Record<string, unknown> | undefined;
  const check = row.CheckPayment as Record<string, unknown> | undefined;
  const bankRef = check?.BankAccountRef as Record<string, unknown> | undefined;
  const lines = Array.isArray(row.Line) ? (row.Line as Array<Record<string, unknown>>) : [];
  return {
    id: String(row.Id ?? ""),
    doc_number: row.DocNumber != null ? String(row.DocNumber) : null,
    vendor_name: vendor?.name != null ? String(vendor.name) : null,
    txn_date: String(row.TxnDate ?? "").slice(0, 10),
    total_cents: toCents(row.TotalAmt),
    pay_type: row.PayType != null ? String(row.PayType) : null,
    bank_account_qbo_id: bankRef?.value != null ? String(bankRef.value) : null,
    lines: lines.map((l) => ({
      amount_cents: toCents(l.Amount),
      bill_ids: (Array.isArray(l.LinkedTxn) ? (l.LinkedTxn as Array<Record<string, unknown>>) : [])
        .filter((t) => String(t.TxnType ?? "") === "Bill")
        .map((t) => String(t.TxnId ?? "")),
    })),
  };
}

/** Map a raw QBO Bill JSON object to the matcher shape. */
export function mapQboBill(row: Record<string, unknown>): EvidenceQboBill {
  const vendor = row.VendorRef as Record<string, unknown> | undefined;
  return {
    id: String(row.Id ?? ""),
    doc_number: row.DocNumber != null ? String(row.DocNumber) : null,
    vendor_name: vendor?.name != null ? String(vendor.name) : null,
    txn_date: String(row.TxnDate ?? "").slice(0, 10),
    total_cents: toCents(row.TotalAmt),
    balance_cents: toCents(row.Balance),
  };
}

/** Exact integer cents from a QBO decimal-dollar value (string math, no float multiply). */
export function toCents(raw: unknown): number {
  if (raw == null) return 0;
  const s = String(raw).trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) return 0;
  const neg = s.startsWith("-");
  const [whole, frac = ""] = s.replace("-", "").split(".");
  const cents = Number(whole) * 100 + Number((frac + "00").slice(0, 2)) + (Number((frac + "000")[2]) >= 5 ? 1 : 0);
  return neg ? -cents : cents;
}
