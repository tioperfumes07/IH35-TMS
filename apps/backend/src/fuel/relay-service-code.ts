/**
 * ACCT-F11127 (Lead ruling 2026-11-09, QuickBooks-style) — a Relay code that buys a SERVICE (a lumper, a CAT scale ticket)
 * is an expense on its load paid from the Relay wallet (1295), posted by the one Relay fill poster on the service's own
 * item (fuel-item-account.ts NON_FUEL_COST_ITEM_NAME). It is never a fuel record and never IFTA gallons.
 *
 * Measured 11-10 (USMCA): 7 such codes had never posted — txn_9uASdgwadAXAzL lumper $260.00 + $5.00 fee and 6 CAT Scales
 * codes ($15.25 ×5, $5.25 ×1, each + $1.50 fee). The poster refused them "no fuel product line (e.g. a scale ticket)".
 *
 * Two shapes, one rule: a CSV-imported code carries products [{ name: "Lumper" | "Cat Scales" }] and one 'other' line; an
 * API-pulled code carries products [{ product_type: "scales", purchase_price_total: "15.25", … }] and no line.
 */
export type RelayServiceKind = "lumper" | "scales";

type Product = { name?: unknown; product_type?: unknown; product_type_description?: unknown; purchase_price_total?: unknown };

const FUEL_WORD = /diesel|\bdef\b|reefer|gasoline|\bfuel\b/i;

function productText(p: Product): string {
  return [p.name, p.product_type, p.product_type_description].filter((v) => typeof v === "string").join(" ");
}

/** The service a Relay code bought, or null when it bought fuel (or anything this rule does not name). */
export function relayServiceKindOf(fill: { fuel_code_type: string | null; products: unknown }): RelayServiceKind | null {
  const products = Array.isArray(fill.products) ? (fill.products as Product[]) : [];
  const texts = products.map(productText).filter(Boolean);
  if (texts.some((t) => FUEL_WORD.test(t))) return null;
  if (texts.length && texts.every((t) => /lumper/i.test(t))) return "lumper";
  if (texts.length && texts.every((t) => /scale/i.test(t))) return "scales";
  if (!texts.length && /lumper/i.test(String(fill.fuel_code_type ?? ""))) return "lumper";
  return null;
}

/** Relay's own price of an API-shaped service code (sum of purchase_price_total), in cents; null when absent. */
export function relayServiceProductCents(products: unknown): number | null {
  const list = Array.isArray(products) ? (products as Product[]) : [];
  let total = 0;
  let any = false;
  for (const p of list) {
    const v = Number(p.purchase_price_total);
    if (Number.isFinite(v) && v > 0) { total += Math.round(v * 100); any = true; }
  }
  return any ? total : null;
}

/**
 * SQL twin of relayServiceKindOf (alias = the integrations.relay_fuel_transactions row): TRUE for a service code. Used to
 * keep service codes out of the fuel-record writers (no fuel.fuel_transactions row for a lumper / scale ticket).
 */
export function relayServiceCodeSql(alias: string): string {
  return `(${alias}.products::text !~* '(diesel|"def|def"|reefer|gasoline)'
           AND (${alias}.products::text ~* '"(name|product_type|product_type_description)": "[^"]*(lumper|scale)'
                OR (${alias}.fuel_code_type ~* 'lumper' AND coalesce(jsonb_array_length(${alias}.products), 0) = 0)))`;
}

type Queryable = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

/**
 * ACCT-F11127 — wired into the Relay ingest (relay-fuel-ingest.cron.ts): every active Relay SERVICE code of the company
 * with no posted fuel_event batch becomes a receipt-post candidate, flushed through the same one fill poster
 * (flushFuelGlPostsAfterCommit -> postFuelFillOnReceipt -> postRelayFuelFill). A code received before this rule existed
 * (measured 11-10: 7 USMCA codes) posts on the next tick; a new code posts on its own receipt and is found posted here.
 * Idempotent: the poster's key (fuel_event / fill id) returns the existing entry.
 */
export async function listUnpostedRelayServiceCodeCandidates(
  client: Queryable,
  operatingCompanyId: string,
): Promise<Array<{
  operating_company_id: string;
  fuel_transaction_id: string;
  relay_fuel_transaction_id: string;
  fuel_type: string;
  transaction_at: string;
  amount_cents: number;
  driver_id: string | null;
  location_state: string | null;
  cash_advance: boolean;
}>> {
  const res = await client.query<{ id: string; transaction_at: string; amount_cents: string; driver_id: string | null }>(
    `SELECT r.id::text, COALESCE(r.relay_created_at, r.created_at)::text AS transaction_at,
            ABS(COALESCE(r.total_amount_paid_cents, 0))::bigint::text AS amount_cents, r.matched_driver_id::text AS driver_id
       FROM integrations.relay_fuel_transactions r
      WHERE r.operating_company_id = $1::uuid AND r.voided_at IS NULL AND r.is_active
        AND ${relayServiceCodeSql("r")}
        AND NOT EXISTS (SELECT 1 FROM accounting.posting_batches pb
                         WHERE pb.operating_company_id = r.operating_company_id AND pb.source_transaction_type = 'fuel_event'
                           AND pb.source_transaction_id = r.id::text AND pb.batch_status = 'posted')
      ORDER BY 2, 1`,
    [operatingCompanyId],
  );
  return res.rows
    .filter((r) => Number(r.amount_cents) > 0)
    .map((r) => ({
      operating_company_id: operatingCompanyId,
      fuel_transaction_id: r.id,
      relay_fuel_transaction_id: r.id,
      fuel_type: "other",
      transaction_at: r.transaction_at,
      amount_cents: Number(r.amount_cents),
      driver_id: r.driver_id,
      location_state: null,
      cash_advance: false,
    }));
}
