#!/usr/bin/env tsx
/**
 * cursor-2026-09-22-faro-first-reconciliation-run.mts — ROUND29.7 item 6.
 * factor.reconciliation_runs has never run once. Runs it now against the corrected,
 * Faro-scoped statement (c1e27709-28f7-4886-860f-b9597ddad71a, now exactly 89 lines / $311,587.00,
 * ties to every Faro control) via the real, now-provenance-guarded recon.service.ts.
 */
import { importStatement, listReconciliationItems } from "../../apps/backend/src/accounting/factor-reconciliation/recon.service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const FARO_VENDOR_ID = "a1f4c2b6-8e35-4f91-9c2d-6b7a58e0f3c4";
const IMPORT_ID = "c1e27709-28f7-4886-860f-b9597ddad71a";

async function main() {
  const run = await importStatement({
    operating_company_id: USMCA,
    factor_id: FARO_VENDOR_ID,
    daily_import_id: IMPORT_ID,
    actor_user_uuid: OWNER,
  });
  console.log("Reconciliation run created:", run);

  const items = await listReconciliationItems({ operating_company_id: USMCA, run_id: run!.id });
  const byState = new Map<string, { count: number; variance: number }>();
  for (const it of items) {
    const cur = byState.get(it.ledger_match_state) ?? { count: 0, variance: 0 };
    cur.count += 1;
    cur.variance += Number(it.variance_cents ?? 0);
    byState.set(it.ledger_match_state, cur);
  }
  console.log("Item counts by ledger_match_state:");
  for (const [state, agg] of byState) {
    console.log(`  ${state}: ${agg.count} items, variance_cents total=${agg.variance} ($${(agg.variance / 100).toFixed(2)})`);
  }
  console.log(`Total items: ${items.length}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
