#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["connectivity"],"leafRe":"^dispatch\\.parity\\.round_trips_timeline$","task":"REG-037-TIMELINE-WINDOW"} */
/**
 * REG-037 — Round Trips Timeline: default window is Aug 25 2026 → today; booked/planned
 * loads in-window are painted; pairing statuses stay narrow.
 */
import { readFileSync } from "node:fs";

const LEGS = "apps/frontend/src/pages/dispatch/roundTripsLegs.ts";
const TIMELINE = "apps/frontend/src/pages/dispatch/RoundTripsTimeline.tsx";
const DISPATCH = "apps/frontend/src/pages/Dispatch.tsx";

function check(legs, timeline, dispatch) {
  const errors = [];
  if (!/"booked"/.test(legs) || !/"planned"/.test(legs) || !/"unassigned"/.test(legs)) {
    errors.push("RT_TIMELINE_STATUSES must include booked, planned, unassigned (future + current legs)");
  }
  if (!/RT_PAIRING_ACTIVE_STATUSES/.test(legs)) {
    errors.push("pairing engine set RT_PAIRING_ACTIVE_STATUSES must remain the source for board pairing");
  }
  if (!/RT_TIMELINE_WINDOW_START = "2026-08-25"/.test(timeline)) {
    errors.push("default timeline window must start 2026-08-25");
  }
  if (!/from: RT_TIMELINE_WINDOW_START/.test(timeline)) {
    errors.push("defaultTimelineRange must use RT_TIMELINE_WINDOW_START, not last-13-days");
  }
  if (/addDaysIso\(to, -13\)/.test(timeline)) {
    errors.push("last-13-days default must not return");
  }
  if (!/for \(let i = 0; i < 180; i \+= 1\)/.test(timeline)) {
    errors.push("dayList must cover Aug 25 → present (180-day cap)");
  }
  if (!/roundTripsFullFetch\s*=\s*subTab === "load_board" && view === "units"/.test(dispatch)) {
    errors.push("Dispatch.tsx must un-page the Round Trips fetch");
  }
  if (!/listAllLoads\(loadListFilters\)/.test(dispatch)) {
    errors.push("Round Trips must page via listAllLoads (GET /mdata/loads max 200; 1000 one-shot 400s)");
  }
  if (/effectiveLoadsLimit\s*=\s*roundTripsFullFetch \? 1000/.test(dispatch)) {
    errors.push("limit:1000 one-shot must not return (API zod max 200)");
  }
  return errors;
}

function selftest() {
  const legs = readFileSync(LEGS, "utf8");
  const timeline = readFileSync(TIMELINE, "utf8");
  const dispatch = readFileSync(DISPATCH, "utf8");
  const good = check(legs, timeline, dispatch);
  if (good.length) {
    console.error("SELFTEST FAIL — clean:\n  " + good.join("\n  "));
    process.exit(1);
  }
  const badTimeline = timeline.replace("2026-08-25", "2026-09-01");
  if (check(legs, badTimeline, dispatch).length === 0) {
    console.error("SELFTEST FAIL — window start mutation not caught");
    process.exit(1);
  }
  console.log("PASS verify-reg037-roundtrips-timeline-window --selftest");
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = check(
  readFileSync(LEGS, "utf8"),
  readFileSync(TIMELINE, "utf8"),
  readFileSync(DISPATCH, "utf8"),
);
if (errors.length) {
  console.error("FAIL verify-reg037-roundtrips-timeline-window:\n  " + errors.join("\n  "));
  process.exit(1);
}
console.log("PASS verify-reg037-roundtrips-timeline-window");
