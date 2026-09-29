#!/usr/bin/env node
/**
 * verify-open-tour-posts-nothing — ACC-50 REMOVED (claude/00-SEAT-CONTRACT.md §3 corollary, owner
 * ruling 2026-09-29): "an expense on an open load posts on its transaction date. No guard may
 * block a post because a tour is open. Cost attribution to a load is a reporting join, never a
 * posting delay. What is worth guarding is that the posted expense is linked to its load."
 *
 * This guard used to assert the OPPOSITE: that every posting call site gated on the load's tour
 * status before posting. Section 9 of the seat contract is explicit: "A guard that contradicts
 * Section 3 or 4 is wrong and gets rewritten, never bypassed." Rewritten (not deleted, not
 * bypassed) to the new invariant: the removed gate never comes back as a regression.
 *
 * STATIC HALF: none of expenses.routes.ts, checks/check-create.service.ts, bill-gl.service.ts, or
 * bill-gl-draft.routes.ts call expenseOpenTourLoadId(...)/billOpenTourLoadId(...) to gate a post.
 * tour-open-gate.service.ts itself, and its remaining legitimate consumer
 * (tour-close-posting.service.ts's postHeldDocumentsForClosedTour, a historical drain for rows
 * that were held under the OLD law and still carry posting_hold_reason='tour_open'), are untouched
 * -- isLoadTourOpen is not deleted, only stopped from ever blocking a NEW post.
 *
 * --selftest: proves the check asserts the regression — runs against the REAL files (expect clean)
 * and again against a MUTANT with the gate call re-added to bill-gl.service.ts (expect FAIL).
 *
 * LIVE HALF (DEGRADE-SAFE, opt-in OPEN_TOUR_POSTS_NOTHING_LIVE=1): shrink-only ratchet on how many
 * accounting.expenses rows still carry the now-meaningless posting_hold_reason='tour_open' from
 * before this law changed -- tracks the historical backlog draining toward 0, never a block.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
export const REQUIRES_LIVE_DB = false;
export const ALLOW_OFFLINE_SKIP =
  "the static half (no posting call site gates on load-tour status) is the real, always-run enforcement now; the live half is an opt-in, shrink-only backlog tracker for historical posting_hold_reason='tour_open' rows, not a blocking check -- ACC-50 removed, claude/00-SEAT-CONTRACT.md §3";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-open-tour-posts-nothing";
const EXPENSES_ROUTES = path.join(ROOT, "apps", "backend", "src", "accounting", "expenses.routes.ts");
const CHECK_CREATE_SERVICE = path.join(ROOT, "apps", "backend", "src", "accounting", "checks", "check-create.service.ts");
const BILL_GL_SERVICE = path.join(ROOT, "apps", "backend", "src", "accounting", "bill-gl.service.ts");
const BILL_GL_DRAFT_ROUTES = path.join(ROOT, "apps", "backend", "src", "accounting", "bill-gl-draft.routes.ts");
const GATE_FILES = [EXPENSES_ROUTES, CHECK_CREATE_SERVICE, BILL_GL_SERVICE, BILL_GL_DRAFT_ROUTES];

// Shrink-only ratchet, non-voided rows only (a voided row is terminal and irrelevant here -- 93
// separate voided expenses also carry this stale value and are excluded on purpose). Measured live
// 2026-09-30, immediately after removing the gate from code: 9 non-voided accounting.expenses rows
// still carry posting_hold_reason='tour_open' from the OLD law (AUTH-131 held them correctly under
// ACC-50 before this ruling). Never grows -- lower it as they drain via retryHeldExpensePostings,
// which no longer respects this value as a block.
const KNOWN_STALE_TOUR_OPEN_HOLDS = 9;

function checkNoGateCall(file, src) {
  const failures = [];
  if (/expenseOpenTourLoadId\(|billOpenTourLoadId\(/.test(src)) {
    failures.push(`${path.relative(ROOT, file)} still calls the removed open-tour gate to decide whether to post`);
  }
  return failures;
}

function checkStatic() {
  const failures = [];
  for (const f of GATE_FILES) {
    if (!fs.existsSync(f)) {
      failures.push(`missing: ${path.relative(ROOT, f)}`);
      continue;
    }
    failures.push(...checkNoGateCall(f, fs.readFileSync(f, "utf8")));
  }
  return failures;
}

function selftest() {
  const realFailures = checkStatic();
  if (realFailures.length) {
    for (const f of realFailures) console.error(`${LABEL} --selftest FAIL — real files flagged: ${f}`);
    return 1;
  }
  console.log(`${LABEL} --selftest: real files clear (no posting call site gates on load-tour status)`);

  // Mutant: re-add a gate call to bill-gl.service.ts (simulating a regression back to the OLD,
  // now-wrong law).
  const mutantSrc = "const openTourLoadId = await billOpenTourLoadId(client, opco, billId);\n";
  const mutantFailures = checkNoGateCall(BILL_GL_SERVICE, mutantSrc);
  if (!mutantFailures.length) {
    console.error(`${LABEL} --selftest FAIL — re-adding the open-tour gate did NOT trip this guard (theater — a regression to the old law would ship silently).`);
    return 1;
  }
  console.log(`${LABEL} --selftest: mutant with the gate re-added correctly FAILS (${mutantFailures.join("; ")})`);
  console.log(`${LABEL} --selftest PASS — 2/2`);
  return 0;
}

async function main() {
  if (process.argv.includes("--selftest")) return selftest();

  const staticFailures = checkStatic();
  if (staticFailures.length) {
    console.error(`${LABEL} FAIL:`);
    for (const f of staticFailures) console.error(`  - ${f}`);
    return 1;
  }
  console.log(`${LABEL} static half OK — no posting call site gates on load-tour status (ACC-50 removed, claude/00-SEAT-CONTRACT.md §3)`);

  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  const liveRequested = process.env.OPEN_TOUR_POSTS_NOTHING_LIVE === "1";
  if (!connectionString || (!liveRequested && (process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true"))) {
    console.log(`${LABEL}: SKIP (live half) — static half is the real guard now; live half is an opt-in backlog tracker only.`);
    return 0;
  }

  const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
  const pg = require("pg");
  const client = new pg.Client(buildPgClientConfig(connectionString));
  try {
    await client.connect();
  } catch (error) {
    console.log(`${LABEL} SKIP (live half) — database unreachable (${error.code ?? error.message}).`);
    await client.end().catch(() => {});
    return 0;
  }

  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    const res = await client.query(
      `SELECT count(*)::int AS n FROM accounting.expenses WHERE posting_hold_reason = 'tour_open' AND voided_at IS NULL`
    );
    await client.query("COMMIT");
    const n = res.rows[0].n;
    if (n > KNOWN_STALE_TOUR_OPEN_HOLDS) {
      console.error(`${LABEL} FAIL — ${n} row(s) carry posting_hold_reason='tour_open', GREW past the ratchet baseline of ${KNOWN_STALE_TOUR_OPEN_HOLDS}. Nothing should write this value any more.`);
      return 1;
    }
    if (n < KNOWN_STALE_TOUR_OPEN_HOLDS) {
      console.log(`${LABEL}: NOTE — ratchet improved (${n} < baseline ${KNOWN_STALE_TOUR_OPEN_HOLDS}). Lower KNOWN_STALE_TOUR_OPEN_HOLDS in this file to match.`);
    }
    console.log(`${LABEL} PASS — ${n} historical row(s) still carry posting_hold_reason='tour_open' (ratchet baseline ${KNOWN_STALE_TOUR_OPEN_HOLDS}, draining, never grows).`);
    return 0;
  } finally {
    await client.end().catch(() => {});
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(await main());
}
