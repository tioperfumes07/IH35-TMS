#!/usr/bin/env node
/**
 * MAINT-MONEY-F6803A-ROAD-SERVICE-WO-BILL-DUPLICATE-ORPHAN-RACE
 *
 * createWorkOrderFromRoadServiceTicket() pre-read the ticket's wo_id WITHOUT locking the row, then
 * unconditionally created a WO + vendor bill and wrote the backlink with no null-only CAS and no
 * result check. Two concurrent POST /api/v1/road-service-tickets/:id/create-wo calls for the SAME
 * ticket (each its own withCompany transaction) could both see wo_id=NULL, both create a duplicate
 * WO + bill, and the second backlink UPDATE would silently win — orphaning the first WO + bill with
 * no ticket ever pointing back to them (invisible duplicate money-path records).
 *
 * Fix: SELECT ... FOR UPDATE serializes concurrent calls on the same ticket row (a second caller
 * blocks until the first commits, then re-reads with wo_id already set and returns via the
 * already_linked branch, never reaching the create path). The backlink UPDATE additionally CASes
 * on wo_id IS NULL and its rowCount is checked, as defense-in-depth against a bypassed lock.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const FILE = "apps/backend/src/maintenance/road-service/wo-integration.ts";

export function check(src) {
  const failures = [];

  const selectIdx = src.indexOf("FROM maintenance.road_service_tickets");
  const selectEnd = src.indexOf("[input.ticketId, input.operatingCompanyId]", selectIdx);
  const selectBlock = selectIdx >= 0 && selectEnd >= 0 ? src.slice(selectIdx, selectEnd) : "";
  if (!/FOR UPDATE/.test(selectBlock)) {
    failures.push(`${FILE}: ticket SELECT is missing FOR UPDATE — concurrent create-wo calls for the same ticket can both see wo_id=NULL and both create a duplicate WO+bill`);
  }

  const updateIdx = src.indexOf("UPDATE maintenance.road_service_tickets");
  const updateEnd = src.indexOf("bill?.uuid ?? null]", updateIdx);
  const updateBlock = updateIdx >= 0 && updateEnd >= 0 ? src.slice(updateIdx, updateEnd) : "";
  if (!/AND wo_id IS NULL/.test(updateBlock)) {
    failures.push(`${FILE}: backlink UPDATE is missing "AND wo_id IS NULL" — not an active-row compare-and-set, a race can silently overwrite an existing link`);
  }
  if (!/backlink\.rowCount/.test(src) || !/!== 1/.test(src.slice(updateEnd, updateEnd + 300))) {
    failures.push(`${FILE}: backlink UPDATE result is not checked — a 0-row CAS failure (race slipped past the lock) would be silently swallowed instead of throwing`);
  }

  return failures;
}

function run() {
  const src = fs.readFileSync(path.join(root, FILE), "utf8");
  const failures = check(src);
  if (failures.length > 0) {
    console.error("FAIL: road-service-wo-bill-race-locked");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: road-service create-wo locks the ticket row before reading wo_id, and CASes + checks the backlink write");
}

function selftest() {
  const src = fs.readFileSync(path.join(root, FILE), "utf8");
  const baseline = check(src);
  if (baseline.length !== 0) {
    console.error("FAIL(selftest): baseline (current HEAD) is not clean:", baseline);
    process.exit(1);
  }

  // Mutation 1: reintroduce the exact pre-fix defect — no row lock.
  const offenderA = src.replace("      LIMIT 1\n      FOR UPDATE\n", "      LIMIT 1\n");
  if (offenderA === src) {
    console.error("FAIL(selftest): offender A mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failuresA = check(offenderA);
  if (failuresA.length === 0) {
    console.error("FAIL(selftest): planted offender (FOR UPDATE removed) was NOT caught");
    process.exit(1);
  }

  // Mutation 2: remove the null-only CAS guard.
  const offenderB = src.replace(
    "        AND operating_company_id = $2::uuid\n        AND wo_id IS NULL\n    `,",
    "        AND operating_company_id = $2::uuid\n    `,"
  );
  if (offenderB === src) {
    console.error("FAIL(selftest): offender B mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failuresB = check(offenderB);
  if (failuresB.length === 0) {
    console.error("FAIL(selftest): planted offender (wo_id IS NULL CAS removed) was NOT caught");
    process.exit(1);
  }

  // Mutation 3: remove the rowCount check.
  const offenderC = src.replace(
    '  if ((backlink.rowCount ?? 0) !== 1) {\n    throw new Error("road_service_ticket_wo_backlink_race");\n  }\n',
    ""
  );
  if (offenderC === src) {
    console.error("FAIL(selftest): offender C mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failuresC = check(offenderC);
  if (failuresC.length === 0) {
    console.error("FAIL(selftest): planted offender (rowCount check removed) was NOT caught");
    process.exit(1);
  }

  console.log("PASS(selftest): all 3 planted regressions correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
