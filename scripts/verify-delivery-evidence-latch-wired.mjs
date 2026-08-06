#!/usr/bin/env node
/**
 * CLS-DISP-WIRE-07 — every path that moves a load INTO a delivery-evidence status must fire the
 * revenue latch. This is the critical-path root blocker for hops 4→9.
 *
 * WHAT WAS BROKEN (verified on origin/main before the fix): the office transition
 * (dispatch/loads.routes.ts) called postLoadRevenueLatch() when the target status was
 * `delivered_pending_docs` / `completed_docs_received`. The TWO driver capture paths —
 * driver/loads.routes.ts and dispatch/driver-pwa/dispatch-view.routes.ts — set that SAME status with
 * a bare `UPDATE mdata.loads SET status = $2` and never latched. So the only party who actually
 * performs a delivery could not trigger revenue recognition: delivery evidence landed in
 * mdata.load_stops while the ledger never heard about it, and deliver → revenue → invoice → GL → bank
 * could not flow from real field activity.
 *
 * WHY A GENERALIZED GUARD, NOT THREE ASSERTIONS: the defect is not "these two files are wrong", it is
 * "a delivery path can transition a load without latching". Anyone adding a fourth path (offline sync
 * replay, a bulk driver tool, a telematics auto-complete) reproduces it. So this scans for the SHAPE:
 * any backend file that assigns a delivery-evidence status to a load must also reference the latch
 * (directly, or via the shared latchOnDeliveryEvidence helper).
 *
 * NOT CLAIMED: this is a static scan. It proves the call is WIRED, not that it posted — posting
 * depends on the per-entity flag and the poster's own evidence gate, which are exercised by the
 * revrec poster's own db tests. A static guard that pretended to prove posting would be theater.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LABEL = "verify-delivery-evidence-latch-wired";
const SRC = "apps/backend/src";

/** The statuses that constitute delivery evidence — mirrors delivery-evidence-latch.ts. */
const EVIDENCE_STATUSES = ["delivered_pending_docs", "completed_docs_received"];

/** Referencing any of these counts as "latched". */
const LATCH_MARKERS = ["latchOnDeliveryEvidence", "postLoadRevenueLatch"];

/**
 * Files that legitimately NAME a delivery-evidence status without transitioning a load into one:
 * the poster itself, the shared helper, read-only/reporting paths, and consumers that branch on a
 * status someone else set. Each is a stated decision, never a silencer.
 */
const EXEMPT = new Set([
  "apps/backend/src/dispatch/delivery-evidence-latch.ts", // the helper that DOES the latching
  "apps/backend/src/accounting/revrec-delivery-posting/poster.service.ts", // the poster itself
  "apps/backend/src/dispatch/stamp-final-delivery-departure.ts", // stamps the stop, not the load status
  "apps/backend/src/driver-finance/settlements-load-bookended.service.ts", // reads a status set upstream
  // Pure status MAPPERS / read-side classifiers — they name the status but never write it to a load.
  // Verified by reading each: load-state-machine returns a normalised status from a status
  // (`if (status === "delivered") return "delivered_pending_docs"`), and earnings classifies a row
  // for display (`return "acked"`). Exempting a WRITER here would silence the defect, so these were
  // checked individually rather than added to make the guard green.
  "apps/backend/src/dispatch/load-state-machine.ts",
  "apps/backend/src/driver/earnings.routes.ts",
]);

/** A write that puts a load INTO a delivery-evidence status. */
function assignsEvidenceStatus(src) {
  for (const status of EVIDENCE_STATUSES) {
    // `nextLoadStatus = "delivered_pending_docs"` / `: "delivered_pending_docs"` / `'...'`
    const assign = new RegExp(`(?:=|\\?|:)\\s*["']${status}["']`);
    if (assign.test(src)) return status;
  }
  return null;
}

function walk(rel, out) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) return;
  const st = statSync(abs);
  if (st.isDirectory()) {
    for (const e of readdirSync(abs)) {
      if (e === "node_modules" || e === "__tests__" || e === "dist") continue;
      walk(join(rel, e), out);
    }
    return;
  }
  if (rel.endsWith(".ts") && !rel.endsWith(".d.ts") && !rel.includes(".test.")) out.push(rel);
}

export function auditSources(files) {
  const problems = [];
  let scanned = 0;
  for (const { rel, src } of files) {
    if (EXEMPT.has(rel)) continue;
    const status = assignsEvidenceStatus(src);
    if (!status) continue;
    scanned++;
    if (!LATCH_MARKERS.some((m) => src.includes(m))) {
      problems.push(
        `${rel}: transitions a load into "${status}" but never references the revenue latch ` +
          `(${LATCH_MARKERS.join(" / ")}). Delivery evidence would be recorded while the ledger hears ` +
          `nothing, stalling deliver → revenue → invoice → GL → bank. Call latchOnDeliveryEvidence() ` +
          `after the status write, or add this file to EXEMPT with a stated reason.`
      );
    }
  }
  return { problems, scanned };
}

function auditTree() {
  const rels = [];
  walk(SRC, rels);
  const files = rels.map((rel) => ({ rel: relative(ROOT, join(ROOT, rel)), src: readFileSync(join(ROOT, rel), "utf8") }));
  const { problems, scanned } = auditSources(files);
  if (scanned === 0) {
    return [
      `${LABEL}: found ZERO files assigning a delivery-evidence status — the matcher is stale ` +
        `(statuses renamed?). Refusing to pass vacuously.`,
    ];
  }
  return problems;
}

function selftest() {
  const failures = [];
  const bare = `const nextLoadStatus = isFinal ? "delivered_pending_docs" : "in_transit";
    await client.query("UPDATE mdata.loads SET status = $2 WHERE id = $1", [id, nextLoadStatus]);`;

  // The exact pre-fix driver shape MUST fail.
  if (auditSources([{ rel: "apps/backend/src/driver/x.routes.ts", src: bare }]).problems.length === 0)
    failures.push("case1 FAIL — a bare delivery transition with no latch was NOT caught");

  // Same file, latched via the shared helper → clean.
  if (
    auditSources([{ rel: "apps/backend/src/driver/x.routes.ts", src: bare + "\nawait latchOnDeliveryEvidence({});" }])
      .problems.length !== 0
  )
    failures.push("case2 FAIL — a correctly latched path was flagged");

  // Latched via the poster directly (the office path's shape) → also clean.
  if (
    auditSources([{ rel: "apps/backend/src/dispatch/y.routes.ts", src: bare + "\nawait postLoadRevenueLatch({});" }])
      .problems.length !== 0
  )
    failures.push("case3 FAIL — the office-style direct poster call was flagged");

  // A file that never assigns the status is not in scope.
  if (auditSources([{ rel: "apps/backend/src/z.ts", src: 'const s = "in_transit";' }]).problems.length !== 0)
    failures.push("case4 FAIL — an unrelated file was flagged");

  // Exempt files are skipped even when they name the status.
  if (
    auditSources([{ rel: "apps/backend/src/dispatch/delivery-evidence-latch.ts", src: bare }]).problems.length !== 0
  )
    failures.push("case5 FAIL — an exempt file was flagged");

  const tree = auditTree();
  if (tree.length !== 0) failures.push(`case6 FAIL — real tree flagged: ${tree.join(" | ")}`);

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS — bare transition caught, helper/poster forms accepted, exempts honoured`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — every delivery-evidence transition fires the revenue latch`);
}

main();
