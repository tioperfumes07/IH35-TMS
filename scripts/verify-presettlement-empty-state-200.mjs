#!/usr/bin/env node
import { readFileSync } from "node:fs";

const FILE = "apps/backend/src/driver-finance/pre-settlement.routes.ts";
const source = () => readFileSync(FILE, "utf8");

export function failures(src = source()) {
  const out = [];
  const route = src.match(/app\.get\("\/api\/v1\/driver-finance\/pre-settlements\/by-driver\/:driverId"[\s\S]*?\n  \}\);/)?.[0] ?? "";
  if (!route) out.push("by-driver route missing");
  if (!/if \(!settlement\) \{[\s\S]*?settlement: null,[\s\S]*?lines: \[\],[\s\S]*?deductions: \[\],[\s\S]*?reconciliation:/.test(route)) out.push("ordinary empty state is not the complete 200 read-model shape");
  if (/no_active_pre_settlement|reply\.code\(404\)/.test(route)) out.push("ordinary empty route contains a 404 path");
  if (!/result === "schema_absent"/.test(route)) out.push("schema absence is not kept distinct");
  return out;
}

if (process.argv.includes("--selftest")) {
  const good = source();
  if (failures(good).length) throw new Error(`baseline rejected: ${failures(good).join(" | ")}`);
  const bad = good.replace("settlement: null,", 'return reply.code(404).send({ error: "no_active_pre_settlement" }),');
  if (bad === good || failures(bad).length === 0) throw new Error("404 mutation escaped");
}
const found = failures();
if (found.length) { console.error(found.join("\n")); process.exit(1); }
console.log("verify-presettlement-empty-state-200: OK");
