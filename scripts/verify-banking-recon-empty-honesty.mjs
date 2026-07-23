#!/usr/bin/env node
/** Banking Full Audit economics — Reconciliation must not imply live proof when sessions are empty. */
import fs from "node:fs";
export function run(root = process.cwd()) {
  const failures = [];
  const home = fs.readFileSync(`${root}/apps/frontend/src/pages/banking/BankingHome.tsx`, "utf8");
  if (!home.includes('data-testid="banking-recon-never-completed-banner"')) {
    failures.push("missing never-completed recon honesty banner");
  }
  if (!home.includes("Do not treat this screen as")) {
    failures.push("banner must refuse fake 'reconciled' implication");
  }
  if (!home.includes("Open for-review queue")) {
    failures.push("banner must link for-review / uncategorized queue");
  }
  return failures;
}
if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-banking-recon-");
  fs.mkdirSync(`${tmp}/apps/frontend/src/pages/banking`, { recursive: true });
  fs.writeFileSync(
    `${tmp}/apps/frontend/src/pages/banking/BankingHome.tsx`,
    `data-testid="banking-recon-never-completed-banner"\nDo not treat this screen as\nOpen for-review queue\n`
  );
  if (run(tmp).length) throw new Error("PASS fail");
  fs.writeFileSync(`${tmp}/apps/frontend/src/pages/banking/BankingHome.tsx`, "x\n");
  if (!run(tmp).length) throw new Error("FAIL fail");
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-banking-recon-empty-honesty --selftest OK");
} else {
  const f = run();
  if (f.length) { console.error(f.join("\n")); process.exit(1); }
  console.log("verify-banking-recon-empty-honesty — OK");
}
