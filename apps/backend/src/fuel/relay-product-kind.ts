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
 * Classification is FROM THE FEED (type, product code, description) — never inferred from an amount.
 * Guard: scripts/verify-relay-reefer-fuel-engine.mjs.
 *
 * ACCT-F11107 (Lead ruling 2026-11-10, owner "use logic") — ONE physical bound on the feed. Old rule -> new rule -> why:
 *   OLD: a line Relay coded reefer (033 / "Reefer") was reefer at any volume.
 *   NEW: a reefer-coded line of MORE than RELAY_REEFER_MAX_GALLONS (60) is TRUCK DIESEL — no reefer tank takes it — and is
 *        flagged for review (relayLineReeferOverTankSql / relayLineReeferOverTank). At or under 60 gal the feed still decides.
 *   WHY: prod 2026-11-10 — 8 of 10 Relay fills posted for DREAMLINE-ticket duplicates carried 033 "Reefer" lines of 21–174 gal
 *        (58.732 … 173.839) whose physical Dreamline pump receipts say diesel; $4,387.94 went to 5015 (off-highway, out of IFTA)
 *        and would have inflated the federal reefer credit. Never inflate reefer.
 */

/** ACCT-F11107: above this many gallons a reefer-coded Relay line is truck diesel (a reefer tank cannot take it). */
export const RELAY_REEFER_MAX_GALLONS = 60;

export type RelayProductKind = "diesel" | "def" | "reefer" | "other";

/** Relay's own product code for reefer diesel. */
export const RELAY_REEFER_PRODUCT_CODE = "033";

/** SQL: the line's product kind ('diesel' | 'def' | 'reefer' | 'other'). `l` = an integrations.relay_fuel_transaction_lines alias. */
function reeferSignalSql(l: string): string {
  return `(${l}.fuel_type ILIKE 'reefer%' OR btrim(COALESCE(${l}.fuel_product_code, '')) = '${RELAY_REEFER_PRODUCT_CODE}'
         OR COALESCE(${l}.fuel_type_description, '') ~* '(reefer|refriger)')`;
}

/** SQL predicate (review flag): a reefer-coded line over RELAY_REEFER_MAX_GALLONS — classified truck diesel, listed for review. */
export function relayLineReeferOverTankSql(l = "l"): string {
  return `(${reeferSignalSql(l)} AND COALESCE(${l}.volume, 0) > ${RELAY_REEFER_MAX_GALLONS})`;
}

export function relayLineKindSql(l = "l"): string {
  return `(CASE
    WHEN ${relayLineReeferOverTankSql(l)} THEN 'diesel'
    WHEN ${reeferSignalSql(l)} THEN 'reefer'
    WHEN ${l}.fuel_type ILIKE 'def%' OR COALESCE(${l}.fuel_type_description, '') ~* '(exhaust fluid|\\mdef\\M)' THEN 'def'
    WHEN ${l}.fuel_type ILIKE 'diesel%' OR COALESCE(${l}.fuel_type_description, '') ~* '\\mdiesel\\M' THEN 'diesel'
    ELSE 'other' END)`;
}

/** SQL predicate: the line's volume is in gallons (Relay's API says 'gallons'; the CSV import once wrote 'gallon'). */
export function relayLineIsGallonsSql(l = "l"): string {
  return `lower(btrim(COALESCE(${l}.volume_uom, ''))) IN ('gallons', 'gallon', 'gal')`;
}

/** TS twin of relayLineKindSql, for code that already holds the line. */
type RelayLineFacts = { fuel_type?: string | null; fuel_product_code?: string | null; fuel_type_description?: string | null; volume?: number | string | null };

function reeferSignal(line: RelayLineFacts): boolean {
  const t = (line.fuel_type ?? "").toLowerCase();
  const code = (line.fuel_product_code ?? "").trim();
  return t.startsWith("reefer") || code === RELAY_REEFER_PRODUCT_CODE || /(reefer|refriger)/i.test(line.fuel_type_description ?? "");
}

/** TS twin of relayLineReeferOverTankSql (review flag). */
export function relayLineReeferOverTank(line: RelayLineFacts): boolean {
  return reeferSignal(line) && Number(line.volume ?? 0) > RELAY_REEFER_MAX_GALLONS;
}

export function relayLineKind(line: RelayLineFacts): RelayProductKind {
  const t = (line.fuel_type ?? "").toLowerCase();
  const d = line.fuel_type_description ?? "";
  if (relayLineReeferOverTank(line)) return "diesel";
  if (reeferSignal(line)) return "reefer";
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
