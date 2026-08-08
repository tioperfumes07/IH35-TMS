#!/usr/bin/env node
/**
 * GUARD: a load-bookended settlement may only be reused while its ANCHOR LOAD is still live. ACCT-F266.
 *
 * Reuse is the point of the bookend model — one open settlement spans a driver's trip and later loads
 * attach to it. The bug was that reuse asked only "does this driver have an open bookend settlement?",
 * so a settlement whose first_load_id load had been CANCELLED or SOFT-DELETED kept absorbing every
 * future load for that driver.
 *
 * IT CANNOT SELF-HEAL, which is why a guard is warranted rather than a one-off data fix:
 * `trip_closed_at` is set by the load-bookend CLOSE path, and that path never fires for a dead load. The
 * settlement is open by accident, nothing will ever close it, and every subsequent load joins it.
 *
 * LIVE CONSEQUENCE (W3, 5753): orphan S-0099 captured L-20260808-0069 and L-20260808-0074. Both showed
 * $0 driver pay against real delivered freight. The money was not lost — it was attached to a settlement
 * for a trip that no longer exists, which is worse, because the paperwork looks complete.
 *
 * THE GUARD DEMANDS THE ANCHOR CHECK, NOT MERELY "SOME FILTER". A tempting narrower fix — refusing reuse
 * whenever first_load_id differs from the incoming load — would break the bookend model outright, since
 * a second load attaching to an open trip is exactly what it is for. So this asserts the reuse query
 * requires a LIVE first load (not soft-deleted, not cancelled) and refuses an anchor-less settlement.
 *
 * Run:  node scripts/verify-no-orphan-bookend-settlement-reuse.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SVC = "apps/backend/src/driver-finance/settlements-load-bookended.service.ts";
const LABEL = "verify-no-orphan-bookend-settlement-reuse";

/** Strips JS and SQL comments — an explanatory `-- …` must never count as the check itself. */
export function stripComments(src) {
  return src
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\n]*/g, "");
}

/** Isolate the reuse SELECT against driver_settlements that gates trip_closed_at IS NULL. */
export function reuseQuery(src) {
  const clean = stripComments(src);
  const m = /SELECT[\s\S]{0,200}?FROM\s+driver_finance\.driver_settlements[\s\S]{0,1400}?FOR\s+UPDATE/i.exec(clean);
  return m ? m[0] : null;
}

export function collectProblems(src) {
  const problems = [];
  const q = reuseQuery(src);
  if (!q) {
    problems.push(
      `${SVC}: the bookend reuse SELECT was not found. If it moved, move this guard with it — an ` +
        `unparsed reuse path must not read as a pass (ACCT-F266).`
    );
    return problems;
  }
  if (!/first_load_id\s+IS\s+NOT\s+NULL/i.test(q)) {
    problems.push(
      `${SVC}: reuse does not require first_load_id IS NOT NULL. A settlement with no anchor load has ` +
        `no trip to continue, so reusing it silently attaches new loads to nothing (ACCT-F266).`
    );
  }
  const checksLive =
    /FROM\s+mdata\.loads/i.test(q) &&
    /soft_deleted_at\s+IS\s+NULL/i.test(q) &&
    /status[\s\S]{0,20}<>\s*'cancelled'/i.test(q);
  if (!checksLive) {
    problems.push(
      `${SVC}: reuse does not verify the anchor load is still LIVE (mdata.loads, soft_deleted_at IS ` +
        `NULL, status <> 'cancelled'). An orphaned settlement never closes — trip_closed_at is set by ` +
        `the close path, which never fires for a dead load — so it absorbs every future load for that ` +
        `driver. Live: S-0099 captured L-20260808-0069 and L-20260808-0074, both showing $0 driver pay ` +
        `on delivered freight (ACCT-F266).`
    );
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];
  const GOOD =
    "SELECT s.id FROM driver_finance.driver_settlements s WHERE s.trip_closed_at IS NULL AND s.first_load_id IS NOT NULL AND EXISTS (SELECT 1 FROM mdata.loads fl WHERE fl.id = s.first_load_id AND fl.soft_deleted_at IS NULL AND fl.status::text <> 'cancelled') ORDER BY s.created_at DESC LIMIT 1 FOR UPDATE";
  const BARE =
    "SELECT id FROM driver_finance.driver_settlements WHERE driver_id = $1 AND trip_closed_at IS NULL ORDER BY created_at DESC LIMIT 1 FOR UPDATE";

  if (collectProblems(GOOD).length !== 0) failures.push("the anchor-checked reuse query was flagged");
  if (collectProblems(BARE).length !== 2) failures.push("the pre-fix query did not raise BOTH problems");
  if (!collectProblems(BARE).some((p) => /still LIVE/.test(p))) {
    failures.push("a reuse query without the live-anchor check was NOT caught");
  }
  // Anchor present but liveness not checked — the half-fix.
  const HALF =
    "SELECT s.id FROM driver_finance.driver_settlements s WHERE s.trip_closed_at IS NULL AND s.first_load_id IS NOT NULL ORDER BY s.created_at DESC LIMIT 1 FOR UPDATE";
  if (!collectProblems(HALF).some((p) => /still LIVE/.test(p))) {
    failures.push("a NOT NULL check without liveness was accepted — that is the half-fix");
  }
  // A comment must not satisfy the liveness check.
  const COMMENT = BARE.replace("WHERE", "WHERE /* soft_deleted_at IS NULL status <> 'cancelled' mdata.loads */");
  if (!collectProblems(COMMENT).some((p) => /still LIVE/.test(p))) {
    failures.push("a comment faked the liveness check — false green");
  }
  if (!collectProblems("const x = 1;").some((p) => /was not found/.test(p))) {
    failures.push("a missing reuse query did not fail closed");
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — 6/6 (anchor-checked passes, pre-fix raises both, missing liveness caught, ` +
      `half-fix caught, comment cannot fake, missing query fails closed)`
  );
  process.exit(0);
}

const p = path.join(root, SVC);
if (!fs.existsSync(p)) {
  console.error(`${LABEL} FAIL — ${SVC} is missing.`);
  process.exit(1);
}
const problems = collectProblems(fs.readFileSync(p, "utf8"));
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} orphan-reuse gap(s):`);
  for (const x of problems) console.error("  ✗ " + x);
  process.exit(1);
}
console.log(`${LABEL} OK — bookend settlement reuse requires a live anchor load.`);
