#!/usr/bin/env node
/**
 * LOADBOARD-LIFECYCLE guard (owner 2026-09-09, verbatim: "the second a load is closed, it should
 * disappear from the load board … delivered waiting docs, or the new one … where we send the bol and
 * invoice to the factoring company while we are still delivering … but it creates the invoices etc but
 * STAYS in the load board until we change the status or the driver changes the status").
 *
 * This SUPERSEDES the earlier DSP-BAND-DUP framing that made `delivered_pending_docs` terminal for the
 * live board. The filename is kept only because guard files may not be deleted
 * (verify-no-guard-file-deletion); read THIS header, not the name.
 *
 * NEW RULING — industry standard (McLeod PowerBroker / Alvys / AlwaysTrack): the dispatch board is
 * LOAD-CENTRIC. A load stays on the LIVE board through its whole lifecycle (dispatched → in transit →
 * delivered → pending docs → invoiced → paid) and leaves ONLY when closed/cancelled/abandoned. So:
 *   (a) delivered_pending_docs must NOT be in mdata/loads.routes.ts CLOSED_LOAD_STATUSES (it stays LIVE);
 *   (b) the units-without-load (Awaiting) active set in dispatch/loads.routes.ts must STILL exclude
 *       delivered_pending_docs, so a delivered (free) truck surfaces exactly ONCE in Awaiting and the
 *       truck roster never duplicates (the real 2026-09-06 concern, preserved); and
 *   (c) DispatchBoard.tsx must route delivered-but-not-closed loads into their own load-centric billing
 *       band (isBillingQueueLoad / BILLING_QUEUE_STATUSES) rather than the in-flight "Booked" band, so a
 *       delivered truck never reads as "booked" while the LOAD stays visible until closed.
 *
 * --selftest runs positive (current source PASS) and negative (mutated source FAIL) cases.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MDATA = path.join(ROOT, "apps/backend/src/mdata/loads.routes.ts");
const DISPATCH = path.join(ROOT, "apps/backend/src/dispatch/loads.routes.ts");
const BOARD = path.join(ROOT, "apps/frontend/src/pages/dispatch/DispatchBoard.tsx");

/** Extract the CLOSED_LOAD_STATUSES array literal body from mdata/loads.routes.ts source. */
function closedArrayBody(src) {
  const m = src.match(/const\s+CLOSED_LOAD_STATUSES\s*=\s*\[([\s\S]*?)\]\s*as const/);
  if (!m) throw new Error("CLOSED_LOAD_STATUSES literal not found in mdata/loads.routes.ts");
  return m[1];
}

/**
 * The units-without-load (Awaiting) active-load set. Anchored on the in-flight `dispatched` +
 * `in_transit` pair so we match the correct `l.status IN (...)` block; that block must NOT list
 * delivered_pending_docs.
 */
export function awaitingActiveSetBody(src) {
  const m = src.match(/l\.status\s+IN\s*\(([\s\S]*?)\)/);
  if (!m) return null;
  const body = m[1];
  if (!/dispatched/.test(body) || !/in_transit/.test(body)) return null; // wrong block
  return body;
}

/** The DispatchBoard billing-band predicate set (delivered-but-not-closed loads). */
function billingQueueSetBody(src) {
  const m = src.match(/const\s+BILLING_QUEUE_STATUSES\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
  return m ? m[1] : null;
}

export function check(mdataSrc, dispatchSrc, boardSrc) {
  const failures = [];

  // (a) delivered_pending_docs must be LIVE — i.e. NOT in the closed cohort.
  if (/delivered_pending_docs/.test(closedArrayBody(mdataSrc))) {
    failures.push(
      "delivered_pending_docs is in CLOSED_LOAD_STATUSES — a delivered-but-not-closed load would be hidden from the live board (owner 2026-09-09: it must STAY until closed)"
    );
  }

  // (b) Awaiting active set must still EXCLUDE delivered_pending_docs — free truck shows once, no dup.
  const awaiting = awaitingActiveSetBody(dispatchSrc);
  if (awaiting == null) {
    failures.push("units-without-load active-load `l.status IN (...)` block not found (in-flight dispatched/in_transit anchor missing)");
  } else if (/delivered_pending_docs/.test(awaiting)) {
    failures.push(
      "units-without-load active set includes delivered_pending_docs — a delivered (free) truck would be treated as occupied and could duplicate/vanish in the Awaiting roster (2026-09-06 concern)"
    );
  }

  // (c) DispatchBoard must route delivered-but-not-closed loads to a billing band, not Booked.
  const billing = billingQueueSetBody(boardSrc);
  if (billing == null) {
    failures.push("DispatchBoard.tsx BILLING_QUEUE_STATUSES set not found — delivered loads must route to a load-centric billing band");
  } else if (!/delivered_pending_docs/.test(billing)) {
    failures.push("BILLING_QUEUE_STATUSES does not include delivered_pending_docs — delivered loads would flood the in-flight Booked band and repeat trucks");
  }
  if (!/isBillingQueueLoad/.test(boardSrc)) {
    failures.push("DispatchBoard.tsx must use isBillingQueueLoad to split the live loads into Booked vs billing bands");
  }

  return failures;
}

function runSelftest() {
  const mdataSrc = fs.readFileSync(MDATA, "utf8");
  const dispatchSrc = fs.readFileSync(DISPATCH, "utf8");
  const boardSrc = fs.readFileSync(BOARD, "utf8");

  const pos = check(mdataSrc, dispatchSrc, boardSrc);
  if (pos.length > 0) {
    console.error("SELFTEST positive FAIL — current source should pass:\n  " + pos.join("\n  "));
    process.exit(1);
  }

  // Negative 1: add delivered_pending_docs back into CLOSED -> hidden-from-live must be caught.
  const mdataMut = mdataSrc.replace(
    /(const\s+CLOSED_LOAD_STATUSES\s*=\s*\[)/,
    '$1\n  "delivered_pending_docs",'
  );
  if (mdataMut === mdataSrc || check(mdataMut, dispatchSrc, boardSrc).length === 0) {
    console.error("SELFTEST negative FAIL — adding delivered_pending_docs to CLOSED_LOAD_STATUSES was not caught");
    process.exit(1);
  }

  // Negative 2: re-add delivered_pending_docs to the Awaiting active set -> truck-dup must be caught.
  const dispatchMut = dispatchSrc.replace(
    /('assigned_not_dispatched'::mdata\.load_status_enum,[\s\S]*?'in_transit'::mdata\.load_status_enum)(\s*\))/,
    "$1,\n              'delivered_pending_docs'::mdata.load_status_enum$2"
  );
  if (dispatchMut === dispatchSrc || check(mdataSrc, dispatchMut, boardSrc).length === 0) {
    console.error("SELFTEST negative FAIL — re-adding delivered_pending_docs to Awaiting active set was not caught");
    process.exit(1);
  }

  // Negative 3: drop delivered_pending_docs from the billing band -> Booked flood must be caught.
  // Target the BILLING_QUEUE_STATUSES set body specifically (other "delivered_pending_docs" string
  // literals exist elsewhere in the board — status labels, transition maps).
  const boardMut = boardSrc.replace(
    /(const\s+BILLING_QUEUE_STATUSES\s*=\s*new Set\(\[[\s\S]*?)\n\s*"delivered_pending_docs",/,
    "$1"
  );
  if (boardMut === boardSrc || check(mdataSrc, dispatchSrc, boardMut).length === 0) {
    console.error("SELFTEST negative FAIL — dropping delivered_pending_docs from the billing band was not caught");
    process.exit(1);
  }

  console.log("SELFTEST PASS — delivered_pending_docs stays live, Awaiting stays deduped, billing band routes it (no Booked flood).");
}

function main() {
  if (process.argv.includes("--selftest")) return runSelftest();
  const failures = check(
    fs.readFileSync(MDATA, "utf8"),
    fs.readFileSync(DISPATCH, "utf8"),
    fs.readFileSync(BOARD, "utf8")
  );
  if (failures.length > 0) {
    console.error("FAIL — LOADBOARD-LIFECYCLE:\n  " + failures.join("\n  "));
    process.exit(1);
  }
  console.log("PASS — delivered_pending_docs stays on the live board until closed; truck roster deduped; billing band load-centric. No dup, no hidden loads.");
}

main();
