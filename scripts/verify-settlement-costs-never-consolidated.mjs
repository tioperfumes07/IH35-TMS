#!/usr/bin/env node
import { readFileSync } from "node:fs";

const FILE = "apps/backend/src/driver-finance/pre-settlement.routes.ts";
const source = () => readFileSync(FILE, "utf8");

export function failures(src = source()) {
  const out = [];
  const detail = src.match(/app\.get\("\/api\/v1\/driver-finance\/pre-settlements\/by-driver\/:driverId"[\s\S]*?\n  \}\);/)?.[0] ?? "";
  if (!/SELECT id, line_type, description, amount, created_at[\s\S]*?AND is_active = true[\s\S]*?ORDER BY created_at ASC/.test(detail)) out.push("detail does not return individual active cost rows in stable order");
  if (/SELECT[\s\S]{0,180}(SUM\(|GROUP BY)[\s\S]{0,500}FROM driver_finance\.settlement_lines/.test(detail)) out.push("detail consolidates settlement cost rows in SQL");
  if (!/lines: linesRes\.rows,[\s\S]*?deductions,[\s\S]*?reconciliation:/.test(detail)) out.push("detail payload omits raw lines, deductions, or reconciliation");
  return out;
}

if (process.argv.includes("--selftest")) {
  const good = source();
  if (failures(good).length) throw new Error(`baseline rejected: ${failures(good).join(" | ")}`);
  const bad = good.replace("SELECT id, line_type, description, amount, created_at", "SELECT line_type, SUM(amount) AS amount").replace("ORDER BY created_at ASC", "GROUP BY line_type");
  if (bad === good || failures(bad).length === 0) throw new Error("consolidation mutation escaped");
}
const found = failures();
if (found.length) { console.error(found.join("\n")); process.exit(1); }
console.log("verify-settlement-costs-never-consolidated: OK");
