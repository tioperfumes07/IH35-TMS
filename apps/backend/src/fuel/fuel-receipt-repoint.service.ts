/**
 * LEAD 443.121 #2 — a fuel receipt that posted while no load covered its fill time (deadhead / yard, or the load was not
 * booked yet) is ATTACHED to the load the moment a load covering that time exists. The SAME journal entry and the SAME
 * expense document move to the load — never a reversal-repost, never a second posting:
 *
 *   - the fuel row(s) (fuel.fuel_transactions) take the load + its trailer and drop the deadhead/yard reason;
 *   - the fill's postings take load_id: refuse_posting_fact_update (202615360200) lets load_id be FILLED ONCE from NULL
 *     (never repointed or cleared), so the existing postings carry the load in place — the WORM trigger is untouched;
 *   - the expense document takes the load, its load-spine number (generateExpenseNumber) and its link row through the
 *     ONE link writer (insertExpenseLoadLink); its lines take the load and drop the exemption reason;
 *   - the settlement reference is stamped when one live settlement holds the load (443.121 #3);
 *   - one audit event per receipt.
 *
 * "Covers" is THE one fuel-to-load rule (fuel/fuel-load-at-time.ts, G7): a receipt is attached to a load only when
 * resolveFuelLoadAtTime(unit, driver, fill time) returns exactly that load — no second window rule.
 *
 * Called by Book Load (bookLoadOnClient — Dispatch Book Load and the Settlement Creator seed), Edit Load
 * (updateDispatchLoad) and the Owner history route POST /api/v1/fuel/receipts/repoint-to-loads.
 */
import { appendCrudAudit } from "../audit/crud-audit.js";
import { linkExpenseToLoadInClientTx, reserveLoadSpineExpenseNumber } from "../accounting/expense-writer.service.js";
import { stampReceiptDocumentSettlementRef } from "./fuel-expense-document.service.js";
import { resolveFuelLoadAtTime } from "./fuel-load-at-time.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

export const FUEL_RECEIPT_ATTACHED_EVENT = "fuel.receipt_attached_to_load";

export type ReceiptCandidate = {
  fill_kind: "fuel_transaction" | "relay_fuel";
  fill_id: string;
  at: string;
  unit_id: string | null;
  driver_id: string | null;
};

export type AttachOutcome = {
  fill_kind: ReceiptCandidate["fill_kind"];
  fill_id: string;
  load_id: string | null;
  load_number: string | null;
  outcome: "attached" | "planned" | "no_covering_load" | "refused";
  postings_stamped?: number;
  expense_id?: string | null;
  expense_number?: string | null;
  settlement_no?: string | null;
  reason?: string;
};

/**
 * Posted fuel receipts of the company whose postings carry no load. `loadId` narrows to receipts on that load's unit or
 * drivers (the booking hook); without it, every such receipt (the history route).
 */
export async function findUnattachedPostedReceipts(
  client: DbClient,
  operatingCompanyId: string,
  loadId?: string | null
): Promise<ReceiptCandidate[]> {
  const res = await client.query<ReceiptCandidate>(
    `
      WITH posted AS (
        SELECT DISTINCT p.source_transaction_id::text AS fill_id
          FROM accounting.journal_entry_postings p
          JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND je.operating_company_id = p.operating_company_id
         WHERE p.operating_company_id = $1::uuid
           AND p.source_transaction_type = 'fuel_event'
           AND p.load_id IS NULL
           AND p.reversal_of_line_id IS NULL
           AND je.status = 'posted' AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL AND je.reverses_je_id IS NULL
      ), lo AS (
        SELECT l.assigned_unit_id, l.assigned_primary_driver_id, l.assigned_secondary_driver_id
          FROM mdata.loads l WHERE l.id = $2::uuid AND l.operating_company_id = $1::uuid
      ), receipts AS (
        SELECT 'relay_fuel'::text AS fill_kind, r.id::text AS fill_id,
               COALESCE(r.relay_created_at, r.created_at)::text AS at,
               r.matched_unit_id::text AS unit_id, r.matched_driver_id::text AS driver_id
          FROM integrations.relay_fuel_transactions r JOIN posted ON posted.fill_id = r.id::text
         WHERE r.operating_company_id = $1::uuid AND r.voided_at IS NULL
        UNION ALL
        SELECT 'fuel_transaction', ft.id::text, COALESCE(ft.transaction_at, ft.created_at)::text,
               ft.unit_id::text, ft.driver_id::text
          FROM fuel.fuel_transactions ft JOIN posted ON posted.fill_id = ft.id::text
         WHERE ft.operating_company_id = $1::uuid AND ft.voided_at IS NULL
      )
      SELECT rc.fill_kind, rc.fill_id, rc.at, rc.unit_id, rc.driver_id
        FROM receipts rc
       WHERE $2::uuid IS NULL
          OR EXISTS (SELECT 1 FROM lo WHERE lo.assigned_unit_id::text = rc.unit_id
                                         OR lo.assigned_primary_driver_id::text = rc.driver_id
                                         OR lo.assigned_secondary_driver_id::text = rc.driver_id)
       ORDER BY rc.at, rc.fill_id
    `,
    [operatingCompanyId, loadId ?? null]
  );
  return res.rows;
}

/**
 * Attach ONE posted receipt to `loadId` (already resolved by the one rule). Caller owns the transaction; on any error the
 * caller's savepoint rolls this receipt back alone.
 */
export async function attachFuelReceiptToLoad(
  client: DbClient,
  input: { operatingCompanyId: string; actorUserId: string; receipt: ReceiptCandidate; loadId: string; loadNumber: string | null; trailerId: string | null }
): Promise<AttachOutcome> {
  const { operatingCompanyId: opco, receipt, loadId } = input;
  const ftWhere =
    receipt.fill_kind === "relay_fuel"
      ? `relay_fuel_transaction_id::text = $3`
      : `id::text = $3`;
  // 1) The fuel row(s) first: accounting.posting_source_load_id('fuel_event', …) reads fuel.fuel_transactions.load_id,
  //    so the postings' new load_id and their source document agree (trg_load_born_posting_carries_its_load).
  await client.query(
    `UPDATE fuel.fuel_transactions
        SET load_id = $2::uuid, trailer_id = COALESCE(trailer_id, $4::uuid), load_exemption_reason = NULL, updated_at = now()
      WHERE operating_company_id = $1::uuid AND ${ftWhere} AND load_id IS NULL AND voided_at IS NULL`,
    [opco, loadId, receipt.fill_id, input.trailerId]
  );
  // 2) The SAME postings carry the load (fill-once NULL -> load; refuse_posting_fact_update never lets it move again).
  const stamped = await client.query(
    `UPDATE accounting.journal_entry_postings
        SET load_id = $2::uuid
      WHERE operating_company_id = $1::uuid AND source_transaction_type = 'fuel_event' AND source_transaction_id::text = $3
        AND load_id IS NULL`,
    [opco, loadId, receipt.fill_id]
  );
  // 3) The SAME expense document moves to the load: load, load-spine number, link row (one link writer), lines.
  const docRes = await client.query<{ id: string; expense_number: string | null }>(
    `SELECT e.id::text, e.expense_number
       FROM accounting.expenses e
      WHERE e.operating_company_id = $1::uuid AND e.voided_at IS NULL AND e.load_id IS NULL
        AND (e.journal_entry_id IN (SELECT DISTINCT p.journal_entry_uuid FROM accounting.journal_entry_postings p
                                     WHERE p.operating_company_id = $1::uuid AND p.source_transaction_type = 'fuel_event'
                                       AND p.source_transaction_id::text = $2)
             OR e.source_fuel_transaction_id IN (SELECT ft.id FROM fuel.fuel_transactions ft
                                                  WHERE ft.operating_company_id = $1::uuid
                                                    AND (ft.id::text = $2 OR ft.relay_fuel_transaction_id::text = $2)))
      ORDER BY e.created_at
      LIMIT 1`,
    [opco, receipt.fill_id]
  );
  const doc = docRes.rows[0] ?? null;
  let expenseNumber: string | null = doc?.expense_number ?? null;
  let settlementNo: string | null = null;
  if (doc) {
    // 443.182 C — the spine number and the load link come from the one expense engine.
    const spine = await reserveLoadSpineExpenseNumber(client as never, opco, loadId);
    expenseNumber = spine.number;
    await client.query(
      `UPDATE accounting.expenses
          SET load_id = $3::uuid, expense_number = $4, trailer_id = COALESCE(trailer_id, $5::uuid), updated_at = now()
        WHERE id = $1::uuid AND operating_company_id = $2::uuid AND load_id IS NULL`,
      [doc.id, opco, loadId, spine.number, input.trailerId]
    );
    await client.query(
      `UPDATE accounting.expense_lines
          SET load_id = $3::uuid, load_required = true, load_exemption_reason = NULL,
              trailer_id = COALESCE(trailer_id, $4::uuid)
        WHERE expense_id = $1::uuid AND operating_company_id = $2::uuid AND load_id IS NULL`,
      [doc.id, opco, loadId, input.trailerId]
    );
    await linkExpenseToLoadInClientTx(client as never, {
      operatingCompanyId: opco,
      expenseId: doc.id,
      loadId,
      loadNumber: spine.loadNumber,
      seq: spine.seq,
      expenseNumber: spine.number,
      method: "auto_timestamp",
      confidence: "high",
      reason: "fuel receipt attached when a load covering its fill time was booked (LEAD 443.121 #2)",
      userId: input.actorUserId,
      overriddenFromExpenseNumber: doc.expense_number,
    });
    settlementNo = await stampReceiptDocumentSettlementRef(client as never, {
      operating_company_id: opco,
      expense_id: doc.id,
      actor_user_uuid: input.actorUserId,
    });
  }
  await appendCrudAudit(
    client as never,
    input.actorUserId,
    FUEL_RECEIPT_ATTACHED_EVENT,
    {
      operating_company_id: opco,
      fill_kind: receipt.fill_kind,
      fill_id: receipt.fill_id,
      load_id: loadId,
      load_number: input.loadNumber,
      postings_stamped: stamped.rowCount ?? 0,
      expense_id: doc?.id ?? null,
      expense_number_before: doc?.expense_number ?? null,
      expense_number_after: expenseNumber,
      settlement_no: settlementNo,
    },
    "info",
    "LEAD-443.121"
  );
  return {
    fill_kind: receipt.fill_kind,
    fill_id: receipt.fill_id,
    load_id: loadId,
    load_number: input.loadNumber,
    outcome: "attached",
    postings_stamped: stamped.rowCount ?? 0,
    expense_id: doc?.id ?? null,
    expense_number: expenseNumber,
    settlement_no: settlementNo,
  };
}

async function attachOne(
  client: DbClient,
  opco: string,
  actorUserId: string,
  receipt: ReceiptCandidate,
  onlyLoadId: string | null,
  dryRun: boolean
): Promise<AttachOutcome> {
  const base = { fill_kind: receipt.fill_kind, fill_id: receipt.fill_id };
  const hit = await resolveFuelLoadAtTime(client, {
    operatingCompanyId: opco,
    unitId: receipt.unit_id,
    driverId: receipt.driver_id,
    at: receipt.at,
  });
  if (!hit || (onlyLoadId && hit.load_id !== onlyLoadId)) {
    return { ...base, load_id: null, load_number: null, outcome: "no_covering_load" };
  }
  if (dryRun) return { ...base, load_id: hit.load_id, load_number: hit.load_number, outcome: "planned" };
  await client.query("SAVEPOINT fuel_receipt_attach");
  try {
    const out = await attachFuelReceiptToLoad(client, {
      operatingCompanyId: opco,
      actorUserId,
      receipt,
      loadId: hit.load_id,
      loadNumber: hit.load_number,
      trailerId: hit.trailer_id,
    });
    await client.query("RELEASE SAVEPOINT fuel_receipt_attach");
    return out;
  } catch (err) {
    await client.query("ROLLBACK TO SAVEPOINT fuel_receipt_attach");
    return { ...base, load_id: hit.load_id, load_number: hit.load_number, outcome: "refused", reason: String((err as Error)?.message ?? err) };
  }
}

/**
 * Booking / edit hook: attach every posted, load-less receipt whose fill time this load now covers (the one rule).
 * Never throws on a single receipt — a refusal is returned and audited, the booking stands.
 */
export async function repointFuelReceiptsToLoad(
  client: DbClient,
  input: { operatingCompanyId: string; loadId: string; actorUserId: string }
): Promise<AttachOutcome[]> {
  const candidates = await findUnattachedPostedReceipts(client, input.operatingCompanyId, input.loadId);
  const out: AttachOutcome[] = [];
  for (const receipt of candidates) {
    const r = await attachOne(client, input.operatingCompanyId, input.actorUserId, receipt, input.loadId, false);
    if (r.outcome === "refused") {
      await appendCrudAudit(client as never, input.actorUserId, "fuel.receipt_attach_refused", {
        operating_company_id: input.operatingCompanyId, fill_id: r.fill_id, load_id: r.load_id, reason: r.reason,
      }, "warning", "LEAD-443.121");
    }
    if (r.outcome !== "no_covering_load") out.push(r);
  }
  return out;
}

/** History run (Owner route): every posted, load-less receipt of the company that a load now covers. */
export async function repointAllFuelReceipts(
  client: DbClient,
  input: { operatingCompanyId: string; actorUserId: string; dryRun: boolean }
): Promise<AttachOutcome[]> {
  const candidates = await findUnattachedPostedReceipts(client, input.operatingCompanyId, null);
  const out: AttachOutcome[] = [];
  for (const receipt of candidates) {
    out.push(await attachOne(client, input.operatingCompanyId, input.actorUserId, receipt, null, input.dryRun));
  }
  return out;
}

export type HistoryPostOutcome = { fill_id: string; outcome: "posted_on_load" | "posted_no_load" | "refused"; load_id?: string | null; reason?: string };

/**
 * LEAD 443.121 #2 history: Relay fills received before the receipt poster existed (no fuel posting from ANY writer — no
 * fuel_event posting, no live expense document on their fuel rows, no bank line that posted them) post now, through the
 * ONE receipt poster (postFuelFillOnReceipt): on the load the one rule finds, else with the deadhead/yard reason. A fill
 * the poster refuses by name (no unit, no fuel line, lines that do not foot, closed period) is reported, never forced.
 */
export async function postUnpostedRelayReceipts(
  client: DbClient,
  input: { operatingCompanyId: string; actorUserId: string }
): Promise<HistoryPostOutcome[]> {
  const fills = await client.query<{ id: string }>(
    `SELECT r.id::text
       FROM integrations.relay_fuel_transactions r
      WHERE r.operating_company_id = $1::uuid AND r.voided_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM accounting.journal_entry_postings p
                         WHERE p.operating_company_id = r.operating_company_id AND p.source_transaction_type = 'fuel_event'
                           AND p.source_transaction_id::text = r.id::text)
        AND NOT EXISTS (SELECT 1 FROM accounting.expenses e
                          JOIN fuel.fuel_transactions ft ON ft.id = e.source_fuel_transaction_id
                         WHERE e.voided_at IS NULL AND ft.relay_fuel_transaction_id = r.id)
        AND NOT EXISTS (SELECT 1 FROM banking.bank_transactions b
                         WHERE b.matched_relay_fuel_transaction_id = r.id AND b.matched_journal_entry_id IS NOT NULL
                           AND b.voided_at IS NULL)
      ORDER BY COALESCE(r.relay_created_at, r.created_at), r.id`,
    [input.operatingCompanyId]
  );
  const { postFuelFillOnReceipt } = await import("../accounting/bank-recon/bank-match-fuel-post.service.js");
  const out: HistoryPostOutcome[] = [];
  for (const f of fills.rows) {
    await client.query("SAVEPOINT fuel_receipt_history_post");
    try {
      const posted = await postFuelFillOnReceipt(client as never, {
        operating_company_id: input.operatingCompanyId,
        actor_user_uuid: input.actorUserId,
        kind: "relay_fuel",
        fill_id: f.id,
      });
      const load = posted.journal_entry_id
        ? (await client.query<{ load_id: string | null }>(
            `SELECT max(load_id::text) AS load_id FROM accounting.journal_entry_postings WHERE journal_entry_uuid = $1::uuid`,
            [posted.journal_entry_id]
          )).rows[0]?.load_id ?? null
        : null;
      await client.query("RELEASE SAVEPOINT fuel_receipt_history_post");
      out.push({ fill_id: f.id, outcome: load ? "posted_on_load" : "posted_no_load", load_id: load });
    } catch (err) {
      await client.query("ROLLBACK TO SAVEPOINT fuel_receipt_history_post");
      out.push({ fill_id: f.id, outcome: "refused", reason: String((err as Error)?.message ?? err) });
    }
  }
  return out;
}

/** Owner route body: post the history receipts, then attach every load-less receipt a load now covers. Dry run rolls back. */
export async function runFuelReceiptHistory(
  client: DbClient,
  input: { operatingCompanyId: string; actorUserId: string; dryRun: boolean }
) {
  await client.query("SAVEPOINT fuel_receipt_history_run");
  const posted = await postUnpostedRelayReceipts(client, input);
  const attached = await repointAllFuelReceipts(client, { ...input, dryRun: false });
  if (input.dryRun) await client.query("ROLLBACK TO SAVEPOINT fuel_receipt_history_run");
  else await client.query("RELEASE SAVEPOINT fuel_receipt_history_run");
  const count = <T extends { outcome: string }>(rows: T[], o: string) => rows.filter((r) => r.outcome === o).length;
  return {
    dry_run: input.dryRun,
    operating_company_id: input.operatingCompanyId,
    received_fills_considered: posted.length,
    posted_on_load: count(posted, "posted_on_load"),
    posted_no_load: count(posted, "posted_no_load"),
    post_refused: count(posted, "refused"),
    unattached_receipts_considered: attached.length,
    attached_to_load: count(attached, "attached"),
    no_covering_load: count(attached, "no_covering_load"),
    attach_refused: count(attached, "refused"),
    posted,
    attached: attached.filter((a) => a.outcome !== "no_covering_load"),
  };
}
