/**
 * SCENTSX B3b — post a TIO Perfumes stock move to ScentsX LLC's general ledger.
 *
 * Owner 2026-11-26 20:16 CT "full accounting engines … complete wiring to ledgers liabilities assets"; 20:28 CT FIFO lots
 * for the books. Design https://claude.ai/artifact/VQ83ogvJyPpVoop1FNKJXC (posting map). Contract with the P1 seat
 * (ROUND P1.16): the journal entry points at the move — source_transaction_type 'perfume_stock_move', id = the move id.
 *
 * WRITES ZERO NEW GL MATH: every entry goes through createJournalEntryOnClient (balanced-or-refused, open period required,
 * audit), accounts resolve by role for SCENTSX only (resolveRoleAccount — never a number or a name). Value = |qty| × the
 * move's FIFO unit cost, rounded to the cent. One entry per move (latch on the posting's source pair); flag per entity.
 */
import type pg from "pg";
import { createJournalEntryOnClient } from "../accounting/journal-entries.service.js";
import { resolveRoleAccount, type CoaRole } from "../accounting/coa-roles/resolver.service.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import { scopeToScentsx } from "./links.service.js";

export const SCENTSX_STOCK_MOVE_FLAG = "SCENTSX_STOCK_MOVE_GL_POSTING_ENABLED";
export const STOCK_MOVE_SOURCE = "perfume_stock_move";

type Q = Pick<pg.PoolClient, "query">;
export type MoveKind = "opening" | "receipt" | "shipment" | "transfer_out" | "transfer_in" | "adjustment" | "count" | "return" | "write_down";

/** Debit and credit role for each kind of move (the design's posting map). qty sign picks the side for adjustments / counts. */
export function rolesForMove(kind: MoveKind, qty: number): { debit: CoaRole; credit: CoaRole } {
  switch (kind) {
    case "opening": return { debit: "inventory_asset", credit: "opening_balance_equity" };
    case "receipt": return { debit: "inventory_asset", credit: "goods_received_not_billed" };
    case "shipment": return { debit: "cogs_goods", credit: "inventory_asset" };
    case "return": return { debit: "inventory_asset", credit: "cogs_goods" };
    case "transfer_out": return { debit: "inventory_in_transit", credit: "inventory_asset" };
    case "transfer_in": return { debit: "inventory_asset", credit: "inventory_in_transit" };
    case "write_down": return { debit: "inventory_writedown", credit: "inventory_asset" };
    case "adjustment":
    case "count":
      return qty > 0 ? { debit: "inventory_asset", credit: "inventory_shrink" } : { debit: "inventory_shrink", credit: "inventory_asset" };
  }
}

export function moveValueCents(qty: number, unitCostCents: number | string): number {
  return Math.round(Math.abs(qty) * Number(unitCostCents));
}

export type PostMoveResult =
  | { posted: true; journal_entry_id: string; amount_cents: number }
  | { posted: false; reason: "flag_off" | "zero_value" | "already_posted" | "move_not_found"; journal_entry_id?: string };

export async function postStockMove(c: Q, moveId: string, actor: { userId: string; role: string }): Promise<PostMoveResult> {
  const co = await scopeToScentsx(c);
  if (!(await isEnabled(c as never, SCENTSX_STOCK_MOVE_FLAG, { operating_company_id: co }))) return { posted: false, reason: "flag_off" };
  const m = await c.query<{ id: string; kind: MoveKind; qty: number; unit_cost_cents: string; moved_on: string; location_code: string; item: string }>(
    `SELECT sm.id::text, sm.kind, sm.qty, sm.unit_cost_cents::text, (sm.moved_at AT TIME ZONE 'America/Chicago')::date::text AS moved_on,
            sm.location_code, coalesce(i.name, i.id::text) AS item
       FROM perfume.stock_moves sm JOIN perfume.items i ON i.id = sm.item_id WHERE sm.id = $1::uuid`,
    [moveId]
  );
  const mv = m.rows[0];
  if (!mv) return { posted: false, reason: "move_not_found" };
  const done = await c.query<{ id: string }>(
    `SELECT DISTINCT p.journal_entry_uuid::text AS id FROM accounting.journal_entry_postings p
       JOIN accounting.journal_entries j ON j.id = p.journal_entry_uuid
      WHERE p.source_transaction_type = $1 AND p.source_transaction_id = $2::text AND j.operating_company_id = $3::uuid AND j.status = 'posted'`,
    [STOCK_MOVE_SOURCE, moveId, co]
  );
  if (done.rows[0]) return { posted: false, reason: "already_posted", journal_entry_id: done.rows[0].id };
  const amount = moveValueCents(mv.qty, mv.unit_cost_cents);
  if (amount <= 0) return { posted: false, reason: "zero_value" };
  const roles = rolesForMove(mv.kind, mv.qty);
  const [debitAcct, creditAcct] = [await resolveRoleAccount(c as never, co, roles.debit), await resolveRoleAccount(c as never, co, roles.credit)];
  const memo = `Stock ${mv.kind.replace(/_/g, " ")} · ${Math.abs(mv.qty)} × ${mv.item} · ${mv.location_code}`;
  const je = await createJournalEntryOnClient(
    c as never,
    {
      operating_company_id: co,
      entry_date: mv.moved_on,
      memo,
      source: "auto",
      source_transaction_type: STOCK_MOVE_SOURCE,
      source_transaction_id: moveId,
      postings: [
        { account_id: debitAcct, debit_or_credit: "debit", amount_cents: amount, description: memo },
        { account_id: creditAcct, debit_or_credit: "credit", amount_cents: amount, description: memo },
      ],
    } as never,
    actor
  );
  return { posted: true, journal_entry_id: String((je as { id: string }).id), amount_cents: amount };
}

/** Stock moves of the TIO Perfumes desk that have no posted ScentsX journal entry yet (oldest first). */
export async function pendingStockMoves(c: Q, limit = 200): Promise<{ count: number; ids: string[] }> {
  const co = await scopeToScentsx(c);
  const r = await c.query<{ id: string; total: number }>(
    `SELECT sm.id::text, count(*) OVER ()::int AS total
       FROM perfume.stock_moves sm
      WHERE NOT EXISTS (
        SELECT 1 FROM accounting.journal_entry_postings p JOIN accounting.journal_entries j ON j.id = p.journal_entry_uuid
         WHERE p.source_transaction_type = $1 AND p.source_transaction_id = sm.id::text AND j.operating_company_id = $2::uuid AND j.status = 'posted')
      ORDER BY sm.moved_at, sm.id
      LIMIT $3`,
    [STOCK_MOVE_SOURCE, co, limit]
  );
  return { count: r.rows[0]?.total ?? 0, ids: r.rows.map((x) => x.id) };
}

export type SweepResult = { scanned: number; posted: number; skipped: number; failed: Array<{ id: string; error: string }> };

/** Post every pending move, one savepoint each — a move that fails is reported by id, never silently dropped. */
export async function postPendingStockMoves(c: Q, actor: { userId: string; role: string }, limit = 200): Promise<SweepResult> {
  const { ids } = await pendingStockMoves(c, limit);
  const out: SweepResult = { scanned: ids.length, posted: 0, skipped: 0, failed: [] };
  for (const id of ids) {
    await c.query("SAVEPOINT scentsx_move");
    try {
      const r = await postStockMove(c, id, actor);
      await c.query("RELEASE SAVEPOINT scentsx_move");
      if (r.posted) out.posted += 1; else out.skipped += 1;
      if (!r.posted && r.reason === "flag_off") break;
    } catch (e) {
      await c.query("ROLLBACK TO SAVEPOINT scentsx_move");
      out.failed.push({ id, error: (e as Error).message.slice(0, 300) });
    }
  }
  return out;
}
