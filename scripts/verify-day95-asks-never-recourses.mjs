#!/usr/bin/env node
// Lead ROUND 296 / 297 + owner (2026-10-02): "WHEN RECOURSE TIME ARRIVES IT MUST ASK, NOT RECOURSE AUTOMATICALLY."
//
// Fails the push when:
//   1. the nightly factoring cron imports an accrual / recourse / poster motion (it may only register events);
//   2. the day-95 auto-recourse or the nightly default-interest accrual loses its retirement gate;
//   3. the repurchase-due service or routes write money (journal entry, posting, bill, payment, invoice status);
//   4. the decide route is not Owner-only, or the decision migration loses its no-default state set.
// Static, <1s. --selftest plants each regression.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-day95-asks-never-recourses";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const F = {
  cron: "apps/backend/src/cron/factoring-default-interest-accrual.cron.ts",
  engine: "apps/backend/src/accounting/factoring-posting/default-interest.service.ts",
  service: "apps/backend/src/factoring/repurchase-due.service.ts",
  routes: "apps/backend/src/factoring/repurchase-due.routes.ts",
  migration: "db/migrations/202615220700_factoring_repurchase_due_events.sql",
};
const WRITES_MONEY =
  /journal_entr|postSourceTransaction|poster\.service|postFactoring|INSERT\s+INTO\s+accounting\.(bills|bill_payments|payments|invoice_payments|expenses)|UPDATE\s+accounting\.(invoices|factoring_advances|factoring_purchases)\b/i;

export function check(src) {
  const fails = [];
  if (/accrueDefaultInterestForCompany|triggerDay95RecourseForCompany|poster\.service|postFactoring/.test(src.cron)) {
    fails.push(`${F.cron}: the nightly cron imports an accrual / recourse / poster — it may only register repurchase-due events`);
  }
  if (!/registerRepurchaseDueEvents/.test(src.cron)) fails.push(`${F.cron}: does not register repurchase-due events`);
  for (const gate of ["DAY95_AUTO_RECOURSE_RETIRED", "NIGHTLY_INTEREST_ACCRUAL_RETIRED"]) {
    if (!new RegExp(`export const ${gate}: boolean = true;`).test(src.engine)) fails.push(`${F.engine}: ${gate} is not \`boolean = true\``);
    if (!new RegExp(`if \\(${gate}\\) return \\{`).test(src.engine)) fails.push(`${F.engine}: ${gate} no longer returns early`);
  }
  for (const k of ["service", "routes"]) {
    const code = src[k].replace(/^\s*\/\/.*$/gm, "");
    if (WRITES_MONEY.test(code)) fails.push(`${F[k]}: writes money (${code.match(WRITES_MONEY)[0]}) — a day-95 decision records the answer only`);
  }
  if (!/user\.role !== "Owner"/.test(src.routes)) fails.push(`${F.routes}: decide is not Owner-only`);
  if (!/'awaiting_owner', 'extended', 'repurchase_confirmed', 'marked_collected'/.test(src.migration)) {
    fails.push(`${F.migration}: state set changed — awaiting_owner / extended / repurchase_confirmed / marked_collected, no default action`);
  }
  return fails;
}

const read = () => Object.fromEntries(Object.entries(F).map(([k, p]) => [k, fs.readFileSync(path.join(ROOT, p), "utf8")]));

if (process.argv.includes("--selftest")) {
  const good = read();
  const plants = [
    ["cron imports recourse", { cron: good.cron + "\nimport { triggerDay95RecourseForCompany } from 'x';" }],
    ["recourse gate flipped", { engine: good.engine.replace("DAY95_AUTO_RECOURSE_RETIRED: boolean = true", "DAY95_AUTO_RECOURSE_RETIRED: boolean = false") }],
    ["accrual early return removed", { engine: good.engine.replace("if (NIGHTLY_INTEREST_ACCRUAL_RETIRED) return {", "if (false) return {") }],
    ["service posts a JE", { service: good.service + "\nawait client.query(`INSERT INTO accounting.journal_entries (id) VALUES ($1)`);" }],
    ["route not owner-only", { routes: good.routes.replace('user.role !== "Owner"', "false") }],
  ];
  const baseline = check(good);
  if (baseline.length) { console.error(`${LABEL} --selftest FAIL: tree not clean:\n  ${baseline.join("\n  ")}`); process.exit(1); }
  const missed = plants.filter(([, over]) => check({ ...good, ...over }).length === 0).map(([n]) => n);
  if (missed.length) { console.error(`${LABEL} --selftest FAIL: not caught: ${missed.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${plants.length}/${plants.length}`);
  process.exit(0);
}

const fails = check(read());
if (fails.length) {
  console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — day 95 registers an owner decision; no nightly accrual, no auto-recourse, no money on decide`);
