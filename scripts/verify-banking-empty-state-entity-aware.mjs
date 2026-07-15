#!/usr/bin/env node
// B-A1 GUARD — the Banking bank-accounts empty-state must be ENTITY-AWARE, never a bare "No accounts yet".
// Root cause of the 2026-07-15 false-alarm: viewing Banking under an empty entity (USMCA) rendered a bare "0 /
// No accounts yet" that read as a broken query, while the 15 accounts lived under TRANSP/TRK. The honest fix is
// EntityEmptyState (names the entity + points at the switcher). This guard keeps it from regressing to a bare zero.
import fs from "node:fs";

const BANKING_HOME = "apps/frontend/src/pages/banking/BankingHome.tsx";
const BARE_ZERO = />No accounts yet\.?</; // the old false-zero literal in JSX

export function checkBankingHome(src) {
  const s = String(src || "");
  const reasons = [];
  if (BARE_ZERO.test(s)) reasons.push(`${BANKING_HOME}: bare "No accounts yet" empty-state — use EntityEmptyState (names the entity + switch hint) so an empty entity can't read as a broken query`);
  if (!/EntityEmptyState/.test(s)) reasons.push(`${BANKING_HOME}: must render <EntityEmptyState …/> for the bank-accounts empty-state`);
  return reasons;
}

function selfTest() {
  const cases = [
    { name: "entity-aware -> ok", got: checkBankingHome('foo {rows.length === 0 ? <EntityEmptyState entityName={x} noun="bank accounts" /> : null}').length, want: 0 },
    { name: "bare zero -> flagged", got: checkBankingHome('<p>No accounts yet.</p>\nEntityEmptyState').some((r) => /bare/.test(r)), want: true },
    { name: "missing component -> flagged", got: checkBankingHome("<div>accounts</div>").some((r) => /EntityEmptyState/.test(r)), want: true },
  ];
  let failed = 0;
  for (const c of cases) {
    const ok = c.got === c.want;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.name}  (got ${JSON.stringify(c.got)}, want ${JSON.stringify(c.want)})`);
  }
  if (failed) { console.error(`\nself-test FAILED: ${failed}/${cases.length}`); process.exit(1); }
  console.log(`\nself-test PASS: ${cases.length}/${cases.length}`);
}

function main() {
  if (process.argv.includes("--self-test")) { selfTest(); return; }
  selfTest();
  let src = "";
  try { src = fs.readFileSync(BANKING_HOME, "utf8"); } catch { console.error(`FAIL: cannot read ${BANKING_HOME}`); process.exit(1); }
  const reasons = checkBankingHome(src);
  if (reasons.length) {
    console.error("\nFAIL verify-banking-empty-state-entity-aware:");
    reasons.forEach((r) => console.error(`  • ${r}`));
    process.exit(1);
  }
  console.log("\nPASS verify-banking-empty-state-entity-aware — banking empty-state is entity-aware.");
}

main();
