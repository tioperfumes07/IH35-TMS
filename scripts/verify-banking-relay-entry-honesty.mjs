#!/usr/bin/env node
/** Banking Full Audit — empty Relay tab must not imply no fuel spend. */
import fs from "node:fs";
export function run(root = process.cwd()) {
  const failures = [];
  const home = fs.readFileSync(`${root}/apps/frontend/src/pages/banking/BankingHome.tsx`, "utf8");
  if (!home.includes('data-testid="banking-relay-entry-unproven-banner"')) {
    failures.push("missing relay entry unproven banner");
  }
  if (!home.includes('not "no fuel spend.')) {
    failures.push("banner must refuse no-fuel-spend implication");
  }
  if (!home.includes("Open for-review queue")) {
    failures.push("banner must offer for-review queue action");
  }
  return failures;
}
if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-banking-relay-");
  fs.mkdirSync(`${tmp}/apps/frontend/src/pages/banking`, { recursive: true });
  fs.writeFileSync(
    `${tmp}/apps/frontend/src/pages/banking/BankingHome.tsx`,
    `data-testid="banking-relay-entry-unproven-banner"\nnot "no fuel spend."\nOpen for-review queue\n`
  );
  if (run(tmp).length) throw new Error("PASS fail");
  fs.writeFileSync(`${tmp}/apps/frontend/src/pages/banking/BankingHome.tsx`, "x\n");
  if (!run(tmp).length) throw new Error("FAIL fail");
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-banking-relay-entry-honesty --selftest OK");
} else {
  const f = run();
  if (f.length) { console.error(f.join("\n")); process.exit(1); }
  console.log("verify-banking-relay-entry-honesty — OK");
}
