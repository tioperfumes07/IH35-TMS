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

/** Isolate getActiveSettlementForDriver's own SELECT (same shape, no FOR UPDATE — it's a reader). */
export function activeReaderQuery(src) {
  const clean = stripComments(src);
  const fnIdx = clean.indexOf("export async function getActiveSettlementForDriver");
  if (fnIdx === -1) return null;
  const m = /SELECT[\s\S]{0,200}?FROM\s+driver_finance\.driver_settlements[\s\S]{0,600}?LIMIT\s+1/i.exec(
    clean.slice(fnIdx)
  );
  return m ? m[0] : null;
}

/**
 * PINGSETTLEMENT-REUSE-APPROVED-NULL-CLOSE (2026-08-31): trip_closed_at is set by the close path
 * ATOMICALLY WITH status='closed' — but status can also reach a terminal value (approved/paid/
 * locked/final/closed) through a DIFFERENT code path that was never audited for whether it also
 * stamps trip_closed_at. Live-proven: S-20260816-0168 sits at status='approved' with
 * trip_closed_at still NULL, and the OLD blacklist (`status <> 'cancelled'`) handed that
 * already-approved, already-paid-out settlement back for a brand-new trip instead of opening one.
 * A whitelist on the literal 'open' status — the ONLY value the INSERT itself ever creates a
 * fresh row with — cannot be fooled by any future terminal status, known or not.
 */
function checksOpenOnly(q) {
  return /status\s*=\s*'open'/i.test(q) && !/status\s*<>\s*'cancelled'/i.test(q);
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
  if (!checksOpenOnly(q)) {
    problems.push(
      `${SVC}: reuse does not whitelist status = 'open' on the settlement itself (or still carries the ` +
        `old status <> 'cancelled' blacklist). trip_closed_at alone is not a reliable "still open" ` +
        `signal — live: S-20260816-0168 reached status='approved' with trip_closed_at NULL, and the ` +
        `blacklist handed that already-approved settlement back as if it were open ` +
        `(PINGSETTLEMENT-REUSE-APPROVED-NULL-CLOSE).`
    );
  }
  const reader = activeReaderQuery(src);
  if (!reader) {
    problems.push(
      `${SVC}: getActiveSettlementForDriver's own SELECT was not found. If it moved, move this guard ` +
        `with it (PINGSETTLEMENT-REUSE-APPROVED-NULL-CLOSE).`
    );
  } else if (!checksOpenOnly(reader)) {
    problems.push(
      `${SVC}: getActiveSettlementForDriver does not whitelist status = 'open' either — same gap as the ` +
        `reuse query, same fix required (PINGSETTLEMENT-REUSE-APPROVED-NULL-CLOSE).`
    );
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];
  const GOOD_REUSE =
    "SELECT s.id FROM driver_finance.driver_settlements s WHERE s.trip_closed_at IS NULL AND s.status = 'open' AND s.voided_at IS NULL AND s.first_load_id IS NOT NULL AND EXISTS (SELECT 1 FROM mdata.loads fl WHERE fl.id = s.first_load_id AND fl.soft_deleted_at IS NULL AND fl.status::text <> 'cancelled') ORDER BY s.created_at DESC LIMIT 1 FOR UPDATE";
  const GOOD_READER =
    "export async function getActiveSettlementForDriver(client, input) { const res = await client.query(`SELECT id, display_id FROM driver_finance.driver_settlements WHERE driver_id = $1 AND trip_closed_at IS NULL AND status = 'open' AND voided_at IS NULL ORDER BY created_at DESC LIMIT 1`); }";
  const GOOD = `${GOOD_REUSE}\n${GOOD_READER}`;
  const BARE_REUSE =
    "SELECT id FROM driver_finance.driver_settlements WHERE driver_id = $1 AND trip_closed_at IS NULL ORDER BY created_at DESC LIMIT 1 FOR UPDATE";
  const BARE = `${BARE_REUSE}\n${GOOD_READER}`;

  if (collectProblems(GOOD).length !== 0) failures.push("the fully-fixed reuse+reader queries were flagged");
  if (!collectProblems(BARE).some((p) => /still LIVE/.test(p))) {
    failures.push("a reuse query without the live-anchor check was NOT caught");
  }
  if (!collectProblems(BARE).some((p) => /first_load_id IS NOT NULL/.test(p))) {
    failures.push("a reuse query without first_load_id IS NOT NULL was NOT caught");
  }
  if (!collectProblems(BARE).some((p) => /whitelist status = 'open' on the settlement itself/.test(p))) {
    failures.push("a reuse query without status = 'open' was NOT caught");
  }
  // Anchor present but liveness not checked — the half-fix.
  const HALF =
    `SELECT s.id FROM driver_finance.driver_settlements s WHERE s.trip_closed_at IS NULL AND s.status = 'open' AND s.first_load_id IS NOT NULL ORDER BY s.created_at DESC LIMIT 1 FOR UPDATE\n${GOOD_READER}`;
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
  // PINGSETTLEMENT-REUSE-APPROVED-NULL-CLOSE: reverting status='open' back to the old blacklist
  // must be caught on BOTH the reuse query and the reader, independently.
  const REGRESSED_REUSE = GOOD_REUSE.replace("s.status = 'open'", "s.status <> 'cancelled'");
  const REGRESSED = `${REGRESSED_REUSE}\n${GOOD_READER}`;
  if (!collectProblems(REGRESSED).some((p) => /whitelist status = 'open' on the settlement itself/.test(p))) {
    failures.push("reverting the reuse query's whitelist back to the old blacklist was NOT caught");
  }
  const REGRESSED_READER = GOOD_READER.replace("status = 'open'", "status <> 'cancelled'");
  const REGRESSED2 = `${GOOD_REUSE}\n${REGRESSED_READER}`;
  if (!collectProblems(REGRESSED2).some((p) => /getActiveSettlementForDriver does not whitelist/.test(p))) {
    failures.push("reverting the reader's whitelist back to the old blacklist was NOT caught");
  }
  const NO_READER = GOOD_REUSE;
  if (!collectProblems(NO_READER).some((p) => /own SELECT was not found/.test(p))) {
    failures.push("a missing getActiveSettlementForDriver reader was not caught");
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — 10/10 (fully-fixed passes, missing liveness/anchor/open-whitelist each ` +
      `caught, half-fix caught, comment cannot fake, missing reuse query fails closed, blacklist ` +
      `regression caught on both reuse+reader independently, missing reader fails closed)`
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
