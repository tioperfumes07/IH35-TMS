#!/usr/bin/env node
// TASK 27 OF 48 tripwire (ROUND E12.1-R2, owner order 2026-09-23 22:03 UTC / 2026-09-23 17:03 CT):
// "settlements.routes.ts lines 955 / 1080 / 1273 write NOTHING to mdata.loads... every settlement
// that posts without this wired manufactures a stale-status load." The write-path fix has TWO live
// callers today: settlements.routes.ts's PATCH .../finalize route (PR #22227, already merged) and
// this session's seed-settlement-document.routes.ts (wired same round, TASK 27). This guard is the
// live tripwire that catches a THIRD caller ever being added without the same call, or either
// existing caller's syncSettlementLoadsToBilling call silently failing/being removed later.
//
// PREDICATE: a load counts as "settled" once it has a driver_finance.driver_bills row whose
// settled_in_settlement_id points to a driver_finance.driver_settlements row in a FINALIZED status
// (0143's enum: 'locked','paid','final','closed' — never 'draft'/'presettle'/'acked'/'held'/
// 'cancelled'/'ready'/'approved'/'open', which are pre-finalization or terminated-without-effect).
// Once ALSO its tied accounting.invoices row (source_load_id, not voided) has moved to
// invoice_status IN ('sent','partial','paid') — proof the forward-walk's trigger condition fired —
// mdata.loads.status MUST already be one of the post-forward-walk targets ('invoiced','paid',
// 'closed') per load-billing-lifecycle.service.ts's own map, or a genuine terminal exit
// ('cancelled','abandoned','driver_walkoff','driver_no_show'). Anything else is a stale-status load
// — the exact defect class task 28 existed for and the AUTH-001 purge just erased the evidence of.
//
// Fails closed with no DATABASE_URL (requireLiveDbOrExit). EMPTY-BY-PURGE: the settled-load
// population is legitimately, temporarily empty during the post-AUTH-001-wipe purge window (no
// driver_settlements have been finalized yet) — a named skip, not a pass
// (scripts/lib/purge-window.mjs, PURGE_WINDOW_GUARDS). Baseline 0, shrink-only
// (scripts/verify-settled-load-carries-settled-status.baseline.json) — a NEW offender always fails;
// this is a tripwire, not a ratchet meant to carry debt.
import fs from "node:fs";
import path from "node:path";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";
import { exitIfEmptyByPurge } from "./lib/purge-window.mjs";

const LABEL = "verify-settled-load-carries-settled-status";
export const REQUIRES_LIVE_DB =
  "live-data money guard (TASK 27 tripwire); fails closed via requireLiveDbOrExit with no DATABASE_URL";
const BASELINE_PATH = path.join(
  process.cwd(),
  "scripts/verify-settled-load-carries-settled-status.baseline.json"
);

const FINALIZED_SETTLEMENT_STATUSES = new Set(["locked", "paid", "final", "closed"]);
const FORWARD_INVOICE_TRIGGER_STATUSES = new Set(["sent", "partial", "paid"]);
const OK_LOAD_STATUSES = new Set([
  "invoiced",
  "paid",
  "closed",
  "cancelled",
  "abandoned",
  "driver_walkoff",
  "driver_no_show",
]);

/**
 * Pure predicate, unit-testable without a DB (--selftest). `rows` is an array of
 * { load_number, settlement_status, invoice_status, load_status }. Returns the subset that are
 * stale-status violations — a settlement finalized and an invoice advanced, but the load itself
 * never synced forward.
 */
export function findStaleSettledLoads(rows) {
  return rows.filter(
    (r) =>
      FINALIZED_SETTLEMENT_STATUSES.has(r.settlement_status) &&
      FORWARD_INVOICE_TRIGGER_STATUSES.has(r.invoice_status) &&
      !OK_LOAD_STATUSES.has(r.load_status)
  );
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return null;
  return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
}

function key(r) {
  return r.load_number;
}

function selftest() {
  // RED — reproduces the exact live shape this guard exists to catch: a finalized settlement, an
  // invoice already sent, but the load itself stuck at completed_docs_received (load 13508's real
  // shape once its settlement finalizes, if the sync call were ever missing or silently failed).
  const red = [
    {
      load_number: "13508",
      settlement_status: "locked",
      invoice_status: "sent",
      load_status: "completed_docs_received",
    },
  ];
  const redFindings = findStaleSettledLoads(red);
  if (redFindings.length !== 1) {
    console.error(
      `${LABEL}: SELFTEST FAIL (red) — expected 1 finding for the reproduced 13508 shape, got ${redFindings.length}`
    );
    process.exit(1);
  }
  console.log(
    `${LABEL}: SELFTEST RED OK — correctly FAILS on the reproduced 13508 shape (locked settlement, sent invoice, load stuck at completed_docs_received).`
  );

  // GREEN — same shape, but the forward-walk actually fired (load_status = invoiced), i.e. exactly
  // what syncSettlementLoadsToBilling being wired (this round's fix) produces.
  const green = [
    {
      load_number: "13508",
      settlement_status: "locked",
      invoice_status: "sent",
      load_status: "invoiced",
    },
  ];
  const greenFindings = findStaleSettledLoads(green);
  if (greenFindings.length !== 0) {
    console.error(
      `${LABEL}: SELFTEST FAIL (green) — expected 0 findings once load_status=invoiced, got ${greenFindings.length}`
    );
    process.exit(1);
  }
  console.log(
    `${LABEL}: SELFTEST GREEN OK — correctly PASSES once the load has advanced to 'invoiced'.`
  );

  // Negative controls — a settlement still in draft, an invoice still in draft, and a genuine
  // terminal exit must never be flagged: this guard is a tripwire for a wiring gap, not a demand
  // that every settled load be pre-invoiced or that a cancelled load chase a billing status.
  const notYet = [
    { load_number: "13600", settlement_status: "draft", invoice_status: "sent", load_status: "delivered" },
    { load_number: "13601", settlement_status: "locked", invoice_status: "draft", load_status: "delivered" },
    { load_number: "13602", settlement_status: "locked", invoice_status: "sent", load_status: "cancelled" },
  ];
  const notYetFindings = findStaleSettledLoads(notYet);
  if (notYetFindings.length !== 0) {
    console.error(
      `${LABEL}: SELFTEST FAIL (negative controls) — expected 0 findings, got ${notYetFindings.length}: ${JSON.stringify(notYetFindings)}`
    );
    process.exit(1);
  }
  console.log(
    `${LABEL}: SELFTEST NEGATIVE-CONTROLS OK — draft settlement, draft invoice, and a genuine cancelled exit are all correctly never flagged.`
  );
  console.log(`${LABEL}: SELFTEST PASS (exit 0)`);
}

async function live() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    // BANK-F30150 pattern: bypass_rls must be in the SAME transaction as the read through Neon's
    // pooled endpoint, or it silently reads false-zero.
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");

    const res = await client.query(`
      SELECT l.load_number, l.status AS load_status,
             s.status AS settlement_status, i.status AS invoice_status
        FROM driver_finance.driver_bills b
        JOIN driver_finance.driver_settlements s ON s.id = b.settled_in_settlement_id
        JOIN mdata.loads l ON l.id = b.load_id
        JOIN accounting.invoices i ON i.source_load_id = l.id AND i.voided_at IS NULL
       WHERE b.settled_in_settlement_id IS NOT NULL
    `);

    await client.query("COMMIT");

    if (res.rows.length === 0) {
      exitIfEmptyByPurge(LABEL, "settled driver_bill / driver_settlement / invoice population");
      console.error(
        `${LABEL}: LIVE FAIL — 0 rows joining a settled driver_bill to its settlement and invoice; completeness discriminator says this is an instrument problem (RLS/bypass/join), not a real zero.`
      );
      process.exit(1);
    }

    const stale = findStaleSettledLoads(res.rows);
    const baseline = loadBaseline();
    const baselineKeys = new Set(baseline ? baseline.keys : []);
    const staleKeys = new Set(stale.map(key));
    const newOffenders = stale.filter((r) => !baselineKeys.has(key(r)));

    if (newOffenders.length > 0) {
      console.error(
        `${LABEL}: LIVE FAIL — ${newOffenders.length} NEW stale-status settled load(s) (settlement finalized, invoice advanced, load status never synced):`
      );
      for (const r of newOffenders.slice(0, 20)) {
        console.error(
          `  ✗ load ${r.load_number} — settlement=${r.settlement_status} invoice=${r.invoice_status} load.status=${r.load_status} (expected invoiced/paid/closed)`
        );
      }
      process.exit(1);
    }

    const healedInBaseline = Array.from(baselineKeys).filter((k) => !staleKeys.has(k));
    if (healedInBaseline.length > 0) {
      console.log(
        `${LABEL}: NOTE — ${healedInBaseline.length} previously-baselined load(s) no longer stale; shrink the baseline: ${healedInBaseline.join(", ")}`
      );
    }

    console.log(
      `${LABEL}: LIVE PASS — ${res.rows.length} settled-load row(s) checked, ${stale.length} baselined (0 new). exit 0`
    );
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  await live();
}
