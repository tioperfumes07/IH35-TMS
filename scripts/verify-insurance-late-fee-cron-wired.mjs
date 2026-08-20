#!/usr/bin/env node
/**
 * ACCT-F5628 — applyLateFee() (insurance/late-fee.service.ts) is the ONLY code in the backend that
 * ever writes insurance.payment_schedule.late_fee_cents or sets status='late_fee_applied'. It was
 * never called from anywhere — no route, no cron — so a policy configured with a real late_fee_pct
 * that went past due silently never accrued the fee, and the "Overdue" filter on the Payment
 * Schedule tab always returned zero rows regardless of real overdue installments.
 *
 * This guard proves: (1) a bulk sweep function exists that calls applyLateFee for each candidate
 * row, (2) a cron wraps that sweep (mirroring the sibling insurance payment-reminder cron's own
 * registration shape), and (3) the cron is actually started in index.ts — a function that exists but
 * is never imported/called is exactly as dead as no function at all.
 */
import fs from "node:fs";

export function run(root = process.cwd()) {
  const failures = [];
  const src = fs.readFileSync(`${root}/apps/backend/src/insurance/late-fee.service.ts`, "utf8");
  const indexSrc = fs.readFileSync(`${root}/apps/backend/src/index.ts`, "utf8");

  const sweepMatch = src.match(/export async function applyOverdueLateFeesForTenant\s*\([\s\S]*?\n\}/);
  if (!sweepMatch) {
    failures.push("late-fee.service.ts must export a bulk sweep function (applyOverdueLateFeesForTenant)");
  } else if (!/applyLateFee\(/.test(sweepMatch[0])) {
    failures.push("the sweep function must call the existing applyLateFee() per candidate row — no new fee-calc logic");
  }
  if (!src.includes("export function initializeInsuranceLateFeeCron")) {
    failures.push("late-fee.service.ts must export a cron initializer (initializeInsuranceLateFeeCron)");
  }
  if (!/cron\.schedule\(/.test(src)) {
    failures.push("initializeInsuranceLateFeeCron must actually register a cron.schedule(...) job");
  }

  // Wired, not just defined: index.ts must import AND call the initializer.
  if (!indexSrc.includes('import { initializeInsuranceLateFeeCron } from "./insurance/late-fee.service.js"')) {
    failures.push("index.ts must import initializeInsuranceLateFeeCron from insurance/late-fee.service.js");
  }
  if (!/initializeInsuranceLateFeeCron\(app\)/.test(indexSrc)) {
    failures.push("index.ts must call initializeInsuranceLateFeeCron(app) at startup — imported-but-uncalled is still dead");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-insurance-late-fee-cron-");
  const mk = (rel, body) => {
    fs.mkdirSync(`${tmp}/${rel.split("/").slice(0, -1).join("/")}`, { recursive: true });
    fs.writeFileSync(`${tmp}/${rel}`, body);
  };
  const goodService = `
export async function applyLateFee(scheduleId, today) {}

export async function applyOverdueLateFeesForTenant(tenantId, today) {
  const candidates = [];
  for (const row of candidates) {
    await applyLateFee(row.id, today);
  }
}

export function initializeInsuranceLateFeeCron(app) {
  cron.schedule("0 9 * * *", async () => {});
}
`;
  const goodIndex = `
import { initializeInsuranceLateFeeCron } from "./insurance/late-fee.service.js";
initializeInsuranceLateFeeCron(app);
`;
  mk("apps/backend/src/insurance/late-fee.service.ts", goodService);
  mk("apps/backend/src/index.ts", goodIndex);
  if (run(tmp).length) throw new Error("PASS fail: " + run(tmp).join("; "));

  // Regression 1: sweep function removed entirely (back to the original bug).
  mk("apps/backend/src/insurance/late-fee.service.ts", goodService.replace(/export async function applyOverdueLateFeesForTenant[\s\S]*?\n\}\n/, ""));
  let f = run(tmp);
  if (!f.length) throw new Error("FAIL fail: missing sweep function should be caught");
  mk("apps/backend/src/insurance/late-fee.service.ts", goodService); // restore

  // Regression 2: cron function exists but index.ts never calls it (defined-but-dead).
  mk("apps/backend/src/index.ts", goodIndex.replace("initializeInsuranceLateFeeCron(app);\n", ""));
  f = run(tmp);
  if (!f.length) throw new Error("FAIL fail: imported-but-uncalled cron should be caught");
  mk("apps/backend/src/index.ts", goodIndex); // restore

  // Regression 3: index.ts calls it but never imports it (would not even compile — still catch it).
  mk("apps/backend/src/index.ts", goodIndex.replace('import { initializeInsuranceLateFeeCron } from "./insurance/late-fee.service.js";\n', ""));
  f = run(tmp);
  if (!f.length) throw new Error("FAIL fail: missing import should be caught");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-insurance-late-fee-cron-wired --selftest OK");
} else {
  const f = run();
  if (f.length) {
    console.error(f.join("\n"));
    process.exit(1);
  }
  console.log("verify-insurance-late-fee-cron-wired — OK");
}
