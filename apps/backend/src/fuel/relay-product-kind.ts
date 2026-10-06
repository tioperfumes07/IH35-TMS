/**
 * ROUND 391.2 (owner order 432-CC2 item 4) — THE ONE classifier for a Relay fuel product line, and the one gallons
 * predicate. Every Relay reader (the settlement-row link engine, the bank-match fill poster, the reefer fuel credit
 * report) reads a line's product through this file, so reefer can never again be decided three different ways.
 *
 * WHY THIS FILE EXISTS. Relay itemises each fill (integrations.relay_fuel_transaction_lines): fuel_type, a product code
 * (033 = Reefer) and a description. Readers each hand-typed `l.fuel_type = 'reefer'` / a { diesel, def, reefer } map, so a
 * line Relay sent as `reefer_2` or with only the 033 code / a "Reefer" description was not reefer anywhere, and the CSV
 * import wrote volume_uom 'gallon' while every reader filtered 'gallons' — its gallons were invisible to all of them.
 *
 * Classification is FROM THE FEED (type, product code, description) — never inferred from an amount or a gallon count.
 * Guard: scripts/verify-relay-reefer-fuel-engine.mjs.
 */

export type RelayProductKind = "diesel" | "def" | "reefer" | "other";

/** Relay's own product code for reefer diesel. */
export const RELAY_REEFER_PRODUCT_CODE = "033";

/** SQL: the line's product kind ('diesel' | 'def' | 'reefer' | 'other'). `l` = an integrations.relay_fuel_transaction_lines alias. */
export function relayLineKindSql(l = "l"): string {
  return `(CASE
    WHEN ${l}.fuel_type ILIKE 'reefer%' OR btrim(COALESCE(${l}.fuel_product_code, '')) = '${RELAY_REEFER_PRODUCT_CODE}'
         OR COALESCE(${l}.fuel_type_description, '') ~* '(reefer|refriger)' THEN 'reefer'
    WHEN ${l}.fuel_type ILIKE 'def%' OR COALESCE(${l}.fuel_type_description, '') ~* '(exhaust fluid|\\mdef\\M)' THEN 'def'
    WHEN ${l}.fuel_type ILIKE 'diesel%' OR COALESCE(${l}.fuel_type_description, '') ~* '\\mdiesel\\M' THEN 'diesel'
    ELSE 'other' END)`;
}

/** SQL predicate: the line's volume is in gallons (Relay's API says 'gallons'; the CSV import once wrote 'gallon'). */
export function relayLineIsGallonsSql(l = "l"): string {
  return `lower(btrim(COALESCE(${l}.volume_uom, ''))) IN ('gallons', 'gallon', 'gal')`;
}

/** TS twin of relayLineKindSql, for code that already holds the line. */
export function relayLineKind(line: { fuel_type?: string | null; fuel_product_code?: string | null; fuel_type_description?: string | null }): RelayProductKind {
  const t = (line.fuel_type ?? "").toLowerCase();
  const code = (line.fuel_product_code ?? "").trim();
  const d = line.fuel_type_description ?? "";
  if (t.startsWith("reefer") || code === RELAY_REEFER_PRODUCT_CODE || /(reefer|refriger)/i.test(d)) return "reefer";
  if (t.startsWith("def") || /(exhaust fluid|\bdef\b)/i.test(d)) return "def";
  if (t.startsWith("diesel") || /\bdiesel\b/i.test(d)) return "diesel";
  return "other";
}

/** The fuel.fuel_transactions.fuel_type a Relay product kind is (CHECK: diesel / def / gas / reefer_diesel / other). */
export const FUEL_TYPE_FOR_RELAY_KIND: Record<RelayProductKind, "diesel" | "def" | "reefer_diesel" | "other"> = {
  diesel: "diesel",
  def: "def",
  reefer: "reefer_diesel",
  other: "other",
};

/** SQL: a fuel.fuel_transactions row's fuel_type as a Relay product kind. `f` = a fuel.fuel_transactions alias. */
export function fuelRowKindSql(f = "f"): string {
  return `(CASE ${f}.fuel_type WHEN 'reefer_diesel' THEN 'reefer' WHEN 'diesel' THEN 'diesel' WHEN 'def' THEN 'def' ELSE 'other' END)`;
}
