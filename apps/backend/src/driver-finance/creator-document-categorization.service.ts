/**
 * RULING 443.66 (owner order 2026-10-11 15:02 CT: "all data seeded accurately and correctly categorized") — the ONE named
 * engine path that brings a posted Settlement Creator settlement's documents to the categorization the engine now writes
 * at post time (D1 / D3 / D4 / D5). It never touches an amount, an account, a journal entry or a posting: only the item
 * a line names, the status word of an expense already posted in the GL, and the driver / unit / trailer a line names.
 *
 *   D1  settlement reimbursement line   <- the item the settlement document gave that reimbursement (body), matched by
 *                                          load + amount + description, exactly one candidate
 *       A/P bill line (per-load bill)   <- the item of the settlement line it was built from (same load, same amount,
 *                                          same description / reimbursement account), exactly one item among candidates
 *   D3  invoice linehaul line           <- this company's "Line Haul" item whose income account IS the line's account
 *   D4  expense status 'draft'          -> 'posted' only where posting_status = 'posted' AND a journal entry exists
 *   D5  expense line driver / unit      <- its header's; header trailer <- the settlement document's trailer number
 *                                          (this company's equipment, exactly one); line trailer <- header
 *
 * Fail-closed: an ambiguous or missing match changes nothing on that line and is reported, never guessed. dry_run
 * computes everything inside a savepoint and rolls it back. One audit row per settlement with every count.
 */
import { resolveCreatorTrailerId } from "./settlement-creator.service.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type CategorizeReimbursementItem = { description: string; amount_cents: number; load_number?: string | null; item_id: string };

export type CategorizeCreatorSettlementInput = {
  operatingCompanyId: string;
  settlementNo: string;
  actorUserId: string;
  /** The settlement document's reimbursements with their items (is_reimbursable expenses + reimbursements). */
  reimbursementItems: CategorizeReimbursementItem[];
  trailerEquipmentNumber?: string | null;
  dryRun?: boolean;
};

export type CategorizeCreatorSettlementResult = {
  settlement_no: string;
  settlement_id: string;
  dry_run: boolean;
  d1_settlement_lines_itemed: number;
  d1_bill_lines_itemed: number;
  d1_bill_lines_unmatched: string[];
  d3_invoice_lines_itemed: number;
  d4_expenses_status_posted: number;
  d5_lines_driver_unit: number;
  d5_headers_trailer: number;
  d5_lines_trailer: number;
  trailer_unresolved: string | null;
  reimbursements_unmatched: string[];
};

export class CreatorCategorizationError extends Error {
  readonly code = "creator_categorization_refused";
}

const cents = (v: unknown) => Math.round(Number(v) * 100);
const norm = (s: string | null | undefined) => (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

export async function categorizeCreatorSettlement(
  client: DbClient,
  input: CategorizeCreatorSettlementInput,
  audit: (eventClass: string, payload: Record<string, unknown>) => Promise<void>
): Promise<CategorizeCreatorSettlementResult> {
  const co = input.operatingCompanyId;
  const ev = (
    await client.query<{ sid: string; invoice_ids: string[] | null }>(
      `SELECT payload->>'resource_id' AS sid,
              ARRAY(SELECT jsonb_array_elements_text(COALESCE(payload->'invoice_ids', '[]'::jsonb))) AS invoice_ids
         FROM audit.audit_events
        WHERE event_class = 'driver_finance.settlement_creator.posted'
          AND payload->>'operating_company_id' = $1 AND payload->>'source_document_ref' = $2
        ORDER BY created_at DESC LIMIT 1`,
      [co, input.settlementNo]
    )
  ).rows[0];
  if (!ev?.sid) throw new CreatorCategorizationError(`no posted Creator settlement ${input.settlementNo} for this company`);
  const live = (
    await client.query<{ id: string }>(
      `SELECT id::text FROM driver_finance.driver_settlements WHERE id = $1::uuid AND operating_company_id = $2::uuid AND voided_at IS NULL`,
      [ev.sid, co]
    )
  ).rows[0];
  if (!live) throw new CreatorCategorizationError(`settlement ${input.settlementNo} is not live`);
  const sid = live.id;

  const out: CategorizeCreatorSettlementResult = {
    settlement_no: input.settlementNo, settlement_id: sid, dry_run: Boolean(input.dryRun),
    d1_settlement_lines_itemed: 0, d1_bill_lines_itemed: 0, d1_bill_lines_unmatched: [], d3_invoice_lines_itemed: 0,
    d4_expenses_status_posted: 0, d5_lines_driver_unit: 0, d5_headers_trailer: 0, d5_lines_trailer: 0,
    trailer_unresolved: null, reimbursements_unmatched: [],
  };
  await client.query("SAVEPOINT creator_categorize");
  try {
    // ---- D1a: reimbursement settlement lines take the document's item ----------------------------------------
    const items = new Set(
      (await client.query<{ id: string }>(
        `SELECT id::text FROM catalogs.items WHERE operating_company_id = $1::uuid AND id = ANY($2::uuid[])`,
        [co, input.reimbursementItems.map((r) => r.item_id)]
      )).rows.map((r) => r.id)
    );
    const reimbLines = (
      await client.query<{ id: string; description: string | null; amount: string; load_number: string | null; item_id: string | null }>(
        `SELECT sl.id::text, sl.description, abs(sl.amount)::text AS amount, l.load_number, sl.item_id::text AS item_id
           FROM driver_finance.settlement_lines sl LEFT JOIN mdata.loads l ON l.id = sl.load_id
          WHERE sl.settlement_id = $1::uuid AND sl.line_type = 'reimbursement' AND sl.is_active AND sl.voided_at IS NULL`,
        [sid]
      )
    ).rows;
    const usedLine = new Set<string>();
    for (const r of input.reimbursementItems) {
      if (!items.has(r.item_id)) { out.reimbursements_unmatched.push(`${r.description} ${r.amount_cents}: item not this company's`); continue; }
      const cands = reimbLines.filter(
        (l) => !usedLine.has(l.id) && cents(l.amount) === r.amount_cents && norm(l.description) === norm(r.description)
          && (!r.load_number || !l.load_number || l.load_number === String(r.load_number))
      );
      const target = cands.find((l) => l.item_id === r.item_id) ?? (cands.length >= 1 ? cands.find((l) => !l.item_id) : undefined);
      if (!target) { out.reimbursements_unmatched.push(`${r.description} ${r.amount_cents}: no settlement line`); continue; }
      usedLine.add(target.id);
      if (target.item_id) continue;
      await client.query(
        `UPDATE driver_finance.settlement_lines SET item_id = $2::uuid, quantity = 1, rate_cents = $3::bigint, unit_of_measure = 'each', updated_at = now()
          WHERE id = $1::uuid AND item_id IS NULL`,
        [target.id, r.item_id, r.amount_cents]
      );
      target.item_id = r.item_id;
      out.d1_settlement_lines_itemed++;
    }

    // ---- D1b: A/P bill lines take the item of the settlement line they were built from ------------------------
    const slAll = (
      await client.query<{ load_id: string | null; line_type: string; description: string | null; amount: string; item_id: string | null; posting_account_id: string | null }>(
        `SELECT sl.load_id::text, sl.line_type, sl.description, abs(sl.amount)::text AS amount, sl.item_id::text AS item_id,
                sl.posting_account_id::text AS posting_account_id
           FROM driver_finance.settlement_lines sl
          WHERE sl.settlement_id = $1::uuid AND sl.is_active AND sl.voided_at IS NULL`,
        [sid]
      )
    ).rows;
    const billLines = (
      await client.query<{ id: string; description: string | null; amount: string; account_id: string | null; load_id: string | null; load_number: string | null }>(
        `SELECT bl.id::text, bl.description, bl.amount::text, bl.account_id::text, g.load_id::text, g.load_number
           FROM driver_finance.driver_settlement_gl_bills g
           JOIN accounting.bills b ON b.id = g.accounting_bill_id AND b.voided_at IS NULL
           JOIN accounting.bill_lines bl ON bl.bill_id = b.id AND bl.voided_at IS NULL
          WHERE g.settlement_id = $1::uuid AND g.operating_company_id = $2::uuid AND g.superseded_at IS NULL AND bl.item_id IS NULL`,
        [sid, co]
      )
    ).rows;
    for (const bl of billLines) {
      const text = norm((bl.description ?? "").replace(/^Load\s+\S+\s+—\s+/, ""));
      const amt = cents(bl.amount);
      const isReimb = / reimbursement$/.test(text);
      const cands = slAll.filter((s) => {
        if (s.load_id !== bl.load_id || cents(s.amount) !== amt || !s.item_id) return false;
        if (isReimb) return s.line_type === "reimbursement" && (!s.posting_account_id || s.posting_account_id === bl.account_id);
        return s.line_type !== "reimbursement" && norm(s.description || s.line_type.replace(/_/g, " ")) === text;
      });
      const distinct = [...new Set(cands.map((c) => c.item_id!))];
      if (distinct.length !== 1) { out.d1_bill_lines_unmatched.push(`${bl.load_number} ${bl.description} ${amt}: ${distinct.length} item(s)`); continue; }
      await client.query(
        `UPDATE accounting.bill_lines SET item_id = $2::uuid, quantity = 1, rate_cents = $3::bigint, unit_of_measure = 'each'
          WHERE id = $1::uuid AND item_id IS NULL`,
        [bl.id, distinct[0], amt]
      );
      out.d1_bill_lines_itemed++;
    }

    // ---- D3: invoice linehaul lines take "Line Haul" when its income account is the line's account ------------
    const d3 = await client.query(
      `UPDATE accounting.invoice_lines il
          SET item_id = it.id, unit_of_measure = COALESCE(il.unit_of_measure, 'each')
         FROM catalogs.items it
        WHERE il.invoice_id = ANY($1::uuid[]) AND il.operating_company_id = $2::uuid AND il.item_id IS NULL
          AND il.soft_deleted_at IS NULL AND il.line_type = 'linehaul'
          AND it.operating_company_id = $2::uuid AND it.item_name = 'Line Haul' AND it.deactivated_at IS NULL
          AND it.default_income_account_id = il.account_id
          AND (SELECT count(*) FROM catalogs.items x WHERE x.operating_company_id = $2::uuid AND x.item_name = 'Line Haul' AND x.deactivated_at IS NULL) = 1`,
      [ev.invoice_ids ?? [], co]
    );
    out.d3_invoice_lines_itemed = d3.rowCount ?? 0;

    // ---- D4: a posted expense reads posted -------------------------------------------------------------------
    const d4 = await client.query(
      `UPDATE accounting.expenses SET status = 'posted', updated_at = now()
        WHERE operating_company_id = $1::uuid AND settlement_no = $2 AND voided_at IS NULL
          AND status = 'draft' AND posting_status = 'posted' AND journal_entry_id IS NOT NULL`,
      [co, input.settlementNo]
    );
    out.d4_expenses_status_posted = d4.rowCount ?? 0;

    // ---- D5: header trailer from the document; lines from the header -----------------------------------------
    const trailerId = await resolveCreatorTrailerId(client as never, co, input.trailerEquipmentNumber);
    if (input.trailerEquipmentNumber && !trailerId) out.trailer_unresolved = input.trailerEquipmentNumber;
    if (trailerId) {
      const h = await client.query(
        `UPDATE accounting.expenses SET trailer_id = $3::uuid, updated_at = now()
          WHERE operating_company_id = $1::uuid AND settlement_no = $2 AND voided_at IS NULL AND trailer_id IS NULL`,
        [co, input.settlementNo, trailerId]
      );
      out.d5_headers_trailer = h.rowCount ?? 0;
    }
    const du = await client.query(
      `UPDATE accounting.expense_lines el SET driver_id = COALESCE(el.driver_id, e.driver_uuid), unit_id = COALESCE(el.unit_id, e.unit_id)
         FROM accounting.expenses e
        WHERE e.id = el.expense_id AND e.operating_company_id = $1::uuid AND e.settlement_no = $2 AND e.voided_at IS NULL
          AND ((el.driver_id IS NULL AND e.driver_uuid IS NOT NULL) OR (el.unit_id IS NULL AND e.unit_id IS NOT NULL))`,
      [co, input.settlementNo]
    );
    out.d5_lines_driver_unit = du.rowCount ?? 0;
    const dt = await client.query(
      `UPDATE accounting.expense_lines el SET trailer_id = e.trailer_id
         FROM accounting.expenses e
        WHERE e.id = el.expense_id AND e.operating_company_id = $1::uuid AND e.settlement_no = $2 AND e.voided_at IS NULL
          AND el.trailer_id IS NULL AND e.trailer_id IS NOT NULL`,
      [co, input.settlementNo]
    );
    out.d5_lines_trailer = dt.rowCount ?? 0;

    if (input.dryRun) {
      await client.query("ROLLBACK TO SAVEPOINT creator_categorize");
    } else {
      await audit("driver_finance.settlement_creator.categorized", {
        resource_type: "driver_finance.driver_settlements", resource_id: sid, operating_company_id: co, ...out,
      });
      await client.query("RELEASE SAVEPOINT creator_categorize");
    }
    return out;
  } catch (err) {
    await client.query("ROLLBACK TO SAVEPOINT creator_categorize").catch(() => {});
    throw err;
  }
}
