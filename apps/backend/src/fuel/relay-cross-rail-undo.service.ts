/**
 * LEAD 443.133 A — undo a Relay link written onto a fuel row PAID ON ANOTHER RAIL.
 *
 * Before 443.133 the Relay fill linker paired on truck / day / product / gallons only, so the 2026-10-12 18:36 Relay backfill
 * linked DREAMLINE-paid settlement rows (posted Dr fuel / Cr 2510 at the statement's price) to Relay fills. The link also
 * relabelled a 'diesel' row 'reefer_diesel' and stamped a reefer trailer. relay-fill-link.service.ts now links only rows
 * paid by the Relay card; this engine reverses the wrong links already written.
 *
 * What it restores, per row: exactly the columns the link UPDATE(s) changed (relay_fuel_transaction_id, fuel_type,
 * trailer_id), read from audit.row_changes, and only where the current value is still what the link wrote. No money column
 * moves: the row's expense and its 2510 posting are untouched. The Relay fill stays unposted and is then REFUSED by the
 * poster (relay_fill_matches_other_rail_fill) until the owner decides which rail paid — never booked twice.
 */
import { appendCrudAudit } from "../audit/crud-audit.js";
import { RELAY_CARD_ROW_SQL } from "./relay-fill-link.service.js";

type DbClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }> };

const RESTORABLE = ["relay_fuel_transaction_id", "fuel_type", "trailer_id"] as const;

export type CrossRailUndoRow = {
  fuel_transaction_id: string;
  card: string | null;
  relay_fuel_transaction_id: string;
  restore: Partial<Record<(typeof RESTORABLE)[number], string | null>>;
  outcome: "planned" | "undone" | "skipped";
  reason?: string;
};

export type CrossRailUndoResult = { dry_run: boolean; operating_company_id: string; considered: number; undone: number; skipped: number; rows: CrossRailUndoRow[] };

/** Pure: which columns to restore, given the link change(s) and the row now. */
export function planCrossRailRestore(
  current: Record<string, string | null>,
  linkChanges: { old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null }[],
): CrossRailUndoRow["restore"] {
  const restore: CrossRailUndoRow["restore"] = {};
  for (const ch of linkChanges) {
    for (const col of RESTORABLE) {
      const before = ch.old_data?.[col] ?? null;
      const after = ch.new_data?.[col] ?? null;
      if (String(before) === String(after)) continue;
      if (String(current[col] ?? null) !== String(after)) continue; // changed again since — not ours to restore
      restore[col] = before === null ? null : String(before);
    }
  }
  // The link itself always goes, even when its history row is missing.
  if (!("relay_fuel_transaction_id" in restore)) restore.relay_fuel_transaction_id = null;
  return restore;
}

export async function undoCrossRailRelayLinks(
  client: DbClient,
  input: { operatingCompanyId: string; actorUserId: string; dryRun: boolean },
): Promise<CrossRailUndoResult> {
  const co = input.operatingCompanyId;
  const rows = (await client.query<{ id: string; card: string | null; relay_fuel_transaction_id: string; fuel_type: string | null; trailer_id: string | null }>(
    `SELECT f.id::text, (SELECT ct.code FROM catalogs.fuel_card_types ct WHERE ct.id = f.fuel_card_id) AS card,
            f.relay_fuel_transaction_id::text, f.fuel_type::text, f.trailer_id::text
       FROM fuel.fuel_transactions f
      WHERE f.operating_company_id = $1::uuid AND f.voided_at IS NULL AND f.archived_at IS NULL
        AND f.relay_fuel_transaction_id IS NOT NULL AND NOT ${RELAY_CARD_ROW_SQL}
      ORDER BY f.id`,
    [co],
  )).rows;
  const out: CrossRailUndoRow[] = [];
  for (const r of rows) {
    // The link UPDATE and the reefer-trailer UPDATE land in the same statement batch (same changed_at).
    const linkAt = (await client.query<{ changed_at: string }>(
      `SELECT changed_at::text FROM audit.row_changes
        WHERE schema_name = 'fuel' AND table_name = 'fuel_transactions' AND op = 'UPDATE' AND row_pk::text LIKE '%' || $1 || '%'
          AND old_data->>'relay_fuel_transaction_id' IS NULL AND new_data->>'relay_fuel_transaction_id' = $2
        ORDER BY changed_at DESC LIMIT 1`,
      [r.id, r.relay_fuel_transaction_id],
    )).rows[0]?.changed_at ?? null;
    const changes = linkAt
      ? (await client.query<{ old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null }>(
          `SELECT old_data, new_data FROM audit.row_changes
            WHERE schema_name = 'fuel' AND table_name = 'fuel_transactions' AND op = 'UPDATE' AND row_pk::text LIKE '%' || $1 || '%'
              AND changed_at = $2::timestamptz
            ORDER BY id`,
          [r.id, linkAt],
        )).rows
      : [];
    const restore = planCrossRailRestore(
      { relay_fuel_transaction_id: r.relay_fuel_transaction_id, fuel_type: r.fuel_type, trailer_id: r.trailer_id },
      changes,
    );
    const base = { fuel_transaction_id: r.id, card: r.card, relay_fuel_transaction_id: r.relay_fuel_transaction_id, restore };
    if (input.dryRun) {
      out.push({ ...base, outcome: "planned", reason: linkAt ? undefined : "no link history — only the link is removed" });
      continue;
    }
    const sets: string[] = [];
    const vals: unknown[] = [r.id, co, r.relay_fuel_transaction_id];
    for (const [col, v] of Object.entries(restore)) {
      vals.push(v);
      sets.push(`${col} = $${vals.length}${col === "fuel_type" ? "" : "::uuid"}`);
    }
    const upd = await client.query(
      `UPDATE fuel.fuel_transactions SET ${sets.join(", ")}, updated_at = now()
        WHERE id = $1::uuid AND operating_company_id = $2::uuid AND relay_fuel_transaction_id = $3::uuid`,
      vals,
    );
    if (!upd.rowCount) {
      out.push({ ...base, outcome: "skipped", reason: "row changed while undoing — nothing written" });
      continue;
    }
    await appendCrudAudit(client as never, input.actorUserId, "fuel.relay_cross_rail_link_undone", {
      operating_company_id: co,
      fuel_transaction_id: r.id,
      card: r.card,
      relay_fuel_transaction_id: r.relay_fuel_transaction_id,
      before: { relay_fuel_transaction_id: r.relay_fuel_transaction_id, fuel_type: r.fuel_type, trailer_id: r.trailer_id },
      restored: restore,
    }, "info", "LEAD-443.133");
    out.push({ ...base, outcome: "undone" });
  }
  return {
    dry_run: input.dryRun,
    operating_company_id: co,
    considered: rows.length,
    undone: out.filter((x) => x.outcome === "undone").length,
    skipped: out.filter((x) => x.outcome === "skipped").length,
    rows: out,
  };
}
