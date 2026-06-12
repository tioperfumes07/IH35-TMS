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

["remittance_details", "fee_schedule", "reserve_schedule", "fee_application_mode", "notes"].forEach(col => {
  if (!migSrc.includes(col)) fail(`migration missing column: ${col}`);
  pass(`migration column: ${col}`);
});

if (!migSrc.includes("factoring.set_updated_at")) fail("updated_at trigger function missing");
pass("updated_at trigger function");

if (!migSrc.includes("NULLIF")) fail("NULLIF RLS pattern missing");
pass("NULLIF RLS pattern");

if (!migSrc.includes("factor_profile_id")) fail("factor_profile_id FK on accounting.invoices missing");
pass("factor_profile_id on accounting.invoices");

if (!migSrc.includes("ON DELETE SET NULL")) fail("ON DELETE SET NULL for factor_profile_id missing");
pass("ON DELETE SET NULL (non-destructive)");

if (!migSrc.includes("CHECK (fee_application_mode IN")) fail("fee_application_mode CHECK constraint missing from migration");
pass("fee_application_mode CHECK constraint in migration");

// ── 2. tier validator module ───────────────────────────────────────────────────
const VALIDATOR = "apps/backend/src/factoring/factor-tier-validator.ts";
const valSrc = read(VALIDATOR);
if (!valSrc) fail(`tier validator missing: ${VALIDATOR}`);
pass("tier validator exists");

["validateFeeSchedule", "validateReserveSchedule", "validateFeeApplicationMode"].forEach(fn => {
  if (!valSrc.includes(fn)) fail(`tier validator missing function: ${fn}`);
  pass(`tier validator exports: ${fn}`);
});

if (!valSrc.includes("from_day") || !valSrc.includes("to_day")) fail("tier validator does not check from_day/to_day fields");
pass("tier validator checks from_day/to_day");

if (!valSrc.includes("contiguous") && !valSrc.includes("gap")) fail("tier validator does not enforce contiguity (no gap/overlap message)");
pass("tier validator enforces contiguity");

if (!valSrc.includes("from_day !== 0") && !valSrc.includes("from_day === 0") && !valSrc.includes("from_day != 0")) fail("tier validator does not enforce start at day 0");
pass("tier validator enforces start at day 0");

if (!valSrc.includes("TierValidationError")) fail("tier validator missing TierValidationError class");
pass("TierValidationError class present");

if (!valSrc.includes("replace") || !valSrc.includes("segmented") || !valSrc.includes("additive")) fail("FEE_APPLICATION_MODES enum values missing from validator");
pass("fee_application_mode enum values present");

// ── 3. routes: tier validation wired ─────────────────────────────────────────
const ROUTES = "apps/backend/src/factoring/factor.routes.ts";
const routesSrc = read(ROUTES);
if (!routesSrc) fail(`routes missing: ${ROUTES}`);

["validateFeeSchedule", "validateReserveSchedule", "validateFeeApplicationMode"].forEach(fn => {
  if (!routesSrc.includes(fn)) fail(`routes do not call ${fn}`);
  pass(`routes wire: ${fn}`);
});

if (!routesSrc.includes("fee_schedule") || !routesSrc.includes("reserve_schedule")) fail("routes do not accept fee_schedule / reserve_schedule");
pass("routes accept fee_schedule + reserve_schedule");

// ── 4. spine emits ────────────────────────────────────────────────────────────
check(ROUTES, "appendCrudAudit", "spine emit imported in routes");
check(ROUTES, "factoring.factor.created", "spine event: factor.created");
check(ROUTES, "factoring.factor.updated", "spine event: factor.updated");
check(ROUTES, "factoring.factor.deactivated", "spine event: factor.deactivated");
check(ROUTES, "factoring.customer_assignment.created", "spine event: customer_assignment.created");

// ── 5. no hard deletes ────────────────────────────────────────────────────────
if (/DELETE FROM factoring\.(factor|customer_factor_assignment)/i.test(routesSrc)) {
  fail("hard DELETE found in factor.routes.ts — must be soft/deactivate only");
}
pass("no hard deletes in routes");

// ── 6. role-gating preserved ─────────────────────────────────────────────────
if (!routesSrc.includes("canMutate")) fail("canMutate role-gate missing from routes");
pass("canMutate role-gate present");

// ── 7. no financial write fields in migration ─────────────────────────────────
if (migSrc.includes("amount_cents") || migSrc.includes("payment_amount")) {
  fail("migration must not contain financial write fields");
}
pass("no financial write fields in migration");

// ── 8. flat-rate fallback: flat columns not dropped ───────────────────────────
if (migSrc.includes("DROP COLUMN") && (migSrc.includes("fee_rate") || migSrc.includes("reserve_rate"))) {
  fail("migration drops flat fee_rate / reserve_rate — must be kept as fallback");
}
pass("flat fee_rate + reserve_rate preserved (not dropped)");

console.log("\n[verify-factoring-profile] ALL CHECKS PASSED");
