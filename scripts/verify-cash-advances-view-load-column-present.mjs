#!/usr/bin/env node
/**
 * verify-cash-advances-view-load-column-present.mjs
 *
 * ACCT-F5408 — views.cash_advances_with_context (migration 0046) was created BEFORE
 * driver_finance.driver_advances.load_id existed (added later by migration
 * 202606251600_load_cash_advance_link.sql) and was never refreshed to select it. That view is the
 * ONLY read path for GET /api/v1/cash-advances/:id, which backs AdvanceDetailDrawer.tsx and
 * MarkDisbursedModal.tsx — so those two surfaces could never render a Linked Load EntityLink no
 * matter what real data existed. CreateAdvanceModal.tsx has always required load_id for
 * purpose=lumper/fuel_deposit — the write path was correct; only the read-back view was stale.
 *
 * Fixed by migration 202612750000_cash_advances_with_context_load_link.sql, which appends
 * a.load_id + a joined mdata.loads.load_number to the view's SELECT list (appended at the END,
 * since CREATE OR REPLACE VIEW cannot reorder/remove existing output columns).
 *
 * Guards against the view regressing back to discarding load_id, and against either frontend
 * consumer regressing back to not rendering it.
 */
import { readFileSync, readdirSync } from "node:fs";

const failures = [];

const migrationsDir = "db/migrations";
const migrationFiles = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
const viewMigrations = migrationFiles.filter((f) => {
  const src = readFileSync(`${migrationsDir}/${f}`, "utf8");
  return /CREATE OR REPLACE VIEW views\.cash_advances_with_context/.test(src);
});

if (viewMigrations.length === 0) {
  failures.push("no migration defines views.cash_advances_with_context — re-check this guard");
} else {
  // Use the LEXICALLY LAST migration that touches the view — migrations replay in filename order,
  // so that is the one whose column list is actually live on a fully-migrated database.
  const latest = viewMigrations.sort().at(-1);
  const src = readFileSync(`${migrationsDir}/${latest}`, "utf8");
  // Check the real (non-empty-fallback) branch specifically: it's the SELECT ... FROM
  // driver_finance.driver_advances a block, not the NULL-literal fallback branch.
  const realBranchMatch = src.match(/SELECT\s+a\.id,[\s\S]*?FROM\s+driver_finance\.driver_advances a/);
  if (!realBranchMatch) {
    failures.push(`${latest}: could not find the real (non-fallback) SELECT branch — re-check this guard`);
  } else {
    const realBranch = realBranchMatch[0];
    if (!/a\.load_id/.test(realBranch)) {
      failures.push(`${latest}: views.cash_advances_with_context no longer selects a.load_id`);
    }
    if (!/load_display_id/.test(realBranch)) {
      failures.push(`${latest}: views.cash_advances_with_context no longer aliases a load display column as load_display_id`);
    }
  }
}

const drawerPath = "apps/frontend/src/pages/cash-advances/components/AdvanceDetailDrawer.tsx";
const drawerSrc = readFileSync(drawerPath, "utf8");
if (!/advance\.load_id/.test(drawerSrc) || !/kind="load"/.test(drawerSrc)) {
  failures.push(`${drawerPath}: no longer renders a Linked Load EntityLink from advance.load_id`);
}

const modalPath = "apps/frontend/src/pages/cash-advances/components/MarkDisbursedModal.tsx";
const modalSrc = readFileSync(modalPath, "utf8");
if (!/advance\?\.load_id/.test(modalSrc) || !/kind="load"/.test(modalSrc)) {
  failures.push(`${modalPath}: no longer renders a Linked Load EntityLink from advance.load_id`);
}
if (!/advance\?:\s*Record<string,\s*unknown>\s*\|\s*null/.test(modalSrc)) {
  failures.push(`${modalPath}: no longer accepts an "advance" prop — MarkDisbursedModal needs the full record, not just advanceId, to render load context`);
}

const homePath = "apps/frontend/src/pages/cash-advances/CashAdvancesHome.tsx";
const homeSrc = readFileSync(homePath, "utf8");
if (!/<MarkDisbursedModal[\s\S]{0,300}?advance=\{detailQuery\.data/.test(homeSrc)) {
  failures.push(`${homePath}: MarkDisbursedModal is no longer passed advance={detailQuery.data ?? null}`);
}

if (failures.length > 0) {
  console.error("verify-cash-advances-view-load-column-present: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("verify-cash-advances-view-load-column-present: OK — view selects load_id/load_display_id, both FE consumers render the Linked Load EntityLink");
