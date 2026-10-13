/**
 * Backfill load_id on canonical fuel.fuel_transactions when ingest left them NULL
 * but driver_id and/or unit_id are present (G18 load window resolution via resolveLoadId).
 *
 * Fills NULL only — never overwrites an existing load link. No fake FKs.
 */
import { resolveLoadId } from "../../fuel/fuel-transaction-import.js";
import type { DbClient } from "./db-client.type.js";

export type RelayFuelLoadRematchResult = {
  scanned: number;
  matched: number;
  updated: number;
  skipped_no_driver_or_unit: number;
  skipped_no_load_in_window: number;
};

type UnmatchedFuelRow = {
  id: string;
  operating_company_id: string;
  driver_id: string | null;
  unit_id: string | null;
  transaction_at: string;
};

export async function rematchRelayFuelLoads(
  client: DbClient,
  opts?: { operating_company_id?: string; limit?: number },
): Promise<RelayFuelLoadRematchResult> {
  const limit = Math.min(Math.max(opts?.limit ?? 5000, 1), 20000);
  const params: unknown[] = [];
  let opcoClause = "";
  if (opts?.operating_company_id) {
    params.push(opts.operating_company_id);
    opcoClause = `AND operating_company_id = $${params.length}::uuid`;
  }
  params.push(limit);

  const res = await client.query<UnmatchedFuelRow>(
    `
      SELECT
        id::text AS id,
        operating_company_id::text AS operating_company_id,
        driver_id::text AS driver_id,
        unit_id::text AS unit_id,
        transaction_at::text AS transaction_at
      FROM fuel.fuel_transactions
      WHERE load_id IS NULL
        AND archived_at IS NULL
        ${opcoClause}
      ORDER BY transaction_at DESC NULLS LAST, created_at DESC
      LIMIT $${params.length}
    `,
    params,
  );

  let matched = 0;
  let updated = 0;
  let skippedNoDriverOrUnit = 0;
  let skippedNoLoadInWindow = 0;

  for (const row of res.rows) {
    if (!row.driver_id && !row.unit_id) {
      skippedNoDriverOrUnit += 1;
      continue;
    }

    const loadId = await resolveLoadId(
      client,
      row.operating_company_id,
      row.unit_id,
      row.driver_id,
      row.transaction_at,
    );
    if (!loadId) {
      skippedNoLoadInWindow += 1;
      continue;
    }
    matched += 1;

    // LEAD 443.121 #2 — a fill that already POSTED (on receipt, with the deadhead/yard reason) moves to its load through
    // the ONE attach (fuel row + the SAME postings + the SAME document + link + settlement ref), never the fuel row alone.
    const postedFill = await client.query<{ fill_id: string; kind: "fuel_transaction" | "relay_fuel" }>(
      `SELECT CASE WHEN EXISTS (SELECT 1 FROM accounting.journal_entry_postings p
                                 WHERE p.source_transaction_type = 'fuel_event' AND p.source_transaction_id::text = ft.id::text)
                   THEN ft.id::text ELSE ft.relay_fuel_transaction_id::text END AS fill_id,
              CASE WHEN EXISTS (SELECT 1 FROM accounting.journal_entry_postings p
                                 WHERE p.source_transaction_type = 'fuel_event' AND p.source_transaction_id::text = ft.id::text)
                   THEN 'fuel_transaction' ELSE 'relay_fuel' END AS kind
         FROM fuel.fuel_transactions ft
        WHERE ft.id = $1::uuid
          AND EXISTS (SELECT 1 FROM accounting.journal_entry_postings p
                       WHERE p.source_transaction_type = 'fuel_event'
                         AND p.source_transaction_id::text IN (ft.id::text, ft.relay_fuel_transaction_id::text)
                         AND p.load_id IS NULL)`,
      [row.id],
    );
    if (postedFill.rows[0]) {
      const { attachFuelReceiptToLoad } = await import("../../fuel/fuel-receipt-repoint.service.js");
      const l = await client.query<{ load_number: string | null }>(`SELECT load_number::text FROM mdata.loads WHERE id = $1::uuid AND operating_company_id = $2::uuid`, [loadId, row.operating_company_id]);
      await attachFuelReceiptToLoad(client as never, {
        operatingCompanyId: row.operating_company_id,
        actorUserId: process.env.SYSTEM_ACTOR_USER_ID ?? "00000000-0000-4000-8000-000000000001",
        receipt: { fill_kind: postedFill.rows[0].kind, fill_id: postedFill.rows[0].fill_id, at: row.transaction_at, unit_id: row.unit_id, driver_id: row.driver_id },
        loadId,
        loadNumber: l.rows[0]?.load_number ?? null,
        trailerId: null,
      });
      updated += 1;
      continue;
    }

    const up = await client.query(
      `
        UPDATE fuel.fuel_transactions
        SET load_id = $1::uuid,
            load_exemption_reason = NULL,
            updated_at = now()
        WHERE id = $2::uuid
          AND load_id IS NULL
      `,
      [loadId, row.id],
    );
    updated += up.rowCount ?? 0;
  }

  return {
    scanned: res.rows.length,
    matched,
    updated,
    skipped_no_driver_or_unit: skippedNoDriverOrUnit,
    skipped_no_load_in_window: skippedNoLoadInWindow,
  };
}
