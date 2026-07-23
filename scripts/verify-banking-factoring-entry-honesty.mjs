#!/usr/bin/env node
/** Banking Full Audit — Factoring entry must not invent Advances funded MTD from cash KPIs. */
import fs from "node:fs";
export function run(root = process.cwd()) {
  const failures = [];
  const home = fs.readFileSync(`${root}/apps/frontend/src/pages/banking/BankingHome.tsx`, "utf8");
  if (!home.includes('data-testid="banking-factoring-entry-unproven-banner"')) {
    failures.push("missing factoring entry unproven banner");
  }
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
    `data-testid="banking-factoring-entry-unproven-banner"\n— (see Factoring module)\n`
  );
  if (run(tmp).length) throw new Error("PASS fail");
  fs.writeFileSync(
    `${tmp}/apps/frontend/src/pages/banking/BankingHome.tsx`,
    `cashPosting - factoringReserve\ndata-testid="banking-factoring-entry-unproven-banner"\n— (see Factoring module)\n`
  );
  if (!run(tmp).length) throw new Error("FAIL fail");
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-banking-factoring-entry-honesty --selftest OK");
} else {
  const f = run();
  if (f.length) { console.error(f.join("\n")); process.exit(1); }
  console.log("verify-banking-factoring-entry-honesty — OK");
}
