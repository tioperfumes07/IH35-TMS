// CONN-2 — Faro Reserve Tracker (read-only reporting layer).
//
// Reads accounting.factoring_reserve_movements for the Advance Packet listing only (443.168 L: no reserve balance here; migration
// 202607130000, HELD — see db/migrations/.held-migrations.json). The WRITE path (recording a movement)
// lives in poster.service.ts as a side effect of the SAME funding/release JE that already posts
// (postFactoringAdvanceEvent / postFactoringReleaseEvent) — nothing here writes GL or posts a JE.
//
// This module also assembles the "Advance Packet": every load-bearing fact about one factoring advance in
// a single read (header, linked invoices => loads, reserve movements, interest accruals) — for a future
// reviewable export/UI, and to satisfy Law of the Land §10a (forward+reverse drill-through: an advance
// must connect to its invoices, its loads (via invoices.source_load_id), its reserve ledger, and its
// interest ledger, not live as an island). Read-only; not gated by FACTORING_GL_POSTING_ENABLED (viewing a
// report is not money-moving) — the underlying rows simply won't exist yet while the flag is OFF and no
// advance has been funded through the poster.

import { withLuciaBypass } from "../../auth/db.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

// LEAD 443.168 L (Engine Registry E-46) — listFactoringReserveBalances / getFactoringReserveRollup (per-advance reserve off
// the legacy reserve-balances view over the movements ledger, no live writer) are DELETED: they were a second
// reserve figure that disagreed with the GL. The one reserve figure is factoringBookReserveCents (factoring-kpi.service).

export type FactoringAdvancePacket = {
  advance: Record<string, unknown>;
  invoices: Array<Record<string, unknown>>;
  reserve_movements: Array<Record<string, unknown>>;
  interest_accruals: Array<Record<string, unknown>>;
};

// The Advance Packet — the advance header, its linked invoices (=> loads via source_load_id), every
// reserve movement, and every interest accrual, in one read. Forward+reverse drill-through source for a
// future "Faro Advance Packet" export/UI.
export async function getFactoringAdvancePacket(
  operatingCompanyId: string,
  factoringAdvanceId: string
): Promise<FactoringAdvancePacket | null> {
  return withLuciaBypass(async (client: DbClient) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);

    const advanceRes = await client.query(
      `SELECT * FROM accounting.factoring_advances WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
      [factoringAdvanceId, operatingCompanyId]
    );
    const advance = advanceRes.rows[0];
    if (!advance) return null;

    const invoicesRes = await client.query(
      `
        SELECT id, display_id, source_load_id, customer_id, total_cents, amount_paid_cents, status,
               factoring_status, issue_date, due_date
        FROM accounting.invoices
        WHERE factoring_advance_id = $1::uuid AND operating_company_id = $2::uuid
        ORDER BY issue_date ASC, created_at ASC
      `,
      [factoringAdvanceId, operatingCompanyId]
    );

    const movementsRes = await client.query(
      `
        SELECT
          rm.id,
          rm.movement_type,
          rm.amount_cents,
          rm.movement_date,
          rm.journal_entry_id,
          je.entry_date::text AS journal_entry_date,
          je.memo AS journal_entry_memo,
          rm.notes,
          rm.created_at
        FROM accounting.factoring_reserve_movements rm
        LEFT JOIN accounting.journal_entries je
          ON je.id = rm.journal_entry_id
         AND je.operating_company_id = rm.operating_company_id
        WHERE rm.factoring_advance_id = $1::uuid
          AND rm.operating_company_id = $2::uuid
          AND rm.is_active
        ORDER BY rm.movement_date ASC, rm.created_at ASC
      `,
      [factoringAdvanceId, operatingCompanyId]
    );

    const interestRes = await client.query(
      `
        SELECT
          a.id,
          a.accrual_date,
          a.day_index,
          a.daily_rate,
          a.opening_balance_cents,
          a.interest_cents,
          a.closing_balance_cents,
          a.journal_entry_id,
          je.entry_date::text AS journal_entry_date,
          je.memo AS journal_entry_memo
        FROM accounting.factoring_default_interest_accruals a
        LEFT JOIN accounting.journal_entries je
          ON je.id = a.journal_entry_id
         AND je.operating_company_id = a.operating_company_id
        WHERE a.factoring_advance_id = $1::uuid
          AND a.operating_company_id = $2::uuid
          AND a.is_active
        ORDER BY a.accrual_date ASC
      `,
      [factoringAdvanceId, operatingCompanyId]
    );

    return {
      advance,
      invoices: invoicesRes.rows,
      reserve_movements: movementsRes.rows,
      interest_accruals: interestRes.rows,
    };
  });
}
