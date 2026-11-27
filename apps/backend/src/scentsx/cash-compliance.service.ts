/**
 * SCENTSX B9 — cash log, Form 8300 cases, structuring alerts (migration 202616920100).
 *
 * Owner 2026-11-26 20:18 CT "compliance for money forms … money laundering etc fincen". Rules from the IRS Form 8300
 * instructions (rev. 12/2023), design https://claude.ai/artifact/VQ83ogvJyPpVoop1FNKJXC section 8:
 *  - cash = currency (US or foreign); a cashier's check / money order / bank draft / traveler's check of $10,000 or less only in a
 *    retail sale of a consumer durable or when known to be used to avoid reporting (counts_as_cash, a generated column);
 *  - report when cash from one payer in one transaction or RELATED transactions is over $10,000. Related here = received within
 *    24 hours of each other, on the same sales order or invoice, or linked by hand — within 12 months, and not already on a case;
 *  - file within 15 days of the receipt that crosses (due_on), payer identity is required before such cash is accepted;
 *  - several receipts just under the threshold within 30 days raise a structuring alert to the owner (never to the payer).
 * All thresholds come from scentsx.compliance_settings. This service never moves or posts money: the payment itself is the
 * EXISTING accounting.payments row (payment_id), posted by the existing payment engine.
 */
import type pg from "pg";
import { scopeToScentsx, ScentsxLinkInvalid, ScentsxLinkNotFound } from "./links.service.js";

type Q = Pick<pg.PoolClient, "query">;

export class CashComplianceBlocked extends Error {
  constructor(message: string, readonly missing: string[] = []) { super(message); this.name = "CashComplianceBlocked"; }
}

export type PaymentForm = "currency_usd" | "currency_foreign" | "cashiers_check" | "money_order" | "bank_draft" | "travelers_check" | "personal_check" | "wire" | "card";

export type ComplianceSettings = {
  cash_report_threshold_cents: number; filing_days: number; related_window_hours: number; aggregation_window_days: number;
  structuring_floor_cents: number; structuring_window_days: number; structuring_min_count: number;
};

export async function complianceSettings(c: Q): Promise<ComplianceSettings> {
  const co = await scopeToScentsx(c);
  const r = await c.query<Record<keyof ComplianceSettings, string | number>>(
    `SELECT cash_report_threshold_cents, filing_days, related_window_hours, aggregation_window_days, structuring_floor_cents,
            structuring_window_days, structuring_min_count
       FROM scentsx.compliance_settings WHERE operating_company_id = $1::uuid`, [co]
  );
  const s = r.rows[0];
  if (!s) throw new ScentsxLinkInvalid("ScentsX compliance settings row is missing (migration 202616920100)");
  return Object.fromEntries(Object.entries(s).map(([k, v]) => [k, Number(v)])) as ComplianceSettings;
}

export type PayerInput = {
  payer_kind: "individual" | "business"; legal_name: string; contact_company_id?: string | null; customer_id?: string | null;
  address_line?: string | null; city?: string | null; state_region?: string | null; postal_code?: string | null; country?: string | null;
  date_of_birth?: string | null; occupation?: string | null; tin_kind?: "ssn" | "itin" | "ein" | "foreign_none" | null; tin_last4?: string | null;
  id_type?: "drivers_license" | "passport" | "alien_registration" | "ine_mexico" | "other_government" | null; id_issuer?: string | null;
  id_number_last4?: string | null; id_copy_file_id?: string | null;
};

/** What Form 8300 needs about the payer and is still missing. Empty = the payer may hand over reportable cash. */
export function missingIdentity(p: Partial<PayerInput>): string[] {
  const need: Array<[keyof PayerInput, boolean]> = [
    ["legal_name", true], ["address_line", true], ["city", true], ["country", true], ["occupation", true], ["tin_kind", true],
    ["tin_last4", p.tin_kind !== "foreign_none"],
  ];
  if (p.payer_kind !== "business") {
    need.push(["date_of_birth", true], ["id_type", true], ["id_issuer", true], ["id_number_last4", true], ["id_copy_file_id", true]);
  }
  return need.filter(([k, req]) => req && !String(p[k] ?? "").trim()).map(([k]) => k);
}

export async function createPayer(c: Q, uid: string, p: PayerInput) {
  const co = await scopeToScentsx(c);
  const complete = missingIdentity(p).length === 0;
  const r = await c.query<{ id: string }>(
    `INSERT INTO scentsx.cash_payers (operating_company_id, payer_kind, legal_name, contact_company_id, customer_id, address_line, city, state_region,
        postal_code, country, date_of_birth, occupation, tin_kind, tin_last4, id_type, id_issuer, id_number_last4, id_copy_file_id,
        identity_completed_at, created_by, updated_by)
     VALUES ($1::uuid, $2, $3, $4::uuid, $5::uuid, $6, $7, $8, $9, $10, $11::date, $12, $13, $14, $15, $16, $17, $18::uuid,
        CASE WHEN $19 THEN now() END, $20::uuid, $20::uuid) RETURNING id::text`,
    [co, p.payer_kind, p.legal_name.trim(), p.contact_company_id ?? null, p.customer_id ?? null, p.address_line ?? null, p.city ?? null,
     p.state_region ?? null, p.postal_code ?? null, p.country ?? null, p.date_of_birth ?? null, p.occupation ?? null, p.tin_kind ?? null,
     p.tin_last4 ?? null, p.id_type ?? null, p.id_issuer ?? null, p.id_number_last4 ?? null, p.id_copy_file_id ?? null, complete, uid]
  );
  return { id: r.rows[0]!.id, identity_complete: complete, missing: missingIdentity(p) };
}

export async function updatePayer(c: Q, uid: string, payerId: string, patch: Partial<PayerInput>) {
  await scopeToScentsx(c);
  const cur = await c.query<PayerInput & { id: string }>(`SELECT * FROM scentsx.cash_payers WHERE id = $1::uuid AND voided_at IS NULL FOR UPDATE`, [payerId]);
  const row = cur.rows[0];
  if (!row) throw new ScentsxLinkNotFound();
  const merged = { ...row, ...patch, date_of_birth: patch.date_of_birth ?? (row.date_of_birth ? String(row.date_of_birth).slice(0, 10) : null) } as PayerInput;
  const missing = missingIdentity(merged);
  await c.query(
    `UPDATE scentsx.cash_payers SET payer_kind = $2, legal_name = $3, address_line = $4, city = $5, state_region = $6, postal_code = $7, country = $8,
        date_of_birth = $9::date, occupation = $10, tin_kind = $11, tin_last4 = $12, id_type = $13, id_issuer = $14, id_number_last4 = $15,
        id_copy_file_id = $16::uuid, contact_company_id = $17::uuid, customer_id = $18::uuid,
        identity_completed_at = CASE WHEN $19 THEN coalesce(identity_completed_at, now()) END, updated_by = $20::uuid, updated_at = now()
      WHERE id = $1::uuid`,
    [payerId, merged.payer_kind, merged.legal_name, merged.address_line ?? null, merged.city ?? null, merged.state_region ?? null,
     merged.postal_code ?? null, merged.country ?? null, merged.date_of_birth ?? null, merged.occupation ?? null, merged.tin_kind ?? null,
     merged.tin_last4 ?? null, merged.id_type ?? null, merged.id_issuer ?? null, merged.id_number_last4 ?? null, merged.id_copy_file_id ?? null,
     merged.contact_company_id ?? null, merged.customer_id ?? null, missing.length === 0, uid]
  );
  return { id: payerId, identity_complete: missing.length === 0, missing };
}

export type ReceiptInput = {
  payer_id: string; received_at: string; payment_form: PaymentForm; amount_cents: number; payment_id?: string | null; invoice_id?: string | null;
  sales_order_id?: string | null; foreign_currency_code?: string | null; instrument_issuer?: string | null; instrument_serial?: string | null;
  consumer_durable_retail?: boolean; known_avoidance?: boolean; related_receipt_id?: string | null; notes?: string | null;
};

export type ReceiptResult = {
  receipt_id: string; receipt_no: string; counts_as_cash: boolean; related_unreported_cents: number;
  case: { id: string; case_no: string; due_on: string; total_cash_cents: number } | null;
  structuring_alert_id: string | null;
};

/** The receipts (not yet on a case, counting as cash, not voided) related to a receipt of this payer at this time. */
async function relatedUnreported(c: Q, s: ComplianceSettings, payerId: string, at: string, salesOrderId: string | null, invoiceId: string | null, linkId: string | null, excludeId: string | null) {
  const r = await c.query<{ id: string; amount_cents: string; received_at: string }>(
    `WITH RECURSIVE linked AS (
        SELECT id FROM scentsx.cash_receipts WHERE id = $7::uuid
        UNION
        SELECT x.id FROM scentsx.cash_receipts x JOIN linked l ON x.related_receipt_id = l.id OR x.id = (SELECT related_receipt_id FROM scentsx.cash_receipts WHERE id = l.id)
     )
     SELECT r.id::text, r.amount_cents::text, r.received_at::text FROM scentsx.cash_receipts r
      WHERE r.payer_id = $1::uuid AND r.counts_as_cash AND r.voided_at IS NULL AND r.case_id IS NULL
        AND ($8::uuid IS NULL OR r.id <> $8::uuid)
        AND r.received_at > $2::timestamptz - make_interval(days => $3) AND r.received_at <= $2::timestamptz + make_interval(hours => $4)
        AND ( abs(extract(epoch FROM (r.received_at - $2::timestamptz))) <= $4 * 3600
              OR ($5::uuid IS NOT NULL AND r.sales_order_id = $5::uuid)
              OR ($6::uuid IS NOT NULL AND r.invoice_id = $6::uuid)
              OR r.id IN (SELECT id FROM linked) )
      ORDER BY r.received_at`,
    [payerId, at, s.aggregation_window_days, s.related_window_hours, salesOrderId, invoiceId, linkId, excludeId]
  );
  return r.rows.map((x) => ({ id: x.id, amount_cents: Number(x.amount_cents), received_at: x.received_at }));
}

const countsAsCash = (form: PaymentForm, cents: number, durable: boolean, avoid: boolean) =>
  form === "currency_usd" || form === "currency_foreign" ||
  (["cashiers_check", "money_order", "bank_draft", "travelers_check"].includes(form) && cents <= 1_000_000 && (durable || avoid));

async function nextNumber(c: Q, co: string, table: "cash_receipts" | "form_8300_cases", prefix: string) {
  await c.query(`SELECT pg_advisory_xact_lock(hashtext('scentsx.' || $1))`, [table]);
  const col = table === "cash_receipts" ? "receipt_no" : "case_no";
  const r = await c.query<{ n: string }>(
    `SELECT coalesce(max(substring(${col} FROM '([0-9]+)$')::int), 0) + 1 AS n FROM scentsx.${table} WHERE operating_company_id = $1::uuid AND ${col} LIKE $2`,
    [co, `${prefix}%`]
  );
  return `${prefix}${String(r.rows[0]!.n).padStart(6, "0")}`;
}

export async function recordCashReceipt(c: Q, uid: string, input: ReceiptInput): Promise<ReceiptResult> {
  const co = await scopeToScentsx(c);
  const s = await complianceSettings(c);
  if (!Number.isInteger(input.amount_cents) || input.amount_cents <= 0) throw new ScentsxLinkInvalid("amount must be a positive whole number of cents");
  const payer = await c.query<PayerInput & { identity_completed_at: string | null }>(
    `SELECT * FROM scentsx.cash_payers WHERE id = $1::uuid AND voided_at IS NULL FOR UPDATE`, [input.payer_id]
  );
  const p = payer.rows[0];
  if (!p) throw new ScentsxLinkNotFound();
  const counts = countsAsCash(input.payment_form, input.amount_cents, !!input.consumer_durable_retail, !!input.known_avoidance);
  let related: Awaited<ReturnType<typeof relatedUnreported>> = [];
  let total = 0;
  if (counts) {
    related = await relatedUnreported(c, s, input.payer_id, input.received_at, input.sales_order_id ?? null, input.invoice_id ?? null, input.related_receipt_id ?? null, null);
    total = related.reduce((t, r) => t + r.amount_cents, 0) + input.amount_cents;
    if (total > s.cash_report_threshold_cents) {
      const missing = missingIdentity({ ...p, date_of_birth: p.date_of_birth ? String(p.date_of_birth) : null });
      if (missing.length) {
        throw new CashComplianceBlocked(
          `This cash takes ${p.legal_name}'s related cash to $${(total / 100).toFixed(2)}, over the $${(s.cash_report_threshold_cents / 100).toFixed(2)} Form 8300 line. ` +
          `It cannot be accepted until the payer's identity is complete: ${missing.join(", ")}.`, missing
        );
      }
    }
  }
  const receiptNo = await nextNumber(c, co, "cash_receipts", "CR-");
  const ins = await c.query<{ id: string; counts_as_cash: boolean }>(
    `INSERT INTO scentsx.cash_receipts (operating_company_id, receipt_no, payer_id, payment_id, invoice_id, sales_order_id, received_at, payment_form,
        amount_cents, foreign_currency_code, instrument_issuer, instrument_serial, consumer_durable_retail, known_avoidance, related_receipt_id, notes, created_by)
     VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7::timestamptz, $8, $9, $10, $11, $12, $13, $14, $15::uuid, $16, $17::uuid)
     RETURNING id::text, counts_as_cash`,
    [co, receiptNo, input.payer_id, input.payment_id ?? null, input.invoice_id ?? null, input.sales_order_id ?? null, input.received_at, input.payment_form,
     input.amount_cents, input.foreign_currency_code ?? null, input.instrument_issuer ?? null, input.instrument_serial ?? null,
     !!input.consumer_durable_retail, !!input.known_avoidance, input.related_receipt_id ?? null, input.notes ?? null, uid]
  );
  const receiptId = ins.rows[0]!.id;
  if (ins.rows[0]!.counts_as_cash !== counts) throw new Error("counts_as_cash disagrees with the database definition — refusing");

  let caseOut: ReceiptResult["case"] = null;
  if (counts && total > s.cash_report_threshold_cents) {
    const caseNo = await nextNumber(c, co, "form_8300_cases", `F8300-${input.received_at.slice(0, 4)}-`);
    const first = related[0]?.received_at ?? input.received_at;
    const cs = await c.query<{ id: string; due_on: string }>(
      `INSERT INTO scentsx.form_8300_cases (operating_company_id, case_no, payer_id, reason, first_received_at, crossed_at, total_cash_cents, due_on, created_by)
       VALUES ($1::uuid, $2, $3::uuid, 'over_threshold', $4::timestamptz, $5::timestamptz, $6, (($5::timestamptz AT TIME ZONE 'America/Chicago')::date + $7::int), $8::uuid)
       RETURNING id::text, due_on::text`,
      [co, caseNo, input.payer_id, first, input.received_at, total, s.filing_days, uid]
    );
    await c.query(`UPDATE scentsx.cash_receipts SET case_id = $1::uuid WHERE id = ANY ($2::uuid[])`, [cs.rows[0]!.id, [receiptId, ...related.map((r) => r.id)]]);
    caseOut = { id: cs.rows[0]!.id, case_no: caseNo, due_on: cs.rows[0]!.due_on, total_cash_cents: total };
  }

  let alertId: string | null = null;
  if (counts && input.amount_cents >= s.structuring_floor_cents && input.amount_cents <= s.cash_report_threshold_cents) {
    const w = await c.query<{ n: string; total: string }>(
      `SELECT count(*)::text AS n, coalesce(sum(amount_cents), 0)::text AS total FROM scentsx.cash_receipts
        WHERE payer_id = $1::uuid AND counts_as_cash AND voided_at IS NULL AND amount_cents BETWEEN $2 AND $3
          AND received_at > $4::timestamptz - make_interval(days => $5) AND received_at <= $4::timestamptz`,
      [input.payer_id, s.structuring_floor_cents, s.cash_report_threshold_cents, input.received_at, s.structuring_window_days]
    );
    if (Number(w.rows[0]!.n) >= s.structuring_min_count) {
      const a = await c.query<{ id: string }>(
        `INSERT INTO scentsx.structuring_alerts (operating_company_id, payer_id, trigger_receipt_id, receipt_count, window_total_cents)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5) RETURNING id::text`,
        [co, input.payer_id, receiptId, Number(w.rows[0]!.n), Number(w.rows[0]!.total)]
      );
      alertId = a.rows[0]!.id;
    }
  }
  return { receipt_id: receiptId, receipt_no: receiptNo, counts_as_cash: counts, related_unreported_cents: total, case: caseOut, structuring_alert_id: alertId };
}

/** A receipt entered by mistake is voided with a reason, never deleted. A receipt already on a filed case cannot be voided. */
export async function voidCashReceipt(c: Q, uid: string, receiptId: string, reason: string) {
  await scopeToScentsx(c);
  if (!reason.trim()) throw new ScentsxLinkInvalid("a void needs a reason");
  const r = await c.query<{ case_status: string | null }>(
    `SELECT f.status AS case_status FROM scentsx.cash_receipts r LEFT JOIN scentsx.form_8300_cases f ON f.id = r.case_id WHERE r.id = $1::uuid AND r.voided_at IS NULL FOR UPDATE OF r`,
    [receiptId]
  );
  if (!r.rows[0]) throw new ScentsxLinkNotFound();
  if (r.rows[0].case_status === "filed") throw new ScentsxLinkInvalid("this receipt is on a filed Form 8300 — file an amended form instead of voiding it");
  await c.query(`UPDATE scentsx.cash_receipts SET voided_at = now(), voided_by = $2::uuid, void_reason = $3 WHERE id = $1::uuid`, [receiptId, uid, reason.trim()]);
  return { voided: true };
}

/** Voluntary Form 8300 for a suspicious payment of any size (the reason is required; the payer is never told). */
export async function openVoluntaryCase(c: Q, uid: string, receiptId: string, suspiciousReason: string) {
  const co = await scopeToScentsx(c);
  if (!suspiciousReason.trim()) throw new ScentsxLinkInvalid("a suspicious-payment form needs a reason");
  const s = await complianceSettings(c);
  const r = await c.query<{ payer_id: string; received_at: string; amount_cents: string; case_id: string | null }>(
    `SELECT payer_id::text, received_at::text, amount_cents::text, case_id::text FROM scentsx.cash_receipts WHERE id = $1::uuid AND voided_at IS NULL FOR UPDATE`,
    [receiptId]
  );
  const x = r.rows[0];
  if (!x) throw new ScentsxLinkNotFound();
  if (x.case_id) throw new ScentsxLinkInvalid("this receipt is already on a Form 8300 case");
  const caseNo = await nextNumber(c, co, "form_8300_cases", `F8300-${x.received_at.slice(0, 4)}-`);
  const cs = await c.query<{ id: string; due_on: string }>(
    `INSERT INTO scentsx.form_8300_cases (operating_company_id, case_no, payer_id, reason, suspicious_reason, first_received_at, crossed_at, total_cash_cents, due_on, created_by)
     VALUES ($1::uuid, $2, $3::uuid, 'voluntary_suspicious', $4, $5::timestamptz, $5::timestamptz, $6, (($5::timestamptz AT TIME ZONE 'America/Chicago')::date + $7::int), $8::uuid)
     RETURNING id::text, due_on::text`,
    [co, caseNo, x.payer_id, suspiciousReason.trim(), x.received_at, Number(x.amount_cents), s.filing_days, uid]
  );
  await c.query(`UPDATE scentsx.cash_receipts SET case_id = $1::uuid WHERE id = $2::uuid`, [cs.rows[0]!.id, receiptId]);
  return { id: cs.rows[0]!.id, case_no: caseNo, due_on: cs.rows[0]!.due_on };
}

/** A payer from Mexico (country typed as MX / MEX / Mexico / México, any case). */
export function isMexicoCountry(country: string | null | undefined): boolean {
  const k = String(country ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/[^a-z]/g, "");
  return k === "mx" || k === "mex" || k === "mexico";
}

/**
 * SCENTSX B14 (migration 202616990100) — owner 2026-11-27 07:10 CT: a Mexico payer on a Form 8300 must sign a document stating they
 * declared the money at U.S. Customs and filed FinCEN Form 105 (CMIR, 31 CFR 1010.340). The payer files the 105, not ScentsX; ScentsX
 * keeps the signed statement (and the payer's copy of the 105 when given), and the case cannot be marked filed without it.
 */
export type CmirInput = {
  case_id: string; crossed_on: string; port_of_entry: string; amount_declared_cents: number; currency: "USD" | "MXN";
  signed_on: string; signed_declaration_file_id: string; fincen105_copy_file_id?: string | null; notes?: string | null;
};

export async function addCmirDeclaration(c: Q, uid: string, x: CmirInput) {
  const co = await scopeToScentsx(c);
  if (!x.port_of_entry.trim()) throw new ScentsxLinkInvalid("enter the port of entry where the money was declared");
  if (!(x.amount_declared_cents > 0)) throw new ScentsxLinkInvalid("enter the amount declared to U.S. Customs");
  if (x.signed_on < x.crossed_on) throw new ScentsxLinkInvalid("the declaration is signed on or after the day the money crossed");
  const cs = await c.query<{ payer_id: string; status: string }>(
    `SELECT payer_id::text, status FROM scentsx.form_8300_cases WHERE id = $1::uuid AND operating_company_id = $2::uuid`, [x.case_id, co]
  );
  const k = cs.rows[0];
  if (!k) throw new ScentsxLinkNotFound("Form 8300 case not found");
  if (k.status === "void") throw new ScentsxLinkInvalid("this Form 8300 case is void");
  const y = x.signed_on.slice(0, 4);
  const n = await c.query<{ n: number }>(`SELECT count(*)::int + 1 AS n FROM scentsx.cmir_declarations WHERE operating_company_id = $1::uuid AND declaration_no LIKE $2`, [co, `CMIR-${y}-%`]);
  const no = `CMIR-${y}-${String(n.rows[0]!.n).padStart(4, "0")}`;
  const r = await c.query<{ id: string }>(
    `INSERT INTO scentsx.cmir_declarations (operating_company_id, declaration_no, payer_id, case_id, crossed_on, port_of_entry, amount_declared_cents,
        currency, signed_on, signed_declaration_file_id, fincen105_copy_file_id, notes, created_by)
     VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5::date, $6, $7, $8, $9::date, $10::uuid, $11::uuid, $12, $13::uuid) RETURNING id::text`,
    [co, no, k.payer_id, x.case_id, x.crossed_on, x.port_of_entry.trim(), x.amount_declared_cents, x.currency, x.signed_on,
     x.signed_declaration_file_id, x.fincen105_copy_file_id ?? null, x.notes?.trim() || null, uid]
  );
  return { id: r.rows[0]!.id, declaration_no: no };
}

export async function voidCmirDeclaration(c: Q, uid: string, id: string, reason: string) {
  await scopeToScentsx(c);
  if (!reason.trim()) throw new ScentsxLinkInvalid("a void needs a written reason");
  const r = await c.query(
    `UPDATE scentsx.cmir_declarations d SET voided_at = now(), voided_by = $2::uuid, void_reason = $3
      WHERE d.id = $1::uuid AND d.voided_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM scentsx.form_8300_cases f WHERE f.id = d.case_id AND f.status = 'filed')`,
    [id, uid, reason.trim()]
  );
  if (!r.rowCount) throw new ScentsxLinkInvalid("declaration not found, already void, or its Form 8300 is already filed");
  return { voided: true };
}

/** Whether a case needs the FinCEN 105 declaration (Mexico payer) and whether an active one is on file. */
export async function cmirStatus(c: Q, caseId: string): Promise<{ required: boolean; on_file: boolean }> {
  const r = await c.query<{ country: string | null; on_file: boolean }>(
    `SELECT p.country, EXISTS (SELECT 1 FROM scentsx.cmir_declarations d WHERE d.case_id = f.id AND d.voided_at IS NULL) AS on_file
       FROM scentsx.form_8300_cases f JOIN scentsx.cash_payers p ON p.id = f.payer_id WHERE f.id = $1::uuid`, [caseId]
  );
  const x = r.rows[0];
  return { required: isMexicoCountry(x?.country), on_file: Boolean(x?.on_file) };
}

export async function markCaseFiled(c: Q, uid: string, caseId: string, bsaConfirmation: string, filedCopyFileId: string | null) {
  await scopeToScentsx(c);
  if (!bsaConfirmation.trim()) throw new ScentsxLinkInvalid("enter the BSA e-filing confirmation number");
  const cmir = await cmirStatus(c, caseId);
  if (cmir.required && !cmir.on_file) {
    throw new CashComplianceBlocked("This payer is from Mexico: attach their signed declaration that they declared the money at U.S. Customs and filed FinCEN Form 105 before marking the Form 8300 filed.", ["fincen105_declaration"]);
  }
  const r = await c.query(
    `UPDATE scentsx.form_8300_cases SET status = 'filed', filed_at = now(), filed_by = $2::uuid, bsa_confirmation = $3, filed_copy_file_id = $4::uuid
      WHERE id = $1::uuid AND status = 'open'`,
    [caseId, uid, bsaConfirmation.trim(), filedCopyFileId]
  );
  if (!r.rowCount) throw new ScentsxLinkInvalid("case not found or not open");
  return { filed: true };
}

export async function markStatementSent(c: Q, caseId: string, sentOn: string) {
  await scopeToScentsx(c);
  const r = await c.query(`UPDATE scentsx.form_8300_cases SET payer_statement_sent_on = $2::date WHERE id = $1::uuid AND status = 'filed'`, [caseId, sentOn]);
  if (!r.rowCount) throw new ScentsxLinkInvalid("the payer statement is sent after the form is filed");
  return { ok: true };
}

export async function reviewStructuringAlert(c: Q, uid: string, alertId: string, note: string) {
  await scopeToScentsx(c);
  if (!note.trim()) throw new ScentsxLinkInvalid("a review needs a written note");
  const r = await c.query(
    `UPDATE scentsx.structuring_alerts SET reviewed_at = now(), reviewed_by = $2::uuid, review_note = $3 WHERE id = $1::uuid AND reviewed_at IS NULL`,
    [alertId, uid, note.trim()]
  );
  if (!r.rowCount) throw new ScentsxLinkInvalid("alert not found or already reviewed");
  return { ok: true };
}

/** The compliance desk: open cases with due dates, alerts waiting for review, recent receipts, and ScentsX cash payments that
 *  were received through the payment engine but never logged here (so no cash can bypass the log silently). */
export async function complianceDesk(c: Q) {
  const co = await scopeToScentsx(c);
  // Sequential on purpose: one client cannot run queries in parallel.
  const cases = await c.query(`SELECT f.id::text, f.case_no, f.reason, f.status, f.total_cash_cents::text, f.due_on::text, f.filed_at, f.bsa_confirmation,
                    f.payer_statement_sent_on::text, p.id::text AS payer_id, p.legal_name AS payer_name,
                    (f.status = 'open' AND f.due_on < (now() AT TIME ZONE 'America/Chicago')::date) AS overdue, p.country AS payer_country,
                    (SELECT d.declaration_no FROM scentsx.cmir_declarations d WHERE d.case_id = f.id AND d.voided_at IS NULL ORDER BY d.created_at DESC LIMIT 1) AS cmir_declaration_no,
                    (SELECT d.id::text FROM scentsx.cmir_declarations d WHERE d.case_id = f.id AND d.voided_at IS NULL ORDER BY d.created_at DESC LIMIT 1) AS cmir_declaration_id
               FROM scentsx.form_8300_cases f JOIN scentsx.cash_payers p ON p.id = f.payer_id
              WHERE f.operating_company_id = $1::uuid ORDER BY (f.status = 'open') DESC, f.due_on`, [co]);
  const alerts = await c.query(`SELECT a.id::text, a.receipt_count, a.window_total_cents::text, a.created_at, a.reviewed_at, a.review_note, p.legal_name AS payer_name,
                    r.receipt_no
               FROM scentsx.structuring_alerts a JOIN scentsx.cash_payers p ON p.id = a.payer_id JOIN scentsx.cash_receipts r ON r.id = a.trigger_receipt_id
              WHERE a.operating_company_id = $1::uuid ORDER BY (a.reviewed_at IS NULL) DESC, a.created_at DESC LIMIT 200`, [co]);
  const receipts = await c.query(`SELECT r.id::text, r.receipt_no, r.received_at, r.payment_form, r.amount_cents::text, r.counts_as_cash, r.voided_at, r.void_reason,
                    r.payment_id::text, r.invoice_id::text, r.sales_order_id::text, f.case_no, p.legal_name AS payer_name, p.id::text AS payer_id
               FROM scentsx.cash_receipts r JOIN scentsx.cash_payers p ON p.id = r.payer_id LEFT JOIN scentsx.form_8300_cases f ON f.id = r.case_id
              WHERE r.operating_company_id = $1::uuid ORDER BY r.received_at DESC LIMIT 200`, [co]);
  const unlogged = await c.query(`SELECT pm.id::text, pm.display_id, pm.payment_date::text, pm.amount_cents::text, pm.customer_id::text
               FROM accounting.payments pm
              WHERE pm.operating_company_id = $1::uuid AND pm.payment_method = 'cash' AND pm.voided_at IS NULL AND pm.is_sample_data = false
                AND NOT EXISTS (SELECT 1 FROM scentsx.cash_receipts r WHERE r.payment_id = pm.id AND r.voided_at IS NULL)
              ORDER BY pm.payment_date DESC LIMIT 200`, [co]);
  const payers = await c.query(`SELECT id::text, payer_kind, legal_name, contact_company_id::text, customer_id::text, identity_completed_at IS NOT NULL AS identity_complete
               FROM scentsx.cash_payers WHERE operating_company_id = $1::uuid AND voided_at IS NULL ORDER BY legal_name`, [co]);
  return { settings: await complianceSettings(c), cases: cases.rows.map((x) => ({ ...x, cmir_required: isMexicoCountry(x.payer_country as string | null) })), alerts: alerts.rows, receipts: receipts.rows, unlogged_cash_payments: unlogged.rows, payers: payers.rows };
}
