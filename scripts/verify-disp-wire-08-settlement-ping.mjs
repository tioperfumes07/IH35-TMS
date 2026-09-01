#!/usr/bin/env node
/**
 * GUARD — verify-disp-wire-08-settlement-ping (CLS-DISP-WIRE-08, Phase 1 hop 9)
 *
 * THE HOP
 * A load's status change drives the driver's settlement window: `in_transit` OPENS a load-bookended
 * settlement, `delivered_pending_docs` CLOSES it. That window is what a driver is eventually paid
 * against, so the failure modes here are payroll failures, not UI ones:
 *
 *   - a TEAM load that opens a settlement for only the primary driver silently strands the
 *     secondary driver's work outside any settlement — they do not get paid for that load;
 *   - an unscoped load read would let one operating company's status change open a settlement
 *     against another company's driver;
 *   - a soft-deleted load still driving settlements would resurrect cancelled work as payable;
 *   - losing either the open or the close arm leaves settlements that never start, or never end.
 *
 * driver_finance.driver_settlements is 0 rows on prod — this path has never run end to end. That is
 * exactly when a guard is worth the most: the first real execution will be against live driver pay.
 *
 * METHOD: comments and string literals stripped before asserting; --selftest mutates the REAL source
 * and requires every assertion to trip.
 */
import { readFileSync } from "node:fs";

const LABEL = "verify-disp-wire-08-settlement-ping";
const SVC = "apps/backend/src/driver-finance/settlements-load-bookended.service.ts";

function stripCommentsAndStrings(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/`(?:\\[\s\S]|[^\\`])*`/g, "``")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
}
function stripCommentsOnly(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * The ping function body ONLY — bounded at its closing brace, not at the next `export`.
 * pingSettlementOnLoadEvent is the last export in the file, so slicing to the next export ran to EOF
 * and swept in later helpers whose own SQL satisfied these assertions. The selftest caught that.
 */
function pingFn(src) {
  const start = src.indexOf("export async function pingSettlementOnLoadEvent");
  if (start === -1) return "";
  const end = src.indexOf("\n}", start);
  return src.slice(start, end === -1 ? src.length : end + 2);
}

function check(raw) {
  const code = stripCommentsAndStrings(raw);
  const withStrings = stripCommentsOnly(raw);
  const fn = pingFn(code);
  const fnStr = pingFn(withStrings);
  const errors = [];

  if (!fn) {
    errors.push(`${SVC}: pingSettlementOnLoadEvent not found — the settlement hop is gone`);
    return errors;
  }

  // 1. Entity scoping + soft-delete respect on the load read.
  if (!/operating_company_id\s*=\s*\$2/.test(fnStr)) {
    errors.push(
      `${SVC}: the load read is not scoped by operating_company_id — one company's status change ` +
        `could open a settlement against another company's driver`
    );
  }
  if (!/soft_deleted_at\s+IS\s+NULL/i.test(fnStr)) {
    errors.push(`${SVC}: the load read ignores soft_deleted_at — a cancelled load could drive driver pay`);
  }

  // 2. TEAM loads must settle BOTH drivers.
  if (!/primaryDriverId/.test(fn) || !/secondaryDriverId/.test(fn)) {
    errors.push(
      `${SVC}: the team branch no longer opens settlements for BOTH drivers — the secondary driver's ` +
        `work would fall outside any settlement and go unpaid`
    );
  }
  if (!/openLoadBookendedSettlement\s*\(\s*client\s*,\s*\{\s*driverId:\s*team\.primaryDriverId\s*,/.test(fn)) {
    errors.push(`${SVC}: the team primary driver is not passed to its own settlement-open call`);
  }
  if (!/openLoadBookendedSettlement\s*\(\s*client\s*,\s*\{\s*driverId:\s*team\.secondaryDriverId\s*,/.test(fn)) {
    errors.push(`${SVC}: the team secondary driver is not passed to its own settlement-open call — team pay would be duplicated to primary`);
  }
  const teamOpens = (fn.match(/openLoadBookendedSettlement\s*\(/g) ?? []).length;
  if (teamOpens < 3) {
    errors.push(
      `${SVC}: expected three openLoadBookendedSettlement call sites (team primary, team secondary, ` +
        `solo) — found ${teamOpens}. A missing one means a driver never gets a settlement window.`
    );
  }

  // 3. Solo fallback must consider the secondary driver too.
  if (!/primary\s*\?\?\s*secondary/.test(fn)) {
    errors.push(
      `${SVC}: the solo path no longer falls back to the secondary driver — a load assigned only to a ` +
        `secondary driver would silently produce no settlement`
    );
  }

  // 4. Both arms of the window.
  if (!/in_transit/.test(fnStr)) {
    errors.push(`${SVC}: the in_transit OPEN arm is gone — settlements would never start`);
  }
  if (!/delivered_pending_docs/.test(fnStr)) {
    errors.push(`${SVC}: the delivered_pending_docs CLOSE arm is gone — settlements would never end`);
  }
  if (!/closeSettlementForFinalLoad\s*\(/.test(fn)) {
    errors.push(`${SVC}: closeSettlementForFinalLoad is not called — the settlement window never closes`);
  }
  return errors;
}

function selftest() {
  const real = readFileSync(SVC, "utf8");
  const baseline = check(real);
  if (baseline.length) {
    console.error(`${LABEL} --selftest FAIL — real source does not pass:`);
    for (const e of baseline) console.error(`  - ${e}`);
    process.exit(1);
  }

  const mutations = [
    // Anchor on ping's OWN query: an identical WHERE clause exists in an earlier function, and a
    // plain .replace() hit that one instead, leaving ping untouched. The selftest caught it.
    ["entity scoping dropped", (s) =>
      s.replace(
        /SELECT assigned_primary_driver_id, assigned_secondary_driver_id, team_id\s*\n\s*FROM mdata\.loads\s*\n\s*WHERE id = \$1 AND operating_company_id = \$2(?:::uuid)? AND soft_deleted_at IS NULL/,
        "SELECT assigned_primary_driver_id, assigned_secondary_driver_id, team_id\n      FROM mdata.loads\n      WHERE id = $1"
      )],
    ["soft-deleted loads included", (s) =>
      s.replace(
        /SELECT assigned_primary_driver_id, assigned_secondary_driver_id, team_id\s*\n\s*FROM mdata\.loads\s*\n\s*WHERE id = \$1 AND operating_company_id = \$2(?:::uuid)? AND soft_deleted_at IS NULL/,
        "SELECT assigned_primary_driver_id, assigned_secondary_driver_id, team_id\n      FROM mdata.loads\n      WHERE id = $1 AND operating_company_id = $2"
      )],
    ["secondary team driver unpaid", (s) => s.replace(/driverId: team\.secondaryDriverId,/, "driverId: team.primaryDriverId,").replace("secondaryDriverId", "primaryDriverId")],
    ["solo fallback removed", (s) => s.replace("const settlementDriverId = primary ?? secondary;", "const settlementDriverId = primary;")],
    ["close arm removed", (s) => s.replace(/await closeSettlementForFinalLoad\(/, "await noop(")],
  ];

  for (const [name, mutate] of mutations) {
    const broken = mutate(real);
    if (broken === real) {
      console.error(`${LABEL} --selftest FAIL — mutation "${name}" changed nothing (guard is stale).`);
      process.exit(1);
    }
    if (check(broken).length === 0) {
      console.error(`${LABEL} --selftest FAIL — mutation "${name}" was NOT detected.`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS — ${mutations.length} mutations all detected.`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const errors = check(readFileSync(SVC, "utf8"));
if (errors.length) {
  console.error(`${LABEL} FAIL — ${errors.length} problem(s) on the load→settlement hop:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `${LABEL} PASS — the settlement window opens at in_transit and closes at delivered_pending_docs, ` +
    `entity-scoped, soft-delete aware, and both team drivers get a settlement.`
);
