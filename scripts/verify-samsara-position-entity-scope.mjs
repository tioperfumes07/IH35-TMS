#!/usr/bin/env node
// 0091-c2-3 regression guard.
//
// The Samsara position poll worker UPSERTs each unit's live position keyed by operating_company_id.
// A unit's OPERATING entity is the current lessee (TRANSP/USMCA) when on lease, else the owner (TRK).
// Reading a bare `owner_company_id` attributed every leased unit's position to the asset-holder, so an
// RLS-scoped read by the operating carrier could not see its own trucks (a cross-entity leak that only
// surfaces at USMCA launch). Correct attribution:
//   COALESCE(u.currently_leased_to_company_id, u.owner_company_id).
//
// Fails if the worker regresses to a bare owner_company_id operator attribution.
// Wired into verify:pre-commit via scripts/verify-steps/115-verify-samsara-position-entity-scope.mjs.
// Self-test: node scripts/verify-samsara-position-entity-scope.mjs --selftest
// LINKAGE: N/A (enforcement infra). Additive only.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/backend/src/jobs/samsara-position-poll-worker.ts";

const COALESCE_RE =
  /COALESCE\(\s*u\.currently_leased_to_company_id\s*,\s*u\.owner_company_id\s*\)\s*::text\s+AS\s+operating_company_id/i;
const BARE_OWNER_RE = /u\.owner_company_id\s*::text\s+AS\s+operating_company_id/i;

export function check(src) {
  const flat = src.replace(/\s+/g, " ");
  const failures = [];
  if (!COALESCE_RE.test(flat)) {
    failures.push(
      "missing COALESCE(currently_leased_to_company_id, owner_company_id)::text AS operating_company_id — leased units would be mis-attributed to the asset-holder entity",
    );
  }
  if (BARE_OWNER_RE.test(flat)) {
    failures.push(
      "found bare `owner_company_id::text AS operating_company_id` — a unit's operating entity is the lessee when on lease; use COALESCE(currently_leased_to_company_id, owner_company_id)",
    );
  }
  return failures;
}

export function run() {
  const src = fs.readFileSync(path.join(ROOT, TARGET), "utf8");
  return check(src);
}

if (process.argv.includes("--selftest")) {
  const good =
    "SELECT u.id::text AS unit_uuid, COALESCE(u.currently_leased_to_company_id, u.owner_company_id)::text AS operating_company_id FROM mdata.units u";
  const bad = "SELECT u.id::text AS unit_uuid, u.owner_company_id::text AS operating_company_id FROM mdata.units u";
  const checks = [
    ["canonical operator-attribution passes", check(good).length === 0],
    ["bare owner attribution is caught", check(bad).length > 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("verify:samsara-position-entity-scope --selftest FAIL:");
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`verify:samsara-position-entity-scope --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = run();
  if (failures.length) {
    console.error("verify:samsara-position-entity-scope FAIL:");
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log("verify:samsara-position-entity-scope PASS (positions scoped to operating entity)");
}
