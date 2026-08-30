#!/usr/bin/env node
/** @matrix-built {"modules":["accounting","dispatch","safety","reports"],"cols":["load"],"leafRe":"^(expenses\\.create|load\\.drawer\\.pre_settlement|dispatch\\.wizard\\.border_crossing_wizard_page|cargo_claims\\.create|report\\.dispatch_margin)$","task":"WAVE-A-load-exact-surfaces","vertical":"column-wave"} */
import fs from "node:fs";

// The real rows use <EntityLinkOrTombstone kind="load" id={settlement.X_load_id}
// name={settlement.X_load_number} noun="Load" /> (not a bare <EntityLink label={...}>) —
// EntityLinkOrTombstone additionally withholds the drill when the load is unresolved (own
// component contract), a strictly stronger guarantee than a raw EntityLink. Accept either
// component name and either the `label=` or `name=` prop. Bounded with `[^>]` (never crosses a
// `>`) so the match stays inside ONE JSX tag — PreSettlementPanel.tsx has two near-identical
// <EntityLink.../> blocks (first-load and last-load) back to back; an unbounded `[\s\S]*` window
// would let a check for one block's id/kind pair up with the OTHER block's label, silently
// passing even if a block's own kind/label were wrong.
const checks = [
  ["pre-settlement first-load drill", "apps/frontend/src/components/dispatch/PreSettlementPanel.tsx", /<EntityLink(?:OrTombstone)?[^>]{0,300}?kind="load"[^>]{0,300}?id=\{settlement\.first_load_id\}[^>]{0,300}?(?:label|name)=\{settlement\.first_load_number\}/],
  ["pre-settlement last-load drill", "apps/frontend/src/components/dispatch/PreSettlementPanel.tsx", /<EntityLink(?:OrTombstone)?[^>]{0,300}?kind="load"[^>]{0,300}?id=\{settlement\.last_load_id\}[^>]{0,300}?(?:label|name)=\{settlement\.last_load_number\}/],
  // BANK-F5765 — the old assertion pointed at BankingPlaidConnectionsPanel's connection-management
  // shell and a retired `t.matched_load_id` row shape. The mounted transaction register now resolves
  // categorization_load_id OR matched_load_id into one canonical id/number pair, then renders that
  // exact pair as the operator's load drill. Keep id + human label bounded inside one JSX tag.
  ["banking resolved-load drill", "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx", /<EntityLink[^>]{0,180}?kind="load"[^>]{0,180}?id=\{tx\.resolved_load_id\}[^>]{0,220}?label=\{entityLabel\(tx\.resolved_load_number,\s*tx\.resolved_load_id,\s*"Load"\)\}/],
  ["expense create load FK", "apps/frontend/src/components/expenses/recordExpenseSubmit.ts", /values\.loadId\s*\?\s*\{\s*load_id:\s*values\.loadId\s*\}/],
  ["insurance claim create load FK", "apps/frontend/src/components/insurance/ClaimCreateModal.tsx", /load_id:\s*form\.load_id\s*\|\|\s*null/],
  ["border crossing create load FK", "apps/frontend/src/pages/dispatch/BorderCrossingWizardPage.tsx", /load_id:\s*input\.form\.loadId\s*\|\|\s*undefined/],
  ["cargo claim create load FK", "apps/frontend/src/pages/safety/components/CargoClaimIntakeSurface.tsx", /load_id:\s*form\.loadId\s*\|\|\s*null/],
  ["dispatch margin load drill", "apps/frontend/src/pages/reports/DispatchMarginPage.tsx", /<EntityLink kind="load" id=\{row\.load_id\}/],
];
const files = [...new Set(checks.map(([, file]) => file))];
const original = new Map(files.map((file) => [file, fs.readFileSync(file, "utf8")]));

function audit(sources) {
  return checks.filter(([, file, pattern]) => !pattern.test(sources.get(file) ?? "")).map(([name]) => name);
}

const failures = audit(original);
if (failures.length) {
  console.error(`verify-wave-a-load-column FAIL:\n${failures.map((failure) => ` - ${failure}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const [name, file, pattern] of checks) {
    const mutated = new Map(original);
    const allMatches = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
    mutated.set(file, original.get(file).replace(allMatches, "__PLANTED_LOAD_COLUMN_DEFECT__"));
    if (audit(mutated).includes(name)) caught += 1;
    else throw new Error(`selftest failed to catch: ${name}`);
  }
  console.log(`verify-wave-a-load-column SELFTEST PASS — ${caught}/${checks.length} exact load mutations detected`);
  process.exit(0);
}

console.log("verify-wave-a-load-column PASS — load create FKs and reverse links ratcheted across the vertical matrix");
