/**
 * 443.136 follow-up — ONE PURCHASE, ONE POSTING, even when Relay lists it twice.
 *
 * WHY: Relay can report the SAME pump purchase under two transaction ids / fuel codes (prod 2026-10-12: T152 Laredo
 * 09-07 diesel 31.204 gal $171.04 as txn_2xTTwBYFDSJNuQ and txn_AJyrss5NZ141mg, 86 min apart; T148 Laredo diesel
 * 14.781 gal $81.02 as txn_2mLB51LEnRMmix and txn_2xU8KgCxBmTLqp, 56 min apart). The receipt identity
 * (fuel.fuel_receipt_postings, 443.121 #1) is keyed on the Relay transaction id, so each copy posted as its own receipt and
 * the wallet + fuel expense were booked twice (verify-no-fuel-purchase-booked-twice).
 *
 * THE RULE (exact, never fuzzy): two live Relay fills of one company are the same purchase when they carry the same truck,
 * the same Relay location, the same products at the same volumes (to the thousandth) and the same amount paid, within
 * 24 hours. Identical metered volume on the same truck at the same pump is one purchase recorded twice, not two fills.
 *   - The Relay poster refuses to post a fill whose twin is already posted (relay_fill_duplicate_purchase, naming it).
 *   - Owner repair: where BOTH copies are already posted, the later-posted copy's expense document is voided through the
 *     ONE expense void (accounting/expense-void.service.ts) — reversal + receipt released + audit; the first stays.
 */
import { voidExpenseDocumentInClientTx } from "../accounting/expense-void.service.js";

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }> };

/** The purchase signature of a Relay fill: truck, location, products+volumes, paid cents, Relay time. */
const SIGNATURE_SQL = `
  SELECT r.id, r.operating_company_id,
         COALESCE(r.matched_unit_id::text, 'n:' || btrim(r.matched_unit_number)) AS truck,
         COALESCE(r.location_id::text, lower(btrim(coalesce(r.location_city, ''))) || '|' || lower(btrim(coalesce(r.location_state, '')))) AS place,
         r.total_amount_paid_cents AS paid,
         COALESCE(r.relay_created_at, (r.raw_payload->>'created_at')::timestamptz) AS at,
         (SELECT string_agg(lower(coalesce(l.fuel_type::text, '')) || ':' || to_char(l.volume, 'FM999999990.000'), ',' ORDER BY lower(coalesce(l.fuel_type::text, '')), l.volume)
            FROM integrations.relay_fuel_transaction_lines l
           WHERE l.relay_fuel_transaction_id = r.id AND l.voided_at IS NULL AND l.volume IS NOT NULL) AS items
    FROM integrations.relay_fuel_transactions r
   WHERE r.voided_at IS NULL`;

/** A live fuel_event posting for this fill (not reversed). */
const POSTED_SQL = (alias: string) => `EXISTS (SELECT 1 FROM accounting.journal_entry_postings p
                     WHERE p.source_transaction_type = 'fuel_event' AND p.source_transaction_id = ${alias}.id::text
                       AND p.operating_company_id = ${alias}.operating_company_id
                       AND p.reversal_of_line_id IS NULL AND p.reversed_by_line_id IS NULL)`;

export type RelayTwin = { fill_id: string; transaction_id: string | null };

/** Already-posted twins of this fill (same purchase recorded twice by Relay). Empty = this fill is the first copy. */
export async function postedRelayTwinsOf(client: Queryable, operatingCompanyId: string, fillId: string): Promise<RelayTwin[]> {
  const res = await client.query(
    `WITH s AS (${SIGNATURE_SQL} AND r.operating_company_id = $1::uuid)
     SELECT b.id::text AS fill_id, rb.transaction_id
       FROM s a JOIN s b ON b.id <> a.id AND b.truck = a.truck AND b.place = a.place AND b.paid = a.paid
                        AND a.items IS NOT NULL AND b.items = a.items
                        AND abs(extract(epoch FROM (b.at - a.at))) < 86400
       JOIN integrations.relay_fuel_transactions rb ON rb.id = b.id
      WHERE a.id = $2::uuid AND ${POSTED_SQL("rb")}
      ORDER BY b.id`,
    [operatingCompanyId, fillId]
  );
  return res.rows.map((r) => ({ fill_id: r.fill_id, transaction_id: r.transaction_id ?? null }));
}

export type DuplicatePairPlan = {
  keep_fill_id: string;
  keep_transaction_id: string | null;
  void_fill_id: string;
  void_transaction_id: string | null;
  void_expense_ids: string[];
  outcome: "planned" | "voided" | "refused";
  reason?: string;
};

/**
 * Owner repair: every pair of posted copies of one purchase -> void the LATER-POSTED copy's expense document(s) through the
 * one expense void. Keep = first posted (earliest posting), tie -> earliest Relay time, tie -> smaller id. Idempotent: a
 * voided copy is no longer posted, so a second run finds nothing. dryRun plans only.
 */
export async function voidLaterRelayDuplicatePurchases(
  client: Queryable,
  input: { operatingCompanyId: string; actorUserId: string; dryRun: boolean }
): Promise<{ dry_run: boolean; pairs: number; voided: number; refused: number; plans: DuplicatePairPlan[] }> {
  const pairs = (
    await client.query(
      `WITH s AS (${SIGNATURE_SQL} AND r.operating_company_id = $1::uuid),
            posted AS (
              SELECT s.*, (SELECT min(p.created_at) FROM accounting.journal_entry_postings p
                             WHERE p.source_transaction_type = 'fuel_event' AND p.source_transaction_id = s.id::text
                               AND p.operating_company_id = s.operating_company_id
                               AND p.reversal_of_line_id IS NULL AND p.reversed_by_line_id IS NULL) AS posted_at
                FROM s)
       SELECT a.id::text AS a_id, b.id::text AS b_id, ra.transaction_id AS a_txn, rb.transaction_id AS b_txn,
              a.posted_at AS a_posted, b.posted_at AS b_posted, a.at AS a_at, b.at AS b_at
         FROM posted a JOIN posted b ON a.id < b.id AND b.truck = a.truck AND b.place = a.place AND b.paid = a.paid
                                    AND a.items IS NOT NULL AND b.items = a.items
                                    AND abs(extract(epoch FROM (b.at - a.at))) < 86400
         JOIN integrations.relay_fuel_transactions ra ON ra.id = a.id
         JOIN integrations.relay_fuel_transactions rb ON rb.id = b.id
        WHERE a.posted_at IS NOT NULL AND b.posted_at IS NOT NULL
        ORDER BY a.id, b.id`,
      [input.operatingCompanyId]
    )
  ).rows as { a_id: string; b_id: string; a_txn: string | null; b_txn: string | null; a_posted: Date; b_posted: Date; a_at: Date | null; b_at: Date | null }[];

  const plans: DuplicatePairPlan[] = [];
  let voided = 0;
  let refused = 0;
  for (const p of pairs) {
    const aFirst =
      p.a_posted.getTime() !== p.b_posted.getTime()
        ? p.a_posted.getTime() < p.b_posted.getTime()
        : (p.a_at?.getTime() ?? 0) !== (p.b_at?.getTime() ?? 0)
          ? (p.a_at?.getTime() ?? 0) < (p.b_at?.getTime() ?? 0)
          : p.a_id < p.b_id;
    const keep = aFirst ? { id: p.a_id, txn: p.a_txn } : { id: p.b_id, txn: p.b_txn };
    const drop = aFirst ? { id: p.b_id, txn: p.b_txn } : { id: p.a_id, txn: p.a_txn };
    // The copy's live document(s): the expense document(s) that adopted its live fuel_event entry.
    const docs = (
      await client.query(
        `SELECT DISTINCT e.id::text AS id
           FROM accounting.expenses e
          WHERE e.operating_company_id = $1::uuid AND e.voided_at IS NULL
            AND EXISTS (SELECT 1 FROM accounting.journal_entry_postings p
                         WHERE p.journal_entry_uuid = e.journal_entry_id AND p.source_transaction_type = 'fuel_event'
                           AND p.source_transaction_id = $2 AND p.reversal_of_line_id IS NULL)
          ORDER BY 1`,
        [input.operatingCompanyId, drop.id]
      )
    ).rows.map((r) => r.id as string);
    const plan: DuplicatePairPlan = {
      keep_fill_id: keep.id, keep_transaction_id: keep.txn, void_fill_id: drop.id, void_transaction_id: drop.txn,
      void_expense_ids: docs, outcome: "planned",
    };
    if (!docs.length) {
      plan.outcome = "refused";
      plan.reason = "the later copy's posting has no live expense document to void — repair by hand is not allowed; reported";
      refused += 1;
      plans.push(plan);
      continue;
    }
    if (!input.dryRun) {
      await client.query("SAVEPOINT relay_dup_void");
      try {
        for (const expenseId of docs) {
          await voidExpenseDocumentInClientTx(client, {
            operatingCompanyId: input.operatingCompanyId,
            expenseId,
            actorUserId: input.actorUserId,
            reason: `443.136: Relay listed one purchase twice — ${drop.txn ?? drop.id} duplicates ${keep.txn ?? keep.id} (same truck, place, products, volume, amount)`,
          });
        }
        await client.query("RELEASE SAVEPOINT relay_dup_void");
        plan.outcome = "voided";
        voided += 1;
      } catch (err) {
        await client.query("ROLLBACK TO SAVEPOINT relay_dup_void");
        plan.outcome = "refused";
        plan.reason = err instanceof Error ? err.message : String(err);
        refused += 1;
        // A refused void must surface by name, never pass silently: the caller reports it; nothing was changed for this pair.
      }
    }
    plans.push(plan);
  }
  return { dry_run: input.dryRun, pairs: pairs.length, voided, refused, plans };
}
