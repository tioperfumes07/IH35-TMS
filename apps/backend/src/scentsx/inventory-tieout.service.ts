/**
 * SCENTSX B10 — inventory sub-ledger ↔ general ledger tie-out (the month-end control NetSuite / QuickBooks run as
 * "inventory valuation vs. balance sheet"). Read-only.
 *
 * Every perfume.stock_moves row moves ScentsX's inventory-asset account (role inventory_asset, 1200) in the direction of its
 * quantity: receipt / opening / return / transfer_in / positive count up; shipment / transfer_out / write_down / negative count
 * down. The poster values each move as round(|qty| × unit cost) (stock-move-poster.service moveValueCents), so:
 *   sub-ledger value      = Σ sign(qty) × round(|qty| × unit_cost_cents) over ALL moves
 *   general-ledger value  = posted debits − credits on the inventory_asset account
 *   waiting to post       = the same sum over moves that have no posted journal entry yet
 *   difference            = sub-ledger − GL − waiting   (must be 0; anything else is a defect to investigate)
 * Goods in transit (1290) tie the same way to the transfer_out moves whose transfer_in has not happened.
 * Landed cost capitalized into lots on hand (scentsx.purchase_order_landed_costs.capitalized_cents) is added to the sub-ledger: it
 * changes the lots' cost with its own journal entry and no stock move, so without it every landed charge shows as a false difference.
 */
import type pg from "pg";
import { resolveRoleAccountOptional } from "../accounting/coa-roles/resolver.service.js";
import { scopeToScentsx } from "./links.service.js";
import { STOCK_MOVE_SOURCE } from "./stock-move-poster.service.js";
import { mappedInventoryAccounts } from "./item-accounts.service.js";

type Q = Pick<pg.PoolClient, "query">;

export type TieOut = {
  as_of: string; account_id: string | null; account_ids: string[]; subledger_cents: number; gl_cents: number; waiting_cents: number; waiting_moves: number;
  difference_cents: number; ties: boolean; zero_cost_moves: number;
};

export async function inventoryTieOut(c: Q, asOf?: string): Promise<TieOut> {
  const co = await scopeToScentsx(c);
  const day = asOf && /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? asOf : null;
  const acct = await resolveRoleAccountOptional(c as never, co, "inventory_asset");
  const sub = await c.query<{ total: string; waiting: string; waiting_n: number; zero_n: number; as_of: string }>(
    `WITH m AS (
       SELECT sm.id, sign(sm.qty) * round(abs(sm.qty) * sm.unit_cost_cents) AS v,
              NOT EXISTS (SELECT 1 FROM accounting.journal_entry_postings p JOIN accounting.journal_entries j ON j.id = p.journal_entry_uuid
                           WHERE p.source_transaction_type = $1 AND p.source_transaction_id = sm.id::text AND j.operating_company_id = $2::uuid
                             AND j.status = 'posted') AS waiting,
              sm.unit_cost_cents = 0 AS zero_cost
         FROM perfume.stock_moves sm
        WHERE $3::date IS NULL OR sm.moved_at < ($3::date + 1)::timestamp AT TIME ZONE 'America/Chicago')
     SELECT coalesce(sum(v), 0)::text AS total, coalesce(sum(v) FILTER (WHERE waiting), 0)::text AS waiting,
            count(*) FILTER (WHERE waiting)::int AS waiting_n, count(*) FILTER (WHERE zero_cost)::int AS zero_n,
            coalesce($3::date, (now() AT TIME ZONE 'America/Chicago')::date)::text AS as_of
       FROM m`,
    [STOCK_MOVE_SOURCE, co, day]
  );
  // Every inventory account stock can sit on: the role account plus every account an item category / item was ever mapped to
  // (migration 202617050100). The subledger is one number, so the GL side is their sum.
  const accounts = [...new Set([...(acct ? [acct] : []), ...(await mappedInventoryAccounts(c, co))])];
  let gl = 0;
  if (accounts.length) {
    const g = await c.query<{ bal: string }>(
      `SELECT coalesce(sum(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END), 0)::text AS bal
         FROM accounting.journal_entry_postings p JOIN accounting.journal_entries j ON j.id = p.journal_entry_uuid
        WHERE p.account_id = ANY($1::uuid[]) AND j.operating_company_id = $2::uuid AND j.status = 'posted'
          AND ($3::date IS NULL OR j.entry_date <= $3::date)`,
      [accounts, co, day]
    );
    gl = Number(g.rows[0]!.bal);
  }
  // Landed cost (freight-in / customs on a PO bill, migration 202617250100) raises the cost of the lots still on hand without a
  // stock move: its capitalized part is part of the inventory sub-ledger, posted by its own journal entry (Dr Inventory / Cr 5100|5110).
  const landed = (await c.query<{ total: string; waiting: string }>(
    `SELECT coalesce(sum(lc.capitalized_cents), 0)::text AS total,
            coalesce(sum(lc.capitalized_cents) FILTER (WHERE j.id IS NULL OR j.status <> 'posted'), 0)::text AS waiting
       FROM scentsx.purchase_order_landed_costs lc LEFT JOIN accounting.journal_entries j ON j.id = lc.journal_entry_id
      WHERE lc.operating_company_id = $1::uuid
        AND ($2::date IS NULL OR coalesce(j.entry_date, (lc.created_at AT TIME ZONE 'America/Chicago')::date) <= $2::date)`,
    [co, day])).rows[0]!;
  const s = sub.rows[0]!;
  const subledger = Number(s.total) + Number(landed.total), waiting = Number(s.waiting) + Number(landed.waiting);
  const difference = subledger - gl - waiting;
  return { as_of: s.as_of, account_id: acct, account_ids: accounts, subledger_cents: subledger, gl_cents: gl, waiting_cents: waiting, waiting_moves: s.waiting_n,
    difference_cents: difference, ties: difference === 0, zero_cost_moves: s.zero_n };
}
