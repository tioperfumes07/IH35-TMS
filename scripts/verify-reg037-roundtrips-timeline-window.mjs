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
const ROUTES = "apps/backend/src/dispatch/loads.routes.ts";
// 443.231b: units-without-load mounts THE shared unit gate UNIT_IN_SERVICE_SQL (unit-in-service.ts), which mounts
// canonicalBoardUnitGateSql (canonical-active-load-set.ts). LEAD 443.206 D3/D4 made that gate THE board scope:
// leased to this company, else owned by it — COALESCE(lease, owner) = company, never owner OR lease (a unit leased
// out counts only for the lessee). LEAD 443.265-F (CC-2): read the gate where it lives.
const IN_SERVICE = "apps/backend/src/dispatch/unit-in-service.ts";
const CANONICAL = "apps/backend/src/dispatch/canonical-active-load-set.ts";
const inServiceDefault = readFileSync(IN_SERVICE, "utf8");
const canonicalDefault = readFileSync(CANONICAL, "utf8");
function boardGateBody(canonical) {
  const i = canonical.indexOf("export function canonicalBoardUnitGateSql(");
  return i < 0 ? "" : canonical.slice(i, canonical.indexOf("\n}\n", i));
}

function check(legs, timeline, dispatch, routes, inService = inServiceDefault, canonical = canonicalDefault) {
  const errors = [];
  if (!/"booked"/.test(legs) || !/"planned"/.test(legs) || !/"unassigned"/.test(legs)) {
    errors.push("RT_TIMELINE_STATUSES must include booked, planned, unassigned (future + current legs)");
  }
  if (!/RT_PAIRING_ACTIVE_STATUSES/.test(legs)) {
    errors.push("pairing engine set RT_PAIRING_ACTIVE_STATUSES must remain the source for board pairing");
  }
  // LEAD 443.99 class B (2026-10-12).
  //   old rule: RT_TIMELINE_WINDOW_START = "2026-08-25" and defaultTimelineRange starts there (window = Aug 25 → today).
  //   new rule: defaultTimelineRange is RELATIVE to companyToday() and FIXED in length — from = today − RT_TIMELINE_DAYS_BACK,
  //             to = today + RT_TIMELINE_DAYS_FORWARD, the two constants spanning the owner's default 10 days
  //             (back + today + forward = 10); no literal date may seed the window.
  //   why: Lead #23270 (f686b095a3, 2026-09-30) with the owner's same-session correction ("caps at 7-10 days … if i
  //        want to see more days, i change in calendar"): the hard-coded start was a ratchet that grew one column per day
  //        (37 on 2026-09-30). A literal start date, a window that stops tracking today, or a span other than 10 days fails.
  const back = Number(/export const RT_TIMELINE_DAYS_BACK = (\d+);/.exec(timeline)?.[1] ?? NaN);
  const forward = Number(/export const RT_TIMELINE_DAYS_FORWARD = (\d+);/.exec(timeline)?.[1] ?? NaN);
  const rangeFn = /export function defaultTimelineRange\(\)[\s\S]*?\n\}/.exec(timeline)?.[0] ?? "";
  if (!/const today = companyToday\(\);/.test(rangeFn) ||
      !/from: shiftIsoDay\(today, -RT_TIMELINE_DAYS_BACK\)/.test(rangeFn) ||
      !/to: shiftIsoDay\(today, RT_TIMELINE_DAYS_FORWARD\)/.test(rangeFn)) {
    errors.push("defaultTimelineRange must be relative to companyToday(): today − RT_TIMELINE_DAYS_BACK → today + RT_TIMELINE_DAYS_FORWARD");
  }
  if (!(back + 1 + forward === 10)) {
    errors.push(`default timeline window must span the owner's 10 days (back ${back} + today + forward ${forward})`);
  }
  if (/\d{4}-\d{2}-\d{2}/.test(rangeFn)) {
    errors.push("defaultTimelineRange must not seed the window with a literal date (the 2026-08-25 ratchet)");
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
  const rt = readFileSync("apps/frontend/src/pages/dispatch/RoundTrips.tsx", "utf8");
  if (!/pairingReadFailed && boardView !== "timeline"/.test(rt)) {
    errors.push("idle-unit pairing 500 must not hide Timeline (REG-037)");
  }
  if (/effectiveLoadsLimit\s*=\s*roundTripsFullFetch \? 1000/.test(dispatch)) {
    errors.push("limit:1000 one-shot must not return (API zod max 200)");
  }
  if (!/GROUP BY[\s\S]{0,400}loc\.city[\s\S]{0,80}loc\.state[\s\S]{0,80}loc\.formatted_location/.test(routes)) {
    errors.push("units-without-load GROUP BY must include loc.city/state/formatted_location (COALESCE(p, loc) 500s without them)");
  }
  const mountsShared = /WHERE \$\{UNIT_IN_SERVICE_SQL\}/.test(routes) && /\$\{canonicalBoardUnitGateSql\("u", "\$1::uuid"\)\}/.test(inService);
  const gate = mountsShared ? `${inService}\n${boardGateBody(canonical)}` : routes;
  if (!mountsShared && !/u\.currently_leased_to_company_id = \$1::uuid/.test(routes)) {
    errors.push("units-without-load must mount THE board unit gate (UNIT_IN_SERVICE_SQL → canonicalBoardUnitGateSql) or scope by the lessee (Rule 49)");
  }
  if (mountsShared && !/COALESCE\(\$\{unitAlias\}\.currently_leased_to_company_id, \$\{unitAlias\}\.owner_company_id\) = \$\{operatingCompanyIdParam\}/.test(gate)) {
    errors.push("the board unit gate must scope a unit to its lessee, else its owner (COALESCE(lease, owner) — LEAD 443.206 D3/D4, Rule 49)");
  }
  if (/\bu\.owner_company_id = \$1(::uuid)? OR u\.currently_leased_to_company_id = \$1/.test(routes) || /owner_company_id = \$\{operatingCompanyIdParam\} OR/.test(gate)) {
    errors.push("units-without-load must not use owner OR lease (Rule 49 — a leased-out unit counts only for the lessee)");
  }
  const sample = mountsShared ? /\$\{unitAlias\}\.is_sample_data IS NOT TRUE/.test(gate) : /u\.is_sample_data IS NOT TRUE/.test(routes);
  const sold = mountsShared ? /\$\{unitAlias\}\.sold_date IS NULL/.test(gate) : /u\.sold_date IS NULL/.test(routes);
  const oos = /u\.is_oos IS NOT TRUE/.test(mountsShared ? inService : routes);
  if (!sample || !sold || !oos) {
    errors.push("units-without-load must exclude sample / sold / OOS units (Rule 49)");
  }
  return errors;
}

function selftest() {
  const legs = readFileSync(LEGS, "utf8");
  const timeline = readFileSync(TIMELINE, "utf8");
  const dispatch = readFileSync(DISPATCH, "utf8");
  const routes = readFileSync(ROUTES, "utf8");
  const good = check(legs, timeline, dispatch, routes);
  if (good.length) {
    console.error("SELFTEST FAIL — clean:\n  " + good.join("\n  "));
    process.exit(1);
  }
  for (const [name, badTimeline] of [
    ["literal start date returns", timeline.replace("from: shiftIsoDay(today, -RT_TIMELINE_DAYS_BACK)", 'from: "2026-08-25"')],
    ["window stops tracking today", timeline.replace("const today = companyToday();", 'const today = "2026-09-30";')],
    ["window widened past 10 days", timeline.replace(/RT_TIMELINE_DAYS_FORWARD = \d+;/, "RT_TIMELINE_DAYS_FORWARD = 35;")],
    ["last-13-days default returns", timeline.replace("from: shiftIsoDay(today, -RT_TIMELINE_DAYS_BACK)", "from: addDaysIso(to, -13)")],
  ]) {
    if (badTimeline === timeline || check(legs, badTimeline, dispatch, routes).length === 0) {
      console.error(`SELFTEST FAIL — window mutation not caught: ${name}`);
      process.exit(1);
    }
  }
  const badGroup = routes.replace(
    /p\.captured_at,\s*loc\.city, loc\.state, loc\.formatted_location/,
    "p.captured_at",
  );
  if (check(legs, timeline, dispatch, badGroup).length === 0) {
    console.error("SELFTEST FAIL — loc GROUP BY mutation not caught");
    process.exit(1);
  }
  const canonical = canonicalDefault, inService = inServiceDefault;
  const gatePlants = [
    ["owner-OR-lease in the board gate", [routes, inService, canonical.replace("COALESCE(${unitAlias}.currently_leased_to_company_id, ${unitAlias}.owner_company_id) = ${operatingCompanyIdParam}", "(${unitAlias}.owner_company_id = ${operatingCompanyIdParam} OR ${unitAlias}.currently_leased_to_company_id = ${operatingCompanyIdParam})")]],
    ["sample units admitted", [routes, inService, canonical.replace("${unitAlias}.is_sample_data IS NOT TRUE AND ", "")]],
    ["sold units admitted", [routes, inService, canonical.replace("${unitAlias}.sold_date IS NULL AND ", "")]],
    ["OOS units admitted", [routes, inService.replace("AND u.is_oos IS NOT TRUE", ""), canonical]],
    ["the route stops mounting the gate", [routes.replace("WHERE ${UNIT_IN_SERVICE_SQL}", "WHERE true"), inService, canonical]],
  ];
  for (const [name, [r, i, c]] of gatePlants) {
    if ((r === routes && i === inService && c === canonical) || check(legs, timeline, dispatch, r, i, c).length === 0) {
      console.error(`SELFTEST FAIL — unit-gate mutation not caught (or did not apply): ${name}`);
      process.exit(1);
    }
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
  readFileSync(ROUTES, "utf8"),
);
if (errors.length) {
  console.error("FAIL verify-reg037-roundtrips-timeline-window:\n  " + errors.join("\n  "));
  process.exit(1);
}
console.log("PASS verify-reg037-roundtrips-timeline-window");
