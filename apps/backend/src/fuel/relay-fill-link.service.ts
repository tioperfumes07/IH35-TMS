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
 */
type DbClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }> };

export type RelayLinkOutcome = { linked: string | null; candidates: number };

// fuel.fuel_transactions.fuel_type -> integrations.relay_fuel_transaction_lines.fuel_type
const PRODUCT_SQL = `CASE f.fuel_type WHEN 'reefer_diesel' THEN 'reefer' ELSE f.fuel_type::text END`;

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
    AND abs(f.gallons - COALESCE((SELECT sum(l.volume) FROM integrations.relay_fuel_transaction_lines l
                                   WHERE l.relay_fuel_transaction_id = r.id AND l.voided_at IS NULL
                                     AND l.volume_uom = 'gallons' AND l.fuel_type = ${PRODUCT_SQL}), -1000)) < 0.6
    AND NOT EXISTS (SELECT 1 FROM fuel.fuel_transactions o
                     WHERE o.relay_fuel_transaction_id = r.id AND o.voided_at IS NULL AND o.id <> f.id AND o.fuel_type = f.fuel_type)`;

/** A settlement-derived fuel row arrived: link it to its Relay fill if exactly one proves it. */
export async function linkSettlementFuelRowToRelayFill(client: DbClient, operatingCompanyId: string, fuelTransactionId: string): Promise<RelayLinkOutcome> {
  const c = await client.query<{ rid: string }>(
    `SELECT r.id::text AS rid ${PAIR_SQL} AND f.id = $2::uuid AND f.relay_fuel_transaction_id IS NULL`,
    [operatingCompanyId, fuelTransactionId]
  );
  if (c.rows.length !== 1) return { linked: null, candidates: c.rows.length };
  await client.query(
    `UPDATE fuel.fuel_transactions SET relay_fuel_transaction_id = $3::uuid
      WHERE id = $2::uuid AND operating_company_id = $1::uuid AND relay_fuel_transaction_id IS NULL`,
    [operatingCompanyId, fuelTransactionId, c.rows[0].rid]
  );
  return { linked: c.rows[0].rid, candidates: 1 };
}

/** A Relay fill arrived: link each product's settlement row to it where exactly one row proves it. */
export async function linkRelayFillToSettlementFuelRows(client: DbClient, operatingCompanyId: string, relayFuelTransactionId: string): Promise<RelayLinkOutcome[]> {
  const c = await client.query<{ fid: string; product: string }>(
    `SELECT f.id::text AS fid, f.fuel_type::text AS product ${PAIR_SQL} AND r.id = $2::uuid AND f.relay_fuel_transaction_id IS NULL`,
    [operatingCompanyId, relayFuelTransactionId]
  );
  const byProduct = new Map<string, string[]>();
  for (const row of c.rows) byProduct.set(row.product, [...(byProduct.get(row.product) ?? []), row.fid]);
  const out: RelayLinkOutcome[] = [];
  for (const [, ids] of byProduct) {
    if (ids.length !== 1) { out.push({ linked: null, candidates: ids.length }); continue; }
    await client.query(
      `UPDATE fuel.fuel_transactions SET relay_fuel_transaction_id = $3::uuid
        WHERE id = $2::uuid AND operating_company_id = $1::uuid AND relay_fuel_transaction_id IS NULL`,
      [operatingCompanyId, ids[0], relayFuelTransactionId]
    );
    out.push({ linked: ids[0], candidates: 1 });
  }
  return out;
}
