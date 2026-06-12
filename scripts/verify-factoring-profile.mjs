#!/usr/bin/env node
import fs from "fs";
import path from "path";

const ROOT = new URL("..", import.meta.url).pathname;
const pass = (msg) => console.log(`[verify-factoring-profile] PASS: ${msg}`);
const fail = (msg) => { console.error(`[verify-factoring-profile] FAIL: ${msg}`); process.exit(1); };

function read(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, "utf8");
}
function check(rel, pattern, label) {
  const src = read(rel);
  if (!src) fail(`file missing: ${rel}`);
  if (!(pattern instanceof RegExp ? pattern.test(src) : src.includes(pattern)))
    fail(`${label} — not found in ${rel}`);
  pass(label);
}

// ── 1. migration ──────────────────────────────────────────────────────────────
const MIG = "db/migrations/202606120400_c2_factoring_profile.sql";
const migSrc = read(MIG);
if (!migSrc) fail(`migration missing: ${MIG}`);
pass("migration exists");

if (!migSrc.includes("remittance_details")) fail("remittance_details column missing");
pass("remittance_details column");

if (!migSrc.includes("fee_schedule")) fail("fee_schedule column missing");
pass("fee_schedule column");

if (!migSrc.includes("factoring.set_updated_at")) fail("updated_at trigger function missing");
pass("updated_at trigger function");

if (!migSrc.includes("NULLIF")) fail("NULLIF RLS pattern missing");
pass("NULLIF RLS pattern");

if (!migSrc.includes("factor_profile_id")) fail("factor_profile_id link on invoices missing");
pass("factor_profile_id on accounting.invoices");

if (!migSrc.includes("ON DELETE SET NULL")) fail("ON DELETE SET NULL for factor_profile_id missing");
pass("ON DELETE SET NULL (non-destructive)");

// ── 2. spine emits in routes ─────────────────────────────────────────────────
const ROUTES = "apps/backend/src/factoring/factor.routes.ts";
check(ROUTES, "appendCrudAudit", "spine emit imported");
check(ROUTES, "factoring.factor.created", "spine event: factor.created");
check(ROUTES, "factoring.factor.updated", "spine event: factor.updated");
check(ROUTES, "factoring.factor.deactivated", "spine event: factor.deactivated");
check(ROUTES, "factoring.customer_assignment.created", "spine event: customer_assignment.created");

// ── 3. no hard deletes ────────────────────────────────────────────────────────
const routesSrc = read(ROUTES);
if (/DELETE FROM factoring\.(factor|customer_factor_assignment)/i.test(routesSrc || "")) {
  fail("hard DELETE found in factor.routes.ts — must be soft/deactivate only");
}
pass("no hard deletes in routes");

// ── 4. no financial write fields ──────────────────────────────────────────────
if ((migSrc.includes("amount_cents") || migSrc.includes("payment_amount"))) {
  fail("migration must not contain financial write fields");
}
pass("no financial write fields in migration");

console.log("\n[verify-factoring-profile] ALL CHECKS PASSED");
