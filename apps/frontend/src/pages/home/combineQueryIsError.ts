// GO-0040-HOME-QBO-SYNC-HEALTH-SUB-PANEL-SILENT-FAILURE: QboSyncHealthCard renders data from
// FOUR independent useQuery calls (health + customers/vendors/accounts push status), but its
// `isError` prop was wired to only one of them -- a failure in any of the other three silently
// dropped that section (the card renders each push-status section conditionally on the prop
// being truthy, with no error affordance of its own), indistinguishable from "nothing pending."
// A card driven by multiple queries must gate its single isError signal on ALL of them, not just
// the first one wired up. Extracted as a tiny, directly-testable helper so the next multi-query
// card composition doesn't have to re-discover this by hand -- and so a future edit that adds a
// 5th query to the same card is one call-site change away from being caught, not a silent gap.
export function combineQueryIsError(queries: Array<{ isError: boolean }>): boolean {
  return queries.some((q) => q.isError);
}
