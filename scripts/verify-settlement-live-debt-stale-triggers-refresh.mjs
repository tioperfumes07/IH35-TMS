#!/usr/bin/env node
/**
 * LV-SETTLEMENT-DEBT-REFRESHING-PERMANENT-STALE — useLiveDebt's staleness interval used to only
 * flip `isStale` to true once `computed_at` aged past 5s, but never actually called `refresh()`,
 * so SettlementDetailPage's DebtBanner got permanently stuck on "Refreshing..." with no request
 * ever in flight to resolve it, and FinalizeBlock stayed blocked via `staleDebt={debt.isStale}`.
 *
 * Fixed: the same interval now fires `refresh()` when it detects staleness, guarded by a ref
 * (`refreshingRef`) against overlapping concurrent calls — the 5s interval itself is the retry
 * backoff on failure, no separate timer needed.
 *
 * Locks: (1) a real `refresh()` call exists inside the staleness interval, gated by the overlap
 * guard, (2) the guard ref is actually reset in a `.finally()` so a failed refresh can retry on
 * the next tick rather than wedging closed forever, (3) the interval's own effect dependency
 * array includes `refresh` (a stale closure would call an outdated refresh bound to a prior
 * driver/company).
 */
import { readFileSync } from "node:fs";

const hookPath = "apps/frontend/src/pages/driver-finance/hooks/useLiveDebt.ts";
const src = readFileSync(hookPath, "utf8");

function analyze(src) {
  const failures = [];

  const intervalStart = src.indexOf("timerRef.current = window.setInterval(");
  const intervalSection = intervalStart === -1 ? "" : src.slice(intervalStart, intervalStart + 900);

  if (!/void refresh\(\)/.test(intervalSection)) {
    failures.push(`${hookPath}: staleness interval no longer calls refresh() — will re-wedge on "Refreshing..." forever`);
  }
  if (!/refreshingRef\.current\s*=\s*true/.test(intervalSection) || !/if \(stale && !refreshingRef\.current\)/.test(intervalSection)) {
    failures.push(`${hookPath}: refresh() call is not guarded against overlapping concurrent calls via refreshingRef`);
  }
  if (!/\.finally\(\(\) => \{\s*refreshingRef\.current = false;/.test(intervalSection)) {
    failures.push(`${hookPath}: refreshingRef is not reset in a .finally() — a failed refresh would wedge the guard closed permanently`);
  }

  // The effect wrapping the interval must depend on `refresh` (a stale closure over an old
  // driver/company binding would silently refresh the WRONG driver's debt).
  const effectDeclStart = src.indexOf("useEffect(() => {\n    if (timerRef.current !== null) window.clearInterval(timerRef.current);\n    timerRef.current = window.setInterval(");
  const effectTail = effectDeclStart === -1 ? "" : src.slice(effectDeclStart, effectDeclStart + 1400);
  if (!/\}, \[refresh\]\);/.test(effectTail)) {
    failures.push(`${hookPath}: staleness-interval effect's dependency array no longer includes [refresh] — risks refreshing a stale driver/company binding`);
  }

  return failures;
}

function selftest() {
  const good = analyze(src);
  if (good.length > 0) {
    console.error("verify-settlement-live-debt-stale-triggers-refresh --selftest: FAIL on the real (good) file");
    for (const f of good) console.error(`  - ${f}`);
    process.exit(1);
  }

  // Mutation 1: drop the refresh() call, reverting to the original "flag only, never fetch" bug.
  const mutated1 = src.replace(
    /if \(stale && !refreshingRef\.current\) \{\s*refreshingRef\.current = true;\s*void refresh\(\)\.finally\(\(\) => \{\s*refreshingRef\.current = false;\s*\}\);\s*\}\n\s*/,
    ""
  );
  if (mutated1 === src) {
    console.error("verify-settlement-live-debt-stale-triggers-refresh --selftest: mutation 1 setup failed — anchor not found");
    process.exit(1);
  }
  const failures1 = analyze(mutated1);
  if (failures1.length === 0) {
    console.error("verify-settlement-live-debt-stale-triggers-refresh --selftest: mutation 1 (drop refresh() call) was not caught");
    process.exit(1);
  }

  // Mutation 2: drop the .finally() reset, so a failed refresh wedges the guard closed forever.
  const mutated2 = src.replace(
    "void refresh().finally(() => {\n            refreshingRef.current = false;\n          });",
    "void refresh();"
  );
  if (mutated2 === src) {
    console.error("verify-settlement-live-debt-stale-triggers-refresh --selftest: mutation 2 setup failed — anchor not found");
    process.exit(1);
  }
  const failures2 = analyze(mutated2);
  if (failures2.length === 0) {
    console.error("verify-settlement-live-debt-stale-triggers-refresh --selftest: mutation 2 (drop .finally reset) was not caught");
    process.exit(1);
  }

  console.log("verify-settlement-live-debt-stale-triggers-refresh --selftest: OK (good file clean, both targeted mutations caught)");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const failures = analyze(src);
  if (failures.length > 0) {
    console.error("verify-settlement-live-debt-stale-triggers-refresh: FAIL");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("verify-settlement-live-debt-stale-triggers-refresh: OK — staleness interval actually triggers a guarded refresh() instead of wedging on 'Refreshing...' forever");
}
