/**
 * ACCT-F11105 — ONE PURCHASE, ONE RECORD across fuel rails, even when the settlement put the receipt on another truck.
 *
 * Old rule -> new rule -> why:
 *   OLD: ENG-65 (ensureRelayFillFuelRecords, #28457) decided a Relay fill "has no record" by ONE test: no live fuel row carries
 *        its relay_fuel_transaction_id. The 443.133 cross-rail check (crossRailFuelRowsForRelayFill) pairs on the SAME truck
 *        only. A Relay purchase whose pump receipt the settlement printed as a DREAMLINE line on ANOTHER truck (driver keyed
 *        T175 at the pump, the settlement carried the receipt on T174) passed both tests.
 *   NEW: a Relay fill is already recorded on another rail when a live, non-Relay fuel row of the company carries the SAME
 *        metered volume as one of the fill's product lines (to the thousandth), within one day of Relay's moment, AND the
 *        whole ticket that row belongs to (its live non-Relay rows of one reference) totals EXACTLY Relay's retail price for
 *        the fill. Identical metered gallons plus the identical pump total is one purchase — never fuzzy, any truck.
 *        ENG-65 refuses to write such a fill's record (relay_fill_recorded_on_other_rail, named, audited); which rail paid is
 *        the owner's decision (LEAD 443.133).
 *   WHY: the 2026-11-04 12:00Z ENG-65 sweep wrote 18 second records of 13 Relay purchases already on DREAMLINE settlement
 *        rows (verify-fuel-transactions-per-load: 16 "unsourced" of 29).
 * Guards: scripts/verify-relay-fill-not-recorded-twice.mjs, scripts/verify-fuel-transactions-per-load.mjs.
 */
/**
 * The other-rail rows that record Relay fill `r` (alias of integrations.relay_fuel_transactions). $1 = operating company.
 * Exported as SQL so the guard measures with the same text the engine refuses with.
 */
export const OTHER_RAIL_TICKET_ROWS_SQL = (r: string) => `
  SELECT DISTINCT t.id, t.transaction_reference, t.fuel_type, t.total_cost, t.fuel_card_id
    FROM integrations.relay_fuel_transaction_lines l
    JOIN fuel.fuel_transactions o
      ON o.operating_company_id = ${r}.operating_company_id
     AND o.voided_at IS NULL AND o.archived_at IS NULL
     AND o.relay_fuel_transaction_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM catalogs.fuel_card_types ct WHERE ct.id = o.fuel_card_id AND upper(ct.code) = 'RELAY')
     AND o.gallons IS NOT NULL AND o.gallons = l.volume
     AND abs(o.transaction_at::date - COALESCE(${r}.relay_created_at, ${r}.created_at)::date) <= 1
     AND o.transaction_reference IS NOT NULL
    JOIN fuel.fuel_transactions t
      ON t.operating_company_id = o.operating_company_id AND t.transaction_reference = o.transaction_reference
     AND t.voided_at IS NULL AND t.archived_at IS NULL AND t.relay_fuel_transaction_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM catalogs.fuel_card_types ct WHERE ct.id = t.fuel_card_id AND upper(ct.code) = 'RELAY')
   WHERE l.relay_fuel_transaction_id = ${r}.id AND l.voided_at IS NULL AND l.volume > 0
     AND ${r}.total_retail_price_cents IS NOT NULL
     AND (SELECT round(sum(x.total_cost) * 100) FROM fuel.fuel_transactions x
           WHERE x.operating_company_id = o.operating_company_id AND x.transaction_reference = o.transaction_reference
             AND x.voided_at IS NULL AND x.archived_at IS NULL AND x.relay_fuel_transaction_id IS NULL
             AND NOT EXISTS (SELECT 1 FROM catalogs.fuel_card_types ct WHERE ct.id = x.fuel_card_id AND upper(ct.code) = 'RELAY'))
         = ${r}.total_retail_price_cents`;
