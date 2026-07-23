#!/usr/bin/env node
/** Banking Full Audit — +30 aging fees must not be hardcoded $0. */
import fs from "node:fs";
export function run(root = process.cwd()) {
  const failures = [];
  const home = fs.readFileSync(`${root}/apps/frontend/src/pages/banking/BankingHome.tsx`, "utf8");
  if (home.includes("+30 aging fees") && /aging fees[\s\S]{0,80}money\.format\(0\)/.test(home)) {
    failures.push("must not hardcode +30 aging fees as money.format(0)");
  }
  if (!home.includes("— (see Chargebacks & Fees)")) {
    failures.push("aging fees must defer to Chargebacks & Fees when API has no field");
  }
  return failures;
}
if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-banking-aging-");
  fs.mkdirSync(`${tmp}/apps/frontend/src/pages/banking`, { recursive: true });
  fs.writeFileSync(
    `${tmp}/apps/frontend/src/pages/banking/BankingHome.tsx`,
    `+30 aging fees\n— (see Chargebacks & Fees)\n`
  );
  if (run(tmp).length) throw new Error("PASS fail");
  fs.writeFileSync(
    `${tmp}/apps/frontend/src/pages/banking/BankingHome.tsx`,
    `+30 aging fees\nmoney.format(0)\n— (see Chargebacks & Fees)\n`
  );
  if (!run(tmp).length) throw new Error("FAIL fail");
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-banking-aging-fees-honesty --selftest OK");
} else {
  const f = run();
  if (f.length) { console.error(f.join("\n")); process.exit(1); }
  console.log("verify-banking-aging-fees-honesty — OK");
}
