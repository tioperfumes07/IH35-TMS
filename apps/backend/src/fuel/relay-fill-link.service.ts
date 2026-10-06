/**
 * ACCT-F403 (Lead ruling Option 1, 2026-10-04) — the AlwaysTrack settlement fuel line LINKS to the Relay fill it describes;
 * the fill carries the cost (posted at Relay's charge when its wallet line is matched in Banking) and the settlement line posts
 * nothing. The link is fuel.fuel_transactions.relay_fuel_transaction_id (migration 202615410950). Without this engine nothing
 * ever set it: every Relay-rail settlement row would sit "link pending" forever.
 *
 * ONE rule, used from both sides (whichever arrives second makes the link):
 *   same company · both live · same truck (the fill's matched unit, or its printed unit number when exactly one active unit
 *   carries it) · fill day within ±1 day of the settlement row's date · same product (diesel / DEF / reefer) · gallons within
 *   0.6 of the fill's lines for that product.
 * Exactly ONE candidate links; zero or several link nothing (reported, never guessed). A fill holds at most one settlement row
 * per product. Measured on USMCA 2026-10-04: this rule pairs 44 of 69 wallet fills one-to-one with the settlement rows.
 *
 * ROUND 391.2 (owner order 432-CC2 item 4) — THE FEED DECIDES THE PRODUCT. A settlement statement that names no product
 * arrives as 'diesel' (seed fuelTypeFromProductCode). When that row's gallons match NO diesel line of the fill but match the
 * fill's REEFER line (same truck, +/-1 day, within 0.6 gal, one-to-one), the fill proves it was reefer: the link relabels
 * the row 'reefer_diesel' (out of IFTA taxable gallons, into the Form 4136 reefer credit) and stamps the Reefer trailer it
 * went into (resolveReeferTrailerForFuelRow — the load's trailer at fill time, else the trailer number keyed at the pump).
 * This is the rule migration 202615400700 applied once to 4 rows, now in the engine so every future fill gets it. Product
 * kinds come from relay-product-kind.ts, the one classifier (type, product code 033, description).
 */
import { fuelRowKindSql, relayLineIsGallonsSql, relayLineKindSql } from "./relay-product-kind.js";
import { resolveReeferTrailerForFuelRow } from "./reefer-fuel.service.js";

type DbClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }> };

export type RelayLinkOutcome = { linked: string | null; candidates: number };

// Gallons the fill carries for one product kind.
const fillGallonsSql = (kindExpr: string) => `COALESCE((SELECT sum(l.volume) FROM integrations.relay_fuel_transaction_lines l
    WHERE l.relay_fuel_transaction_id = r.id AND l.voided_at IS NULL
      AND ${relayLineIsGallonsSql("l")} AND ${relayLineKindSql("l")} = ${kindExpr}), -1000)`;

// The product the FILL proves for this settlement row: its own kind when the gallons tie, else — for a 'diesel' row
// (a statement line with no product) — reefer, when only the fill's reefer line ties. NULL = no pair.
const MATCHED_KIND_SQL = `(CASE
    WHEN abs(f.gallons - ${fillGallonsSql(fuelRowKindSql("f"))}) < 0.6 THEN ${fuelRowKindSql("f")}
    WHEN f.fuel_type = 'diesel' AND abs(f.gallons - ${fillGallonsSql("'diesel'")}) >= 0.6
         AND abs(f.gallons - ${fillGallonsSql("'reefer'")}) < 0.6 THEN 'reefer'
  END)`;

const PAIR_SQL = `
  FROM fuel.fuel_transactions f
  JOIN integrations.relay_fuel_transactions r
    ON r.operating_company_id = f.operating_company_id AND r.voided_at IS NULL
  WHERE f.operating_company_id = $1::uuid
    AND f.voided_at IS NULL
    AND f.unit_id IS NOT NULL
    AND f.unit_id = COALESCE(r.matched_unit_id,
          (SELECT min(u.id::text)::uuid FROM mdata.units u
            WHERE u.deactivated_at IS NULL AND btrim(u.unit_number) = btrim(r.matched_unit_number)
           HAVING count(*) = 1))
    AND abs(COALESCE(r.relay_created_at, r.created_at)::date - f.transaction_at::date) <= 1
    AND f.gallons IS NOT NULL
    AND ${MATCHED_KIND_SQL} IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM fuel.fuel_transactions o
                     WHERE o.relay_fuel_transaction_id = r.id AND o.voided_at IS NULL AND o.id <> f.id
                       AND ${fuelRowKindSql("o")} = ${MATCHED_KIND_SQL})`;

/**
 * Write the link. The fill's product wins: a row the fill proves reefer becomes 'reefer_diesel' (a category, no money
 * moves — the settlement row posts nothing on the Relay rail), and a reefer row gets its Reefer trailer when it has none.
 */
async function writeLink(client: DbClient, operatingCompanyId: string, fuelTransactionId: string, relayId: string, kind: string): Promise<void> {
  await client.query(
    `UPDATE fuel.fuel_transactions
        SET relay_fuel_transaction_id = $3::uuid,
            fuel_type = CASE WHEN $4::text = 'reefer' THEN 'reefer_diesel' ELSE fuel_type END
      WHERE id = $2::uuid AND operating_company_id = $1::uuid AND relay_fuel_transaction_id IS NULL`,
    [operatingCompanyId, fuelTransactionId, relayId, kind]
  );
  if (kind !== "reefer") return;
  const trailerId = await resolveReeferTrailerForFuelRow(client, operatingCompanyId, fuelTransactionId);
  if (!trailerId) return;
  await client.query(
    `UPDATE fuel.fuel_transactions SET trailer_id = $3::uuid
      WHERE id = $2::uuid AND operating_company_id = $1::uuid AND trailer_id IS NULL`,
    [operatingCompanyId, fuelTransactionId, trailerId]
  );
}

/** A settlement-derived fuel row arrived: link it to its Relay fill if exactly one proves it. */
export async function linkSettlementFuelRowToRelayFill(client: DbClient, operatingCompanyId: string, fuelTransactionId: string): Promise<RelayLinkOutcome> {
  const c = await client.query<{ rid: string; kind: string }>(
    `SELECT r.id::text AS rid, ${MATCHED_KIND_SQL} AS kind ${PAIR_SQL} AND f.id = $2::uuid AND f.relay_fuel_transaction_id IS NULL`,
    [operatingCompanyId, fuelTransactionId]
  );
  if (c.rows.length !== 1) return { linked: null, candidates: c.rows.length };
  await writeLink(client, operatingCompanyId, fuelTransactionId, c.rows[0].rid, c.rows[0].kind);
  return { linked: c.rows[0].rid, candidates: 1 };
}

/** A Relay fill arrived: link each product's settlement row to it where exactly one row proves it. */
export async function linkRelayFillToSettlementFuelRows(client: DbClient, operatingCompanyId: string, relayFuelTransactionId: string): Promise<RelayLinkOutcome[]> {
  const c = await client.query<{ fid: string; product: string }>(
    `SELECT f.id::text AS fid, ${MATCHED_KIND_SQL} AS product ${PAIR_SQL} AND r.id = $2::uuid AND f.relay_fuel_transaction_id IS NULL`,
    [operatingCompanyId, relayFuelTransactionId]
  );
  const byProduct = new Map<string, string[]>();
  for (const row of c.rows) byProduct.set(row.product, [...(byProduct.get(row.product) ?? []), row.fid]);
  const out: RelayLinkOutcome[] = [];
  for (const [product, ids] of byProduct) {
    if (ids.length !== 1) { out.push({ linked: null, candidates: ids.length }); continue; }
    await writeLink(client, operatingCompanyId, ids[0], relayFuelTransactionId, product);
    out.push({ linked: ids[0], candidates: 1 });
  }
  return out;
}
