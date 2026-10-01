// ROUND 315 (FINAL) step 2 — PURCHASE = THE DOCUMENT. One accounting.factoring_purchases row per Faro wire, one
// accounting.factoring_purchase_lines row per invoice (migration 202615180800). Owner-only (ROUND 315 law): the routes
// gate every create/post/void through factoring/owner-only-purchase.ts before calling these functions.
//
// ONE posting engine, no new GL math: a purchase posts through ONE accounting.factoring_advances row (1:1) and the
// existing secured-borrowing funding poster (postFactoringAdvanceEventInClientTx, ASC 860 — A/R stays until the debtor
// pays). Every step runs on the caller's single transaction, so draft -> advance -> invoice links -> funding JE ->
// posted stamp is atomic (and free of the ACCT-F5651 cross-connection lock cycle).
//   advance (purchase price) = gross - escrow reserve - fee        (Faro: "Purchase Price = Net - Fee - Reserve")
//   net to IH35 (the wire)   = advance - cash reserve - wire fee
//   funding JE: DR 1090 net + DR 1230 escrow + DR 1235 cash reserve + DR 6400 fee + DR 6300 wire fee / CR 2150 gross
import { nextFactoringDisplayId, nextFactoringPurchaseDisplayId } from "../accounting/display-id.js";
import { INVOICE_PLEDGE_CENTS_SQL } from "../accounting/shared.js";
import {
  postFactoringAdvanceEventInClientTx,
  reverseFactoringAdvanceEventInClientTx,
} from "../accounting/factoring-posting/poster.service.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { stampDocumentVoided } from "../accounting/void-document-stamp.service.js";
import { checkFactoringPurchaseOwner, type FactoringPurchaseAction } from "./owner-only-purchase.js";
import { getFactorForCustomer } from "./factor.service.js";
import { companyBusinessDate } from "../lib/company-business-date.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

export class FactoringPurchaseError extends Error {
  constructor(readonly code: string, readonly statusCode: number, readonly details?: unknown) {
    super(code);
  }
}

export type PurchaseLineInput = {
  invoice_id: string;
  gross_cents?: number;
  escrow_reserve_cents?: number;
  cash_reserve_cents?: number;
  fee_cents?: number;
};

export type CreatePurchaseInput = {
  operatingCompanyId: string;
  actorUserId: string;
  factoringCompanyVendorId: string;
  purchaseDate: string;
  wireDate?: string | null;
  faroReportRef?: string | null;
  wireFeeCents?: number;
  notes?: string | null;
  lines: PurchaseLineInput[];
  /** ROUND 321 item 3: Owner override for missing load documents, stamped on the purchase (who / when / why). */
  docsOverrideReason?: string | null;
};

/** Defense in depth: the service itself refuses a non-Owner actor even when called outside the routes (ROUND 315 law). */
async function assertOwnerActor(client: DbClient, oci: string, actorUserId: string, action: FactoringPurchaseAction, targetId: string | null) {
  if (!(await checkFactoringPurchaseOwner(client as never, { operatingCompanyId: oci, userUuid: actorUserId, action, targetId }))) {
    throw new FactoringPurchaseError("factoring_purchase_owner_only", 403);
  }
}

const nonneg = (n: number, code: string) => {
  if (!Number.isInteger(n) || n < 0) throw new FactoringPurchaseError(code, 400);
  return n;
};

export async function createPurchaseDraft(client: DbClient, input: CreatePurchaseInput) {
  const oci = input.operatingCompanyId;
  await assertOwnerActor(client, oci, input.actorUserId, "create", null);
  if (!input.lines.length) throw new FactoringPurchaseError("purchase_requires_invoices", 400);
  const ids = input.lines.map((l) => l.invoice_id);
  if (new Set(ids).size !== ids.length) throw new FactoringPurchaseError("purchase_duplicate_invoice", 400);

  const vendor = await client.query(`SELECT id FROM mdata.vendors WHERE id = $1::uuid AND operating_company_id = $2::uuid`, [
    input.factoringCompanyVendorId,
    oci,
  ]);
  if (!vendor.rows[0]) throw new FactoringPurchaseError("factoring_vendor_not_found", 404);

  // Eligibility: live, issued (A/R posted), not factored, not already on a live purchase, this company.
  const inv = await client.query<Record<string, unknown>>(
    `
      SELECT i.id::text, i.display_id, i.customer_id::text, i.source_load_id::text AS load_id, i.status::text AS status,
             COALESCE(i.factoring_status, 'not_factored') AS factoring_status,
             (${INVOICE_PLEDGE_CENTS_SQL})::bigint AS pledge_cents,
             (SELECT sl.settlement_id::text FROM driver_finance.settlement_lines sl
               WHERE sl.load_id = i.source_load_id AND sl.voided_at IS NULL AND sl.settlement_id IS NOT NULL
               ORDER BY sl.settlement_id LIMIT 1) AS settlement_id,
             EXISTS (SELECT 1 FROM accounting.factoring_purchase_lines pl WHERE pl.invoice_id = i.id AND pl.voided_at IS NULL) AS on_purchase
        FROM accounting.invoices i
       WHERE i.operating_company_id = $1::uuid AND i.id = ANY($2::uuid[]) AND i.voided_at IS NULL
       FOR UPDATE OF i
    `,
    [oci, ids]
  );
  const byId = new Map(inv.rows.map((r) => [String(r.id), r]));
  const problems: Array<{ invoice_id: string; reason: string }> = [];
  for (const id of ids) {
    const r = byId.get(id);
    if (!r) problems.push({ invoice_id: id, reason: "invoice_not_found_or_voided" });
    else if (!["sent", "partial"].includes(String(r.status))) problems.push({ invoice_id: id, reason: `invoice_not_issued:${r.status}` });
    else if (r.factoring_status !== "not_factored") problems.push({ invoice_id: id, reason: `invoice_already_factored:${r.factoring_status}` });
    else if (r.on_purchase) problems.push({ invoice_id: id, reason: "invoice_on_live_purchase" });
    else if (!r.customer_id) problems.push({ invoice_id: id, reason: "invoice_has_no_customer" });
  }
  if (problems.length) throw new FactoringPurchaseError("purchase_invoices_not_eligible", 409, problems);

  // Expected split from the customer's factor assignment (reserve_rate / fee_rate); Faro's actuals override per line.
  const asOf = input.purchaseDate || companyBusinessDate();
  const rateByCustomer = new Map<string, { reserve: number; fee: number }>();
  const lines = [] as Array<Required<PurchaseLineInput> & { customer_id: string; load_id: string | null; settlement_id: string | null }>;
  for (const l of input.lines) {
    const r = byId.get(l.invoice_id)!;
    const customerId = String(r.customer_id);
    if (!rateByCustomer.has(customerId)) {
      const f = await getFactorForCustomer(oci, customerId, asOf, { client: client as never });
      rateByCustomer.set(customerId, { reserve: Number(f?.reserve_rate ?? 0), fee: Number(f?.fee_rate ?? 0) });
    }
    const rate = rateByCustomer.get(customerId)!;
    const gross = nonneg(l.gross_cents ?? Number(r.pledge_cents ?? 0), "purchase_line_gross_invalid");
    if (gross <= 0) throw new FactoringPurchaseError("purchase_line_zero_open", 409, { invoice_id: l.invoice_id });
    lines.push({
      invoice_id: l.invoice_id,
      gross_cents: gross,
      escrow_reserve_cents: nonneg(l.escrow_reserve_cents ?? Math.round(gross * rate.reserve), "purchase_line_escrow_invalid"),
      cash_reserve_cents: nonneg(l.cash_reserve_cents ?? 0, "purchase_line_cash_reserve_invalid"),
      fee_cents: nonneg(l.fee_cents ?? Math.round(gross * rate.fee), "purchase_line_fee_invalid"),
      customer_id: customerId,
      load_id: (r.load_id as string | null) ?? null,
      settlement_id: (r.settlement_id as string | null) ?? null,
    });
  }
  const sum = (k: "gross_cents" | "escrow_reserve_cents" | "cash_reserve_cents" | "fee_cents") => lines.reduce((a, l) => a + l[k], 0);
  const gross = sum("gross_cents");
  const escrow = sum("escrow_reserve_cents");
  const cash = sum("cash_reserve_cents");
  const fee = sum("fee_cents");
  const wire = nonneg(input.wireFeeCents ?? 0, "purchase_wire_fee_invalid");
  const advance = gross - escrow - fee;
  const net = advance - cash - wire;
  if (net < 0) throw new FactoringPurchaseError("purchase_net_negative", 409, { gross, escrow, cash, fee, wire });

  const displayId = await nextFactoringPurchaseDisplayId(client as never, oci, new Date(`${input.purchaseDate}T12:00:00Z`));
  const head = await client.query<{ id: string }>(
    `
      INSERT INTO accounting.factoring_purchases (
        operating_company_id, display_id, factoring_company_vendor_id, status, purchase_date, wire_date, faro_report_ref,
        invoice_count, gross_cents, escrow_reserve_cents, cash_reserve_cents, fee_cents, wire_fee_cents, advance_cents,
        net_to_company_cents, notes, created_by_user_id, updated_by_user_id
      ) VALUES ($1,$2,$3,'draft',$4::date,$5::date,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16)
      RETURNING id::text
    `,
    [oci, displayId, input.factoringCompanyVendorId, input.purchaseDate, input.wireDate ?? null, input.faroReportRef ?? null,
      lines.length, gross, escrow, cash, fee, wire, advance, net, input.notes ?? null, input.actorUserId]
  );
  const purchaseId = head.rows[0]!.id;
  const docsOverride = (input.docsOverrideReason ?? "").trim();
  if (docsOverride.length >= 10) {
    await client.query(
      `UPDATE accounting.factoring_purchases SET docs_override_at = now(), docs_override_by_user_id = $2::uuid, docs_override_reason = $3
        WHERE id = $1::uuid`,
      [purchaseId, input.actorUserId, docsOverride]
    );
    await appendCrudAudit(client as never, input.actorUserId, "factoring.purchase_docs_override", {
      resource_type: "accounting.factoring_purchases", resource_id: purchaseId, operating_company_id: oci, reason: docsOverride, at: "create",
    }, "warning", "ROUND-315-FACTORING-PURCHASE");
  }
  let n = 0;
  for (const l of lines) {
    n += 1;
    await client.query(
      `
        INSERT INTO accounting.factoring_purchase_lines (
          operating_company_id, purchase_id, line_no, invoice_id, customer_id, load_id, settlement_id,
          gross_cents, escrow_reserve_cents, cash_reserve_cents, fee_cents, created_by_user_id
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      `,
      [oci, purchaseId, n, l.invoice_id, l.customer_id, l.load_id, l.settlement_id, l.gross_cents, l.escrow_reserve_cents,
        l.cash_reserve_cents, l.fee_cents, input.actorUserId]
    );
  }
  await appendCrudAudit(client as never, input.actorUserId, "accounting.factoring_purchase_created", {
    resource_type: "accounting.factoring_purchases", resource_id: purchaseId, operating_company_id: oci, display_id: displayId,
    invoice_count: lines.length, gross_cents: gross, escrow_reserve_cents: escrow, cash_reserve_cents: cash, fee_cents: fee,
    wire_fee_cents: wire, net_to_company_cents: net,
  }, "info", "ROUND-315-FACTORING-PURCHASE");
  return getPurchaseDetail(client, oci, purchaseId);
}

/** Post a draft purchase: one advance (1:1), invoices linked, the existing funding poster, posted stamp — one transaction. */
export async function postPurchase(client: DbClient, input: { operatingCompanyId: string; actorUserId: string; purchaseId: string }) {
  const oci = input.operatingCompanyId;
  await assertOwnerActor(client, oci, input.actorUserId, "advance", input.purchaseId);
  const p = (await client.query<Record<string, unknown>>(
    `SELECT * FROM accounting.factoring_purchases WHERE id = $1::uuid AND operating_company_id = $2::uuid FOR UPDATE`,
    [input.purchaseId, oci]
  )).rows[0];
  if (!p) throw new FactoringPurchaseError("factoring_purchase_not_found", 404);
  if (p.status !== "draft") throw new FactoringPurchaseError(`factoring_purchase_not_draft:${p.status}`, 409);
  const lines = (await client.query<{ invoice_id: string; customer_id: string }>(
    `SELECT invoice_id::text, customer_id::text FROM accounting.factoring_purchase_lines WHERE purchase_id = $1::uuid AND voided_at IS NULL ORDER BY line_no`,
    [input.purchaseId]
  )).rows;
  if (!lines.length) throw new FactoringPurchaseError("purchase_requires_invoices", 409);
  // Re-check eligibility at post time (an invoice may have been voided or factored since the draft).
  const stale = (await client.query<{ id: string }>(
    `SELECT i.id::text FROM accounting.invoices i WHERE i.id = ANY($1::uuid[])
       AND (i.voided_at IS NOT NULL OR COALESCE(i.factoring_status,'not_factored') <> 'not_factored' OR i.status::text NOT IN ('sent','partial'))`,
    [lines.map((l) => l.invoice_id)]
  )).rows;
  if (stale.length) throw new FactoringPurchaseError("purchase_invoices_not_eligible", 409, stale.map((s) => ({ invoice_id: s.id })));

  const gross = Number(p.gross_cents);
  const escrow = Number(p.escrow_reserve_cents);
  const fee = Number(p.fee_cents);
  const purchaseDate = String(p.purchase_date instanceof Date ? (p.purchase_date as Date).toISOString().slice(0, 10) : p.purchase_date).slice(0, 10);
  const advanceDisplay = await nextFactoringDisplayId(client as never, oci, new Date(`${purchaseDate}T12:00:00Z`));
  const adv = (await client.query<{ id: string }>(
    `
      INSERT INTO accounting.factoring_advances (
        operating_company_id, factoring_company_vendor_id, display_id, status, submission_batch_ref, invoice_total_cents,
        advance_rate_pct, advance_amount_cents, reserve_pct, reserve_amount_cents, factor_fee_pct, factor_fee_cents,
        wire_fee_cents, cash_rsv_cents, faro_invoice_number, faro_purchase_date, notes, memo, created_by_user_id
      ) VALUES ($1,$2,$3,'submitted',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::date,$16,$16,$17)
      RETURNING id::text
    `,
    [oci, p.factoring_company_vendor_id, advanceDisplay, p.display_id, gross,
      gross > 0 ? Number((((gross - escrow - fee) / gross) * 100).toFixed(2)) : 0, gross - escrow - fee,
      gross > 0 ? Number(((escrow / gross) * 100).toFixed(4)) : 0, escrow,
      gross > 0 ? Number(((fee / gross) * 100).toFixed(4)) : 0, fee,
      Number(p.wire_fee_cents), Number(p.cash_reserve_cents), p.faro_report_ref ?? null, purchaseDate,
      `Factoring purchase ${p.display_id}`, input.actorUserId]
  )).rows[0]!;
  for (const l of lines) {
    const f = await getFactorForCustomer(oci, l.customer_id, purchaseDate, { client: client as never });
    await client.query(
      `UPDATE accounting.invoices SET factoring_advance_id = $2::uuid, factoring_status = 'submitted', factor_profile_id = COALESCE($4::uuid, factor_profile_id),
              updated_at = now(), updated_by_user_id = $3::uuid
        WHERE id = $1::uuid AND operating_company_id = $5::uuid`,
      [l.invoice_id, adv.id, input.actorUserId, f?.id ?? null, oci]
    );
  }
  const posted = await postFactoringAdvanceEventInClientTx(client as never, {
    operating_company_id: oci,
    factoring_advance_id: adv.id,
    actor_user_id: input.actorUserId,
    advanced_at_iso: purchaseDate,
    funding_figures: {
      invoice_total_cents: gross,
      reserve_cents: escrow,
      fee_cents: fee,
      ach_cents: Number(p.wire_fee_cents),
      cash_rsv_cents: Number(p.cash_reserve_cents),
    },
    faro_invoice_number: (p.faro_report_ref as string | null) ?? null,
    faro_purchase_date: purchaseDate,
  });
  if (!posted.posted || !posted.journal_entry_id) {
    // Throwing rolls the whole purchase post back: no advance, no invoice link, no half-posted document.
    throw new FactoringPurchaseError(`factoring_purchase_not_posted:${posted.reason ?? "unknown"}`, 409);
  }
  await client.query(
    `UPDATE accounting.factoring_advances SET status = 'advanced', advanced_at = $2::date WHERE id = $1::uuid`,
    [adv.id, purchaseDate]
  );
  await client.query(
    `UPDATE accounting.invoices SET factoring_status = 'advanced', updated_at = now(), updated_by_user_id = $2::uuid WHERE factoring_advance_id = $1::uuid`,
    [adv.id, input.actorUserId]
  );
  await client.query(
    `UPDATE accounting.factoring_purchases
        SET status = 'posted', factoring_advance_id = $2::uuid, journal_entry_id = $3::uuid, posted_at = now(),
            posted_by_user_id = $4::uuid, updated_by_user_id = $4::uuid
      WHERE id = $1::uuid`,
    [input.purchaseId, adv.id, posted.journal_entry_id, input.actorUserId]
  );
  await appendCrudAudit(client as never, input.actorUserId, "accounting.factoring_purchase_posted", {
    resource_type: "accounting.factoring_purchases", resource_id: input.purchaseId, operating_company_id: oci,
    display_id: p.display_id, factoring_advance_id: adv.id, journal_entry_id: posted.journal_entry_id,
  }, "info", "ROUND-315-FACTORING-PURCHASE");
  return { detail: await getPurchaseDetail(client, oci, input.purchaseId), factoringAdvanceId: adv.id };
}

/** Void: reverse the funding JE through the canonical reversal, void the advance, unlink invoices, void lines + header. */
export async function voidPurchase(client: DbClient, input: { operatingCompanyId: string; actorUserId: string; purchaseId: string; reason: string }) {
  const oci = input.operatingCompanyId;
  await assertOwnerActor(client, oci, input.actorUserId, "release", input.purchaseId);
  const p = (await client.query<Record<string, unknown>>(
    `SELECT * FROM accounting.factoring_purchases WHERE id = $1::uuid AND operating_company_id = $2::uuid FOR UPDATE`,
    [input.purchaseId, oci]
  )).rows[0];
  if (!p) throw new FactoringPurchaseError("factoring_purchase_not_found", 404);
  if (p.status === "voided") throw new FactoringPurchaseError("factoring_purchase_already_voided", 409);
  if (p.factoring_advance_id) {
    const matched = (await client.query(`SELECT 1 FROM banking.bank_transactions WHERE matched_factoring_advance_id = $1::uuid LIMIT 1`, [p.factoring_advance_id])).rows[0];
    if (matched) throw new FactoringPurchaseError("factoring_purchase_matched_to_bank_unmatch_first", 409);
  }
  let reversalJeId: string | null = null;
  if (p.factoring_advance_id) {
    const advId = String(p.factoring_advance_id);
    const adv = (await client.query<{ status: string }>(`SELECT status FROM accounting.factoring_advances WHERE id = $1::uuid FOR UPDATE`, [advId])).rows[0];
    if (adv && !["submitted", "advanced"].includes(adv.status)) {
      throw new FactoringPurchaseError(`factoring_purchase_has_later_events:${adv.status}`, 409);
    }
    const rev = await reverseFactoringAdvanceEventInClientTx(client as never, {
      operating_company_id: oci, factoring_advance_id: advId, actor_user_id: input.actorUserId, reason: input.reason,
    });
    reversalJeId = rev.reversed ? rev.reversal_journal_entry_id : null;
    // The canonical single writer for a document void (verify-void-stamp-columns: factoring_advances is zero-tolerance).
    await stampDocumentVoided(client as never, {
      operatingCompanyId: oci,
      family: "factoring_advance",
      documentId: advId,
      voidReason: input.reason,
      voidedByUserId: input.actorUserId,
    });
    await unlinkInvoicesFromAdvance(client, advId, input.actorUserId);
  }
  // Header first: the posted-lines freeze only lets a line move to voided once the header no longer reads 'posted'.
  await client.query(
    `UPDATE accounting.factoring_purchases SET status = 'voided', voided_at = now(), void_reason = $2, voided_by_user_id = $3::uuid, updated_by_user_id = $3::uuid
      WHERE id = $1::uuid`,
    [input.purchaseId, input.reason, input.actorUserId]
  );
  await client.query(`UPDATE accounting.factoring_purchase_lines SET voided_at = now() WHERE purchase_id = $1::uuid AND voided_at IS NULL`, [input.purchaseId]);
  await appendCrudAudit(client as never, input.actorUserId, "accounting.factoring_purchase_voided", {
    resource_type: "accounting.factoring_purchases", resource_id: input.purchaseId, operating_company_id: oci,
    display_id: p.display_id, reason: input.reason, reversal_journal_entry_id: reversalJeId,
  }, "warning", "ROUND-315-FACTORING-PURCHASE");
  return getPurchaseDetail(client, oci, input.purchaseId);
}

/** Detail with every link both ways: lines -> invoice, customer, load, settlement; header -> vendor, advance, JE, bank line. */
export async function getPurchaseDetail(client: DbClient, oci: string, purchaseId: string) {
  const head = (await client.query<Record<string, unknown>>(
    `
      SELECT p.*, v.vendor_name AS factoring_company_name, fa.display_id AS factoring_advance_display_id,
             bt.id AS bank_transaction_id, bt.transaction_date AS bank_transaction_date, bt.amount_cents AS bank_transaction_amount_cents
        FROM accounting.factoring_purchases p
        JOIN mdata.vendors v ON v.id = p.factoring_company_vendor_id
        LEFT JOIN accounting.factoring_advances fa ON fa.id = p.factoring_advance_id
        LEFT JOIN LATERAL (SELECT b.id, b.transaction_date, b.amount_cents FROM banking.bank_transactions b
                            WHERE p.factoring_advance_id IS NOT NULL AND b.matched_factoring_advance_id = p.factoring_advance_id
                            ORDER BY b.transaction_date LIMIT 1) bt ON true
       WHERE p.id = $1::uuid AND p.operating_company_id = $2::uuid
    `,
    [purchaseId, oci]
  )).rows[0];
  if (!head) throw new FactoringPurchaseError("factoring_purchase_not_found", 404);
  const lines = (await client.query<Record<string, unknown>>(
    `
      SELECT pl.*, i.display_id AS invoice_display_id, i.total_cents AS invoice_total_cents, i.status::text AS invoice_status,
             c.customer_name, l.load_number, ds.display_id AS settlement_display_id
        FROM accounting.factoring_purchase_lines pl
        JOIN accounting.invoices i ON i.id = pl.invoice_id
        JOIN mdata.customers c ON c.id = pl.customer_id
        LEFT JOIN mdata.loads l ON l.id = pl.load_id
        LEFT JOIN driver_finance.driver_settlements ds ON ds.id = pl.settlement_id
       WHERE pl.purchase_id = $1::uuid
       ORDER BY pl.line_no
    `,
    [purchaseId]
  )).rows;
  return { ...head, lines };
}

/** List with reverse-drill filters: from an invoice, load, customer, settlement or bank line back to its purchase. */
export async function listPurchases(
  client: DbClient,
  oci: string,
  f: { status?: string; from?: string; to?: string; invoice_id?: string; load_id?: string; customer_id?: string; settlement_id?: string; bank_transaction_id?: string }
) {
  const where = ["p.operating_company_id = $1::uuid"];
  const values: unknown[] = [oci];
  const add = (sql: (n: number) => string, v: unknown) => {
    values.push(v);
    where.push(sql(values.length));
  };
  if (f.status) add((n) => `p.status = $${n}`, f.status);
  if (f.from) add((n) => `p.purchase_date >= $${n}::date`, f.from);
  if (f.to) add((n) => `p.purchase_date <= $${n}::date`, f.to);
  if (f.bank_transaction_id) add((n) => `EXISTS (SELECT 1 FROM banking.bank_transactions b WHERE b.id = $${n}::uuid AND b.matched_factoring_advance_id = p.factoring_advance_id)`, f.bank_transaction_id);
  for (const k of ["invoice_id", "load_id", "customer_id", "settlement_id"] as const) {
    if (f[k]) add((n) => `EXISTS (SELECT 1 FROM accounting.factoring_purchase_lines x WHERE x.purchase_id = p.id AND x.${k} = $${n}::uuid)`, f[k]);
  }
  const rows = (await client.query(
    `
      SELECT p.id, p.display_id, p.status, p.purchase_date, p.wire_date, p.faro_report_ref, p.invoice_count, p.gross_cents,
             p.escrow_reserve_cents, p.cash_reserve_cents, p.fee_cents, p.wire_fee_cents, p.advance_cents, p.net_to_company_cents,
             p.factoring_advance_id, p.journal_entry_id, p.posted_at, p.voided_at,
             (SELECT b.id FROM banking.bank_transactions b WHERE p.factoring_advance_id IS NOT NULL AND b.matched_factoring_advance_id = p.factoring_advance_id LIMIT 1) AS bank_transaction_id,
             v.vendor_name AS factoring_company_name
        FROM accounting.factoring_purchases p
        JOIN mdata.vendors v ON v.id = p.factoring_company_vendor_id
       WHERE ${where.join(" AND ")}
       ORDER BY p.purchase_date DESC, p.display_id DESC
       LIMIT 500
    `,
    values
  )).rows;
  return rows;
}

/** A voided purchase releases its invoices back to not_factored (they reappear on the Submit tab). */
async function unlinkInvoicesFromAdvance(client: DbClient, advanceId: string, actorUserId: string) {
  await client.query(
    `UPDATE accounting.invoices SET factoring_status = 'not_factored', factoring_advance_id = NULL, updated_at = now(), updated_by_user_id = $2::uuid
      WHERE factoring_advance_id = $1::uuid`,
    [advanceId, actorUserId]
  );
}
