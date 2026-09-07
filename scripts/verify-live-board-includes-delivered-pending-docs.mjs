#!/usr/bin/env node
/**
 * DSP-BAND-GAP guard (owner 2026-09-06, measured live: 10 of 16 in-service trucks on the dispatch board).
 *
 * ROOT CAUSE this pins: `delivered_pending_docs` was in TERMINAL_LOAD_STATUSES (mdata/loads.routes.ts),
 * so the LIVE board filter `NOT (status = ANY(TERMINAL))` hid those loads from the Booked band; meanwhile
 * dispatch/units-without-load treats delivered_pending_docs as an ACTIVE load and drops that truck from
 * Awaiting. The truck was in NEITHER band -> invisible. The fix: delivered_pending_docs must NOT be
 * terminal (it is live work: delivered, pending docs/invoice), so it shows in Booked, consistent with
 * the Awaiting roster and the DispatchOverview active-loads tile.
 *
 * This guard fails if delivered_pending_docs is ever re-added to TERMINAL_LOAD_STATUSES, OR if the
 * units-without-load Awaiting query stops treating delivered_pending_docs as an active load (which would
 * re-open the same band gap from the other side).
 *
 * --selftest runs a positive (current source PASS) and a negative (mutated source FAIL) case.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MDATA = path.join(ROOT, "apps/backend/src/mdata/loads.routes.ts");
const DISPATCH = path.join(ROOT, "apps/backend/src/dispatch/loads.routes.ts");

/** Extract the TERMINAL_LOAD_STATUSES array literal body from mdata/loads.routes.ts source. */
function terminalArrayBody(src) {
  const m = src.match(/const\s+TERMINAL_LOAD_STATUSES\s*=\s*\[([\s\S]*?)\]\s*as const/);
  if (!m) throw new Error("TERMINAL_LOAD_STATUSES literal not found in mdata/loads.routes.ts");
  return m[1];
}

/** The Awaiting roster (units-without-load) must count delivered_pending_docs as an active-load status. */
function awaitingTreatsDeliveredPendingAsActive(src) {
  const m = src.match(/l\.status\s+IN\s*\(([\s\S]*?)\)/);
  if (!m) return false;
  return /delivered_pending_docs/.test(m[1]);
}

function check(mdataSrc, dispatchSrc) {
  const failures = [];
  if (/delivered_pending_docs/.test(terminalArrayBody(mdataSrc))) {
    failures.push(
      "delivered_pending_docs is in TERMINAL_LOAD_STATUSES — it would be hidden from the LIVE dispatch board (DSP-BAND-GAP)"
    );
  }
  if (!awaitingTreatsDeliveredPendingAsActive(dispatchSrc)) {
    failures.push(
      "units-without-load Awaiting query no longer treats delivered_pending_docs as an active load — re-opens the band gap"
    );
  }
  return failures;
}

function runSelftest() {
  const mdataSrc = fs.readFileSync(MDATA, "utf8");
  const dispatchSrc = fs.readFileSync(DISPATCH, "utf8");

  const pos = check(mdataSrc, dispatchSrc);
  if (pos.length > 0) {
    console.error("SELFTEST positive FAIL — current source should pass:\n  " + pos.join("\n  "));
    process.exit(1);
  }

  // Negative: re-inject delivered_pending_docs into TERMINAL -> must be caught.
  const mutated = mdataSrc.replace(
    /const\s+TERMINAL_LOAD_STATUSES\s*=\s*\[/,
    'const TERMINAL_LOAD_STATUSES = [\n  "delivered_pending_docs",'
  );
  const neg = check(mutated, dispatchSrc);
  if (neg.length === 0) {
    console.error("SELFTEST negative FAIL — mutant (delivered_pending_docs back in TERMINAL) was not caught");
    process.exit(1);
  }
  console.log("SELFTEST PASS — positive clean, negative caught (delivered_pending_docs stays LIVE)");
}

function main() {
  if (process.argv.includes("--selftest")) return runSelftest();
  const failures = check(fs.readFileSync(MDATA, "utf8"), fs.readFileSync(DISPATCH, "utf8"));
  if (failures.length > 0) {
    console.error("FAIL — DSP-BAND-GAP:\n  " + failures.join("\n  "));
    process.exit(1);
  }
  console.log("PASS — delivered_pending_docs is LIVE (shows in Booked), Awaiting treats it as active. No band gap.");
}

main();
