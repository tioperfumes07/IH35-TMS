#!/usr/bin/env node
// The factoring + banking KPI engines' operator-facing strings — label, source (shown as hover text and as the drill's
// "Source:" line in LedgerKpiPanel), empty_reason and gl_account — must read in business language: no schema.table names,
// no snake_case column names. verify-no-internal-language-in-prod-ui scans frontend literals and cannot see these, because
// they are produced at runtime by the backend engines. This guard runs both engines (read-only) and checks what they emit.
// Live: fails closed without DATABASE_URL. --selftest plants the shapes that leaked before (2026-10-03).
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
export const REQUIRES_LIVE_DB = "runs the factoring + banking KPI engines read-only to read the strings they emit";

const LABEL = "verify-kpi-provenance-business-language";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const SCHEMA_TABLE = /\b(?:accounting|banking|factoring|catalogs|mdata|driver_finance|fuel|org|identity|views)\.[a-z_]+\b/;
const SNAKE = /\b[a-z]+_[a-z0-9]+(?:_[a-z0-9]+)*\b/;

export function leaks(kpis) {
  const out = [];
  for (const k of kpis) {
    for (const field of ["label", "source", "empty_reason", "gl_account"]) {
      const v = k[field];
      if (typeof v !== "string") continue;
      const m = SCHEMA_TABLE.exec(v) ?? SNAKE.exec(v);
      if (m) out.push(`${k.key}.${field}: "${m[0]}" in "${v.slice(0, 120)}"`);
    }
  }
  return out;
}

if (process.argv.includes("--selftest")) {
  const fails = [];
  if (leaks([{ key: "a", source: "accounting.factoring_purchases (posted, gross_cents)" }]).length !== 1) fails.push("schema.table not caught");
  if (leaks([{ key: "b", source: "bank_transactions review_state = for_review" }]).length !== 1) fails.push("snake_case not caught");
  if (leaks([{ key: "c", empty_reason: "No active escrow_liability_default role" }]).length !== 1) fails.push("role key in a reason not caught");
  if (leaks([{ key: "d", label: "Unmatched inflow", source: "Bank lines still in For Review", gl_account: "2100 Driver Escrow - Held in Trust (+ sub-accounts)" }]).length) fails.push("business language flagged");
  if (fails.length) { console.error(`${LABEL} --selftest FAIL: ${fails.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS 4/4`);
  process.exit(0);
}
if (!process.env.DATABASE_URL) { console.error(`${LABEL}: FAIL — DATABASE_URL not set (live guard fails closed).`); process.exit(1); }
const to = new Date().toISOString().slice(0, 10);
const print = (script) => JSON.parse(execFileSync("npx", ["tsx", path.join(ROOT, script), USMCA, "2026-01-01", to],
  { cwd: ROOT, env: { ...process.env, NODE_NO_WARNINGS: "1" }, encoding: "utf8", maxBuffer: 1 << 24 }));
const all = [...print("scripts/lib/print-factoring-kpis.ts"), ...print("scripts/lib/print-banking-kpis.ts")];
const found = leaks(all);
if (found.length) { console.error(`${LABEL}: FAIL — internal names in operator-facing KPI strings:\n  ${found.join("\n  ")}`); process.exit(1); }
console.log(`${LABEL}: PASS — ${all.length} KPIs: every label, source, empty_reason and GL label reads in business language`);
