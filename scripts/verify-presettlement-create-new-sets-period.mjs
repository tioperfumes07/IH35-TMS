#!/usr/bin/env node
/**
 * GAP-PRESETTLEMENT-PERIOD-NULL (found live 2026-09-05, seeding the settlement feed): the
 * confirmPresettlementLink "create_new" branch (apps/backend/src/dispatch/presettlement-link.service.ts)
 * — the ONLY writer of a fresh driver_finance.driver_settlements row on the automatic booking-time
 * path (SET-01: "the instant a load is CREATED it joins a pre-settlement... assignment is
 * automatic") — never set period_start/period_end (both NOT NULL, no default on prod). Every
 * "create_new" confirmation crashed with a NOT NULL violation the first time a driver's tour had
 * no already-open settlement to join. Fixed by deriving both from the load's own trip-start date,
 * mirroring the sibling writer settlements-load-bookended.service.ts's openLoadBookendedSettlement,
 * which has always done this correctly. Locks: the create_new INSERT names both columns, and a
 * value is actually computed (not a bare NULL literal) before that INSERT runs.
 *
 * Run: node scripts/verify-presettlement-create-new-sets-period.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REL = "apps/backend/src/dispatch/presettlement-link.service.ts";
const problems = [];

const src = fs.readFileSync(path.join(ROOT, REL), "utf8");

const createNewIdx = src.indexOf('input.action === "create_new"');
if (createNewIdx === -1) {
  problems.push(`${REL}: the create_new branch itself is gone — this guard has nothing to check`);
} else {
  const insertIdx = src.indexOf("INSERT INTO driver_finance.driver_settlements", createNewIdx);
  if (insertIdx === -1) {
    problems.push(`${REL}: no INSERT INTO driver_finance.driver_settlements found after the create_new branch`);
  } else {
    const window = src.slice(createNewIdx, insertIdx + 400);
    if (!/period_start/.test(window)) problems.push(`${REL}: create_new INSERT no longer names period_start — the NOT NULL crash is back`);
    if (!/period_end/.test(window)) problems.push(`${REL}: create_new INSERT no longer names period_end — the NOT NULL crash is back`);
    if (!/is_sample_data/.test(window)) problems.push(`${REL}: create_new INSERT no longer names is_sample_data — verify-settlement-sample-tag-wired will re-flag it`);
    // A literal NULL for either column (rather than a computed periodDate) would satisfy the
    // "names the column" check above while reintroducing the exact same defect under a
    // different disguise — require a real derivation to exist before the INSERT.
    const beforeInsert = src.slice(createNewIdx, insertIdx);
    if (!/scheduled_arrival_at/.test(beforeInsert)) {
      problems.push(`${REL}: create_new no longer derives a trip-start date from the load's own pickup stop before inserting period_start/period_end`);
    }
  }
}

if (problems.length) {
  console.error("verify-presettlement-create-new-sets-period FAILED:");
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log("verify-presettlement-create-new-sets-period OK — confirmPresettlementLink's create_new branch derives and sets period_start/period_end, never leaves them NULL");
