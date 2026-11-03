#!/usr/bin/env node
/**
 * E8 / row 261 (LEAD 11-03) — Actual vs Projected's projected expense IS the daily engine's number.
 *   1. getActualVsProjected never reads accounting.bills itself (that bills-only read showed $0 on almost every day).
 *   2. getActualVsProjected and getDailyPrediction both call getDailyExpenseItems (one source → one number).
 *   3. a past day reads projected_expense_cents from the snapshot; a missing value is "not_captured", never 0.
 *   4. the snapshot cron captures expense_subtotal_cents.
 * Static scan of the source; --selftest plants each defect in memory.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-cash-flow-avp-expense-engine-parity";
const SERVICE = "apps/backend/src/cash-flow/cash-flow.service.ts";
const CRON = "apps/backend/src/cron/cash-flow-projection-snapshot.cron.ts";

function fnBody(src, name) {
  const start = src.indexOf(`export async function ${name}(`);
  if (start < 0) return null;
  const next = src.indexOf("\nexport ", start + 10);
  return src.slice(start, next < 0 ? undefined : next);
}

export function findDefects(service, cron) {
  const out = [];
  const avp = fnBody(service, "getActualVsProjected");
  const daily = fnBody(service, "getDailyPrediction");
  if (!avp) out.push("getActualVsProjected not found");
  if (!daily) out.push("getDailyPrediction not found");
  if (!/export async function getDailyExpenseItems\(/.test(service)) out.push("getDailyExpenseItems (the one expense source) not exported");
  if (avp && /FROM accounting\.bills\b/.test(avp)) out.push("getActualVsProjected reads accounting.bills directly (bills-only projection → $0 days)");
  if (avp && !/getDailyExpenseItems\(/.test(avp)) out.push("getActualVsProjected does not read the daily engine (getDailyExpenseItems)");
  if (daily && !/getDailyExpenseItems\(/.test(daily)) out.push("getDailyPrediction does not read getDailyExpenseItems (two sources would drift)");
  if (avp && !/projected_expense_cents/.test(avp)) out.push("getActualVsProjected does not read the snapshot's projected_expense_cents for past days");
  if (avp && !/"not_captured"/.test(avp)) out.push('a past day without an expense snapshot is not marked "not_captured"');
  if (!/projected_expense_cents/.test(cron) || !/expense_subtotal_cents/.test(cron)) out.push("snapshot cron does not capture expense_subtotal_cents into projected_expense_cents");
  return out;
}

function selftest(service, cron) {
  const plants = [
    ["AvP reads bills directly", service.replace("export async function getActualVsProjected(", "export async function getActualVsProjected(/* FROM accounting.bills b */")],
    ["AvP stops reading the engine", service.replace(/(export async function getActualVsProjected\([\s\S]*?)getDailyExpenseItems\(/, "$1getNothing(")],
    ["daily prediction gets its own expense query", service.replace(/(export async function getDailyPrediction\([\s\S]*?)getDailyExpenseItems\(/, "$1ownExpenseQuery(")],
    ["not_captured removed", service.split('"not_captured"').join('"snapshot"')],
  ];
  let caught = 0;
  for (const [name, planted] of plants) {
    const hit = findDefects(planted, cron).length > 0;
    console.log(`${hit ? "ok  " : "MISS"}  plant: ${name}`);
    if (hit) caught++;
  }
  const cronHit = findDefects(service, cron.split("expense_subtotal_cents").join("income_subtotal_cents")).length > 0;
  console.log(`${cronHit ? "ok  " : "MISS"}  plant: cron stops capturing expense`);
  if (cronHit) caught++;
  const total = plants.length + 1;
  console.log(`${LABEL} SELFTEST: ${caught}/${total} planted defects caught`);
  process.exit(caught === total ? 0 : 1);
}

const service = readFileSync(path.join(ROOT, SERVICE), "utf8");
const cron = readFileSync(path.join(ROOT, CRON), "utf8");
if (process.argv.includes("--selftest")) selftest(service, cron);
const defects = findDefects(service, cron);
if (defects.length) {
  console.error(`${LABEL} FAIL:\n - ${defects.join("\n - ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — AvP projected expense reads the daily engine; past days read the snapshot or say not_captured; cron captures expense`);
