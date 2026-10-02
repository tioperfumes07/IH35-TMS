#!/usr/bin/env node
// Lead ROUND 296 §3 — the per-customer Faro reserve (a row per customer) must tie to the GL to the cent: the column total of
// "Reserve now" equals the GL balance of 1230 (Faro Escrow report) + 1235 (Faro Cash report), and the per-invoice drill sums
// to the same figure. A movement not stamped to an invoice appears as its own row, so the total can never silently drift.
// Runs the engine itself (scripts/lib/print-reserve-by-customer.ts, READ ONLY). Live-only: fails closed without DATABASE_URL.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-faro-reserve-by-customer-ties-to-gl";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const TODAY = new Date().toISOString().slice(0, 10);

export function check(r) {
  const problems = [];
  if (!r.ties_to_gl || r.total_reserve_now_cents !== r.gl_balance_cents) {
    problems.push(`per-customer reserve ${r.total_reserve_now_cents} != GL 1230+1235 ${r.gl_balance_cents}`);
  }
  if (r.invoice_total_cents !== r.total_reserve_now_cents) problems.push(`per-invoice drill ${r.invoice_total_cents} != per-customer ${r.total_reserve_now_cents}`);
  return problems;
}

if (process.argv.includes("--selftest")) {
  const ok = { ties_to_gl: true, total_reserve_now_cents: 500, gl_balance_cents: 500, invoice_total_cents: 500 };
  const cases = [
    [check(ok).length === 0, "tying reserve passes"],
    [check({ ...ok, ties_to_gl: false, gl_balance_cents: 501 }).length === 1, "a cent of GL drift fails"],
    [check({ ...ok, invoice_total_cents: 499 }).length === 1, "drill drift fails"],
  ];
  const bad = cases.filter(([pass]) => !pass).map(([, n]) => n);
  if (bad.length) { console.error(`${LABEL} --selftest FAIL: ${bad.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${cases.length}/${cases.length}`);
  process.exit(0);
}

if (!process.env.DATABASE_URL) { console.error(`${LABEL}: FAIL — DATABASE_URL not set (live guard fails closed).`); process.exit(1); }
const r = JSON.parse(execFileSync("npx", ["tsx", path.join(ROOT, "scripts/lib/print-reserve-by-customer.ts"), USMCA, TODAY], { cwd: ROOT, env: process.env, encoding: "utf8" }));
const problems = check(r);
if (problems.length) { console.error(`${LABEL}: FAIL — ${problems.join("; ")}`); process.exit(1); }
console.log(`${LABEL}: PASS — ${r.rows.length} customer row(s); reserve now ${r.total_reserve_now_cents} = GL 1230+1235 ${r.gl_balance_cents} = invoice drill ${r.invoice_total_cents}`);
