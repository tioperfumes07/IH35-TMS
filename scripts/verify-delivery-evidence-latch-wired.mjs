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

/**
 * A path that puts a load INTO a delivery-evidence status.
 *
 * WIDENED 2026-08-07 (CC-3 live-verifier lane) after this guard was PROVEN green while the law it
 * encodes was being broken. The original matcher recognised only a STRING-LITERAL assignment, so
 * `dispatch/loads-bulk.routes.ts` — which validates a payload enum, maps it, and binds it as a query
 * parameter (`SET status = $3::mdata.load_status_enum`) — was never even considered. It stamps the
 * delivery departure and never latches, and the guard printed "OK — every delivery-evidence
 * transition fires the revenue latch" and exited 0. That statement was false. Live-proven on prod
 * 2026-08-07: matcher returned null for that file while it demonstrably transitions loads to
 * delivered_pending_docs. The guard's own docstring names "a bulk driver tool" as one of three
 * examples it promises to catch — the validate-map-bind shape is enterprise-normal, and a matcher
 * that only sees literals is blind to it.
 *
 * @returns a human-readable reason this file is a delivery path, or null.
 */
function assignsEvidenceStatus(src) {
  for (const status of EVIDENCE_STATUSES) {
    // `nextLoadStatus = "delivered_pending_docs"` / `: "delivered_pending_docs"` / `'...'`
    const assign = new RegExp(`(?:=|\\?|:)\\s*["']${status}["']`);
    if (assign.test(src)) return `assigns the literal status "${status}"`;
  }
  // The DEFINITIONAL signal that a path delivers a load. Stamping the final delivery departure IS
  // the act of recording delivery evidence; it is a single shared helper, and — unlike a status
  // string — a function call cannot be hidden behind a variable. This is the check that catches the
  // parameterized writers the literal scan cannot see.
  if (/\bstampFinalActiveDeliveryDeparture\s*\(/.test(src)) {
    return "calls stampFinalActiveDeliveryDeparture() — it records delivery evidence";
  }
  // Belt-and-braces: a NON-literal write to mdata.loads.status in a file that handles an evidence
  // status. Requires SET status specifically, so writers of other columns (e.g. driver-team.service
  // writes SET team_id and only READS the status in a filter list) are not false-positived.
  if (
    /UPDATE\s+mdata\.loads/i.test(src) &&
    /SET\s+status\b/i.test(src) &&
    EVIDENCE_STATUSES.some((s) => src.includes(s))
  ) {
    return "writes mdata.loads.status from a non-literal while handling a delivery-evidence status";
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
  let widened = 0;
  for (const { rel, src } of files) {
    if (EXEMPT.has(rel)) continue;
    const status = assignsEvidenceStatus(src);
    if (!status) continue;
    scanned++;
    // Count files in scope ONLY because of the 2026-08-07 widening — see the vacuous-pass check in
    // auditTree(). A literal-status match does not count.
    if (!status.startsWith("assigns the literal status")) widened++;
    if (!LATCH_MARKERS.some((m) => src.includes(m))) {
      problems.push(
        `${rel}: ${status}, but never references the revenue latch ` +
          `(${LATCH_MARKERS.join(" / ")}). Delivery evidence would be recorded while the ledger hears ` +
          `nothing, stalling deliver → revenue → invoice → GL → bank. Call latchOnDeliveryEvidence() ` +
          `after the status write, or add this file to EXEMPT with a stated reason.`
      );
    }
  }
  return { problems, scanned, widened };
}

function auditTree() {
  const rels = [];
  walk(SRC, rels);
  const files = rels.map((rel) => ({ rel: relative(ROOT, join(ROOT, rel)), src: readFileSync(join(ROOT, rel), "utf8") }));
  const { problems, scanned, widened } = auditSources(files);
  if (scanned === 0) {
    return [
      `${LABEL}: found ZERO files assigning a delivery-evidence status — the matcher is stale ` +
        `(statuses renamed?). Refusing to pass vacuously.`,
    ];
  }
  // THE WIDENING MUST STAY LOAD-BEARING. The literal-only matcher printed
  // "OK — every delivery-evidence transition fires the revenue latch", exit 0, while the bulk path
  // delivered loads and never latched: a green, trusted guard while its own law was broken. If the
  // two non-literal signals stop matching ANY file — the shared stamp helper renamed or inlined, the
  // bulk UPDATE reshaped — this guard has silently reverted to exactly that state, and the only
  // visible symptom would be another confident OK. Refuse instead.
  if (widened === 0) {
    return [
      `${LABEL}: not one non-exempt file is in scope via the non-literal signals ` +
        `(stampFinalActiveDeliveryDeparture() / a non-literal UPDATE mdata.loads SET status). The ` +
        `2026-08-07 widening has gone dead, so this guard is back to the literal-only matcher that ` +
        `passed vacuously through LV-BULK-DELIVER-NOLATCH. Refusing to pass vacuously.`,
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

  // The parameterized shape that this guard was BLIND to until 2026-08-07 — validate a payload enum,
  // map it, bind it. No literal anywhere, so the original matcher skipped the file entirely. This is
  // the real dispatch/loads-bulk.routes.ts shape, reduced.
  const parameterized = `const mdataStatus = toMdataStatus(statusPayload.transition);
    await client.query("UPDATE mdata.loads SET status = $3::mdata.load_status_enum", [id, opco, mdataStatus]);
    if (loadStatusRequiresDeliveryDepartureStamp(mdataStatus)) {
      await stampFinalActiveDeliveryDeparture(client, operatingCompanyId, id, statusPayload.delivered_at ?? null);
    }
    const PAID = new Set(["invoiced", "completed_docs_received", "delivered_pending_docs", "paid"]);`;
  if (auditSources([{ rel: "apps/backend/src/dispatch/x-bulk.routes.ts", src: parameterized }]).problems.length === 0)
    failures.push("case6 FAIL — a PARAMETERIZED delivery transition with no latch was NOT caught (the 2026-08-07 blind spot)");

  // Same shape, latched → clean. Proves the widening did not become an unconditional flag.
  if (
    auditSources([
      { rel: "apps/backend/src/dispatch/x-bulk.routes.ts", src: parameterized + "\nawait latchOnDeliveryEvidence({});" },
    ]).problems.length !== 0
  )
    failures.push("case7 FAIL — a latched parameterized path was flagged");

  // A writer of a DIFFERENT column that merely READS an evidence status in a filter list is not a
  // delivery path (the real mdata/driver-team.service.ts shape) — must not be flagged.
  const otherColumn = `const ACTIVE_LOAD_STATUSES = ["in_transit", "delivered_pending_docs"];
    await client.query("UPDATE mdata.loads SET team_id = $2 WHERE id = $1", [id, teamId]);`;
  if (auditSources([{ rel: "apps/backend/src/mdata/x-team.service.ts", src: otherColumn }]).problems.length !== 0)
    failures.push("case8 FAIL — a non-status writer that only READS an evidence status was flagged");

  // case9 — MUTATION AGAINST THE REAL FILE, not a reduced fixture. Every case above is a string this
  // same author wrote, so they prove the matcher is self-consistent, not that it holds on the actual
  // source. The whole history of this guard is a fixture-clean matcher that missed the real file. So:
  // strip the latch out of the bulk route ON DISK and demand RED. This is what makes the widening a
  // regression test for LV-BULK-DELIVER-NOLATCH rather than a description of it.
  const bulkRel = "apps/backend/src/dispatch/loads-bulk.routes.ts";
  const bulkAbs = join(ROOT, bulkRel);
  if (!existsSync(bulkAbs)) {
    failures.push(`case9 FAIL — ${bulkRel} is missing; the live mutation proof cannot run`);
  } else {
    const real = readFileSync(bulkAbs, "utf8");
    const mutated = real.replace(/latchOnDeliveryEvidence/g, "noLatchHere");
    if (mutated === real) {
      failures.push(
        `case9 FAIL — the REAL ${bulkRel} does not reference latchOnDeliveryEvidence at all; the ` +
          `unlatched bulk delivery path (LV-BULK-DELIVER-NOLATCH) is back.`
      );
    } else if (auditSources([{ rel: bulkRel, src: mutated }]).problems.length === 0) {
      failures.push(`case9 FAIL — removing the latch from the REAL ${bulkRel} left this guard GREEN`);
    }
  }

  // NOTE: the selftest deliberately does NOT assert that the real tree is clean. That conflates two
  // different things — "is the matcher correct" (this selftest) and "is the repo currently compliant"
  // (the main run). The previous version asserted tree-cleanliness here, which meant a genuine defect
  // would surface as a confusing selftest failure instead of a plain guard failure.

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
