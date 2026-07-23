#!/usr/bin/env node
/** Banking Full Audit — Settings tab must not imply ops complete. */
import fs from "node:fs";
export function run(root = process.cwd()) {
  const failures = [];
  const home = fs.readFileSync(`${root}/apps/frontend/src/pages/banking/BankingHome.tsx`, "utf8");
  if (!home.includes('data-testid="banking-settings-not-ops-complete-banner"')) {
    failures.push("missing settings not-ops-complete banner");
  }
  if (!home.includes("do not complete Match/Categorize or reconcile")) {
    failures.push("banner must refuse ops-complete implication");
  }
  return failures;
}
if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-banking-settings-h-");
  fs.mkdirSync(`${tmp}/apps/frontend/src/pages/banking`, { recursive: true });
  fs.writeFileSync(
    `${tmp}/apps/frontend/src/pages/banking/BankingHome.tsx`,
    `data-testid="banking-settings-not-ops-complete-banner"\ndo not complete Match/Categorize or reconcile\n`
  );
  if (run(tmp).length) throw new Error("PASS fail");
  fs.writeFileSync(`${tmp}/apps/frontend/src/pages/banking/BankingHome.tsx`, "x\n");
  if (!run(tmp).length) throw new Error("FAIL fail");
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-banking-settings-honesty --selftest OK");
} else {
  const f = run();
  if (f.length) { console.error(f.join("\n")); process.exit(1); }
  console.log("verify-banking-settings-honesty — OK");
}
