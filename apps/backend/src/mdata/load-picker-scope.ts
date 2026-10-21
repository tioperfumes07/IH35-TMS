import { canonicalHappenedNotVoidedLoadClause } from "../dispatch/canonical-active-load-set.js";

/**
 * LEAD 443.206 D10 — the load PICKER scope (GET /mdata/loads?board_scope=picker): every real load that happened, at
 * any stage — booked, dispatched, in transit, delivered, invoiced, settled — so a Settlement Creator line, a claim or an
 * expense can pick a load whose truck is still rolling. Never draft, cancelled, voided (status or voided_at), deleted or
 * sample. Before, the cross-module picker read board_scope=history (a status partition of FINISHED loads): every
 * dispatched / in-transit load was unpickable (6 of 6 live USMCA loads on 2026-10-21) while cancelled ones were offered.
 */
export const LOAD_PICKER_SCOPE = "real_loads_that_happened" as const;

export function loadPickerScopeSql(alias = "l"): string {
  return `(${canonicalHappenedNotVoidedLoadClause(alias)} AND ${alias}.status::text <> 'draft'
            AND ${alias}.voided_at IS NULL AND ${alias}.is_sample_data IS NOT TRUE AND ${alias}.soft_deleted_at IS NULL)`;
}
