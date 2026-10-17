/**
 * The ONE rule for the unit a Relay fill names (443.192). Relay's matched_unit_id when ingest resolved it; otherwise the
 * printed unit number proves the unit only when exactly ONE active unit OPERATED BY THE FILL'S COMPANY carries it
 * (lessee while leased, else owner — the expenses / load-cost-rollup unit rule) (one number,
 * one truck) — 443.192 (Lead ruling 11:40Z): the fleet-wide match resolved USMCA fill e8784c8b to T169 of another
 * company (T169 is leased to 91e0bf0a; T163 to USMCA); same-company rule. Origin
 * BANK-F2026100403 (ce0d597266, T169). Shared by the Relay fill poster (accounting/bank-recon/bank-match-fuel-post.service.ts)
 * and the fill's expense document (fuel/fuel-expense-document.service.ts adoptRelayFillExpenseDocument), so the document
 * carries the same unit the journal entry was posted on. Before this, the document read matched_unit_id alone and two
 * USMCA fills posted on T169 / T163 got documents with no unit (EXP-2026-00008 / -00009, purge-era closure 31).
 * `r` must be the aliased integrations.relay_fuel_transactions row.
 */
export function relayFillUnitIdSql(r = "r"): string {
  return `COALESCE(${r}.matched_unit_id,
                      (SELECT min(u2.id::text)::uuid FROM mdata.units u2
                        WHERE u2.deactivated_at IS NULL
                          AND COALESCE(u2.currently_leased_to_company_id, u2.owner_company_id) = ${r}.operating_company_id
                          AND btrim(u2.unit_number) = btrim(${r}.matched_unit_number)
                       HAVING count(*) = 1))`;
}
