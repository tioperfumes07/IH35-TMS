#!/usr/bin/env node
/** Banking Full Audit — empty Escrow $0 must not read as healthy. */
import fs from "node:fs";
export function run(root = process.cwd()) {
  const failures = [];
  const page = fs.readFileSync(
    `${root}/apps/frontend/src/pages/banking/components/DriverEscrowTabContent.tsx`,
    "utf8"
  );
  if (!page.includes('data-testid="banking-escrow-empty-honesty-banner"')) {
    failures.push("missing escrow empty honesty banner");
  }
  if (!page.includes("not “healthy zero”") && !page.includes("not \"healthy zero\"")) {
    failures.push("banner must refuse healthy-zero implication");
  }
  if (!page.includes("/banking/transactions?type=uncategorized")) {
    failures.push("banner must link for-review");
  }
  return failures;
}
if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-banking-escrow-");
  fs.mkdirSync(`${tmp}/apps/frontend/src/pages/banking/components`, { recursive: true });
  fs.writeFileSync(
    `${tmp}/apps/frontend/src/pages/banking/components/DriverEscrowTabContent.tsx`,
    `data-testid="banking-escrow-empty-honesty-banner"\nnot “healthy zero”\n/banking/transactions?type=uncategorized\n`
  );
  if (run(tmp).length) throw new Error("PASS fail");
  fs.writeFileSync(`${tmp}/apps/frontend/src/pages/banking/components/DriverEscrowTabContent.tsx`, "x\n");
  if (!run(tmp).length) throw new Error("FAIL fail");
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-banking-escrow-empty-honesty --selftest OK");
} else {
  const f = run();
  if (f.length) { console.error(f.join("\n")); process.exit(1); }
  console.log("verify-banking-escrow-empty-honesty — OK");
}
