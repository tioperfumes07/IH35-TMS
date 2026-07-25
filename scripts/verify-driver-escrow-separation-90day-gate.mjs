#!/usr/bin/env node
// BLOCK-02 — static guard: the driver-escrow separation return path must (a) check the
// DRIVER_ESCROW_SEPARATION_RETURN_ENABLED flag BEFORE any write, (b) refuse release before the 90-day
// eligible_release_date, and (c) reuse the existing releaseEscrow() (no new GL math introduced here).
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const mathPath = path.join(ROOT, "apps/backend/src/driver-finance/escrow-separation.math.ts");
const servicePath = path.join(ROOT, "apps/backend/src/driver-finance/escrow-separation.service.ts");
const migrationPath = path.join(ROOT, "db/migrations/202607111000_block02_driver_escrow_separation_return.sql");

function fail(message) {
  console.error(`verify:driver-escrow-separation-90day-gate — FAILED\n- ${message}`);
  process.exit(1);
}

for (const file of [mathPath, servicePath, migrationPath]) {
  if (!fs.existsSync(file)) fail(`missing required file: ${file}`);
}

const math = fs.readFileSync(mathPath, "utf8");
const service = fs.readFileSync(servicePath, "utf8");
const migration = fs.readFileSync(migrationPath, "utf8");

if (!math.includes("ESCROW_SEPARATION_HOLD_DAYS = 90")) fail("hold period must be 90 days");
if (!math.includes("export function isEligibleForRelease")) fail("math module must export isEligibleForRelease");

if (!service.includes("isEnabled(client as never, DRIVER_ESCROW_SEPARATION_RETURN_FLAG_KEY")) {
  fail("release function must check the DRIVER_ESCROW_SEPARATION_RETURN_ENABLED flag");
}
if (!service.includes('if (!flagOn) return { result: "skipped_flag_off"')) {
  fail("release function must be a true no-op (zero writes) when the flag is OFF");
}
if (!service.includes("isEligibleForRelease(separation.eligible_release_date)")) {
  fail("release function must gate on the 90-day eligible_release_date before releasing");
}
if (!service.includes('actor.role !== "Owner"')) fail("release function must be Owner-only (money-moving action)");
if (!service.includes("releaseEscrow(")) fail("release function must reuse the existing Block-23 releaseEscrow() — no new GL math");
// SAF-ORPH-01/02 (2026-07-25): posting_type='forfeiture' is now the signed decrement path on
// accounting.apply_escrow_posting_delta (mig 202608070000). Separation RELEASE still uses releaseEscrow();
// this gate must not forbid the forfeit posting_type on unrelated escrow services.

if (!migration.includes("DRIVER_ESCROW_SEPARATION_RETURN_ENABLED") || !migration.includes("false")) {
  fail("migration must seed the flag DEFAULT OFF");
}
if (!migration.includes("GENERATED ALWAYS AS (separation_date + 90)")) {
  fail("eligible_release_date must be a generated column derived from separation_date, never independently settable");
}
if (!migration.includes("FORCE ROW LEVEL SECURITY")) fail("driver_escrow_separations must FORCE RLS");
if (!migration.includes("REVOKE DELETE")) fail("driver_escrow_separations must be void-not-delete (no DELETE grant)");

console.log("verify:driver-escrow-separation-90day-gate — OK");
