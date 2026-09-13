#!/usr/bin/env node
/**
 * Banking Full Audit — Factoring entry must not invent Advances funded MTD from cash KPIs.
 *
 * NARROWED 2026-09-13 (ROUND-20.8 B3) — the dedicated "factoring entry unproven banner" this guard
 * used to require lived inside the now-deleted Factoring TAB content, not the Accounts tab's own
 * surviving "Factoring · virtual bank" summary card. The card's own honesty behavior (never
 * inventing Advances funded MTD, deferring to the Factoring module by name when the API has no MTD
 * field) is unchanged and still asserted below; the tab-specific banner test-id requirement is
 * dropped since that banner no longer exists anywhere in Banking.
 */
import fs from "node:fs";
export function run(root = process.cwd()) {
  const failures = [];
  const home = fs.readFileSync(`${root}/apps/frontend/src/pages/banking/BankingHome.tsx`, "utf8");
  if (home.includes("cashPosting - factoringReserve")) {
    failures.push("must not invent Advances funded MTD from cashPosting - factoringReserve");
  }
  if (!home.includes("— (see Factoring module)")) {
    failures.push("Advances funded MTD must defer to Factoring module when API has no MTD field");
  }
  return failures;
}
if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-banking-factoring-");
  fs.mkdirSync(`${tmp}/apps/frontend/src/pages/banking`, { recursive: true });
  fs.writeFileSync(
    `${tmp}/apps/frontend/src/pages/banking/BankingHome.tsx`,
    `— (see Factoring module)\n`
  );
  if (run(tmp).length) throw new Error("PASS fail");
  fs.writeFileSync(
    `${tmp}/apps/frontend/src/pages/banking/BankingHome.tsx`,
    `cashPosting - factoringReserve\n— (see Factoring module)\n`
  );
  if (!run(tmp).length) throw new Error("FAIL fail (invented MTD not caught)");
  fs.writeFileSync(
    `${tmp}/apps/frontend/src/pages/banking/BankingHome.tsx`,
    `nothing here\n`
  );
  if (!run(tmp).length) throw new Error("FAIL fail (missing honest-defer text not caught)");
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-banking-factoring-entry-honesty --selftest OK");
} else {
  const f = run();
  if (f.length) { console.error(f.join("\n")); process.exit(1); }
  console.log("verify-banking-factoring-entry-honesty — OK");
}
