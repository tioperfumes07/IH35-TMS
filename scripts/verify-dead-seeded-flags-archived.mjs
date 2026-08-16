#!/usr/bin/env node
/**
 * LV-DEAD-SEEDED-FLAGS ratchet:
 *  1) migration archives PERIODS_INIT / PREPAID_EXPENSES / IFTA_TRIP_METHODOLOGY via archived_at
 *  2) isEnabled returns false when archived_at set; listFlags excludes archived rows
 *  3) no production isEnabled("…") call sites for those three keys outside tests
 *
 * --selftest strips archived_at short-circuit from service and expects FAIL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG =
  "db/migrations/202608161230_archive_dead_seeded_feature_flags.sql";
const SERVICE = "apps/backend/src/lib/feature-flags/service.ts";
const DEAD = [
  "PERIODS_INIT_ENABLED",
  "PREPAID_EXPENSES_ENABLED",
  "IFTA_TRIP_METHODOLOGY_ENABLED",
];

function check() {
  const errors = [];
  const mig = fs.readFileSync(path.join(ROOT, MIG), "utf8");
  if (!/ADD COLUMN IF NOT EXISTS archived_at/.test(mig)) {
    errors.push("migration must add archived_at");
  }
  for (const key of DEAD) {
    if (!mig.includes(`'${key}'`)) errors.push(`migration missing archive of ${key}`);
  }
  const svc = fs.readFileSync(path.join(ROOT, SERVICE), "utf8");
  if (!/if \(flag\.archived_at\) return false/.test(svc)) {
    errors.push("isEnabled must short-circuit on archived_at");
  }
  if (!/WHERE f\.archived_at IS NULL/.test(svc)) {
    errors.push("listFlags must exclude archived_at IS NOT NULL");
  }
  // No product isEnabled("DEAD_KEY") outside tests
  const srcRoot = path.join(ROOT, "apps/backend/src");
  function walk(dir, out = []) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === "node_modules" || ent.name === "__tests__") continue;
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p, out);
      else if (/\.ts$/.test(ent.name) && !ent.name.endsWith(".test.ts")) out.push(p);
    }
    return out;
  }
  for (const abs of walk(srcRoot)) {
    const rel = path.relative(ROOT, abs).replace(/\\/g, "/");
    if (rel.includes("/__tests__/")) continue;
    const src = fs.readFileSync(abs, "utf8");
    for (const key of DEAD) {
      if (new RegExp(`isEnabled\\([^)]*['"]${key}['"]`).test(src)) {
        errors.push(`${rel}: must not call isEnabled(${key})`);
      }
    }
  }
  return errors;
}

function main() {
  const errors = check();
  if (errors.length) {
    console.error("FAIL: verify-dead-seeded-flags-archived");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log("PASS: verify-dead-seeded-flags-archived");
}

function selftest() {
  const abs = path.join(ROOT, SERVICE);
  const original = fs.readFileSync(abs, "utf8");
  const broken = original.replace(
    /if \(flag\.archived_at\) return false;/,
    "/* SELFTEST_REMOVED_ARCHIVE_SHORTCIRCUIT */",
  );
  if (broken === original) {
    console.error("selftest FAIL: could not strip archived_at short-circuit");
    process.exit(1);
  }
  fs.writeFileSync(abs, broken);
  try {
    const errors = check();
    if (!errors.length) {
      console.error("selftest FAIL: expected errors");
      process.exit(1);
    }
    console.log("selftest PASS: stripped short-circuit → FAIL as expected");
  } finally {
    fs.writeFileSync(abs, original);
  }
}

if (process.argv.includes("--selftest")) selftest();
else main();
