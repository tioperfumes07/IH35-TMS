#!/usr/bin/env node
/** Banking Full Audit economics — empty Transfers must not imply all-clear. */
import fs from "node:fs";
export function run(root = process.cwd()) {
  const failures = [];
  const page = fs.readFileSync(`${root}/apps/frontend/src/pages/banking/TransfersListPage.tsx`, "utf8");
  if (!page.includes('data-testid="banking-transfers-never-recorded-banner"')) {
    failures.push("missing transfers empty honesty banner");
  }
  if (!page.includes("not proven live until at least one transfer")) {
    failures.push("banner must refuse fake all-clear on empty transfers");
  }
  if (!page.includes("/banking/transactions?type=uncategorized")) {
    failures.push("banner must link for-review queue");
  }
  return failures;
}
if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-banking-transfers-");
  fs.mkdirSync(`${tmp}/apps/frontend/src/pages/banking`, { recursive: true });
  fs.writeFileSync(
    `${tmp}/apps/frontend/src/pages/banking/TransfersListPage.tsx`,
    `data-testid="banking-transfers-never-recorded-banner"\nnot proven live until at least one transfer\n/banking/transactions?type=uncategorized\n`
  );
  if (run(tmp).length) throw new Error("PASS fail");
  fs.writeFileSync(`${tmp}/apps/frontend/src/pages/banking/TransfersListPage.tsx`, "x\n");
  if (!run(tmp).length) throw new Error("FAIL fail");
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-banking-transfers-empty-honesty --selftest OK");
} else {
  const f = run();
  if (f.length) { console.error(f.join("\n")); process.exit(1); }
  console.log("verify-banking-transfers-empty-honesty — OK");
}
