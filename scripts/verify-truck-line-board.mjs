#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["connectivity"],"leafRe":"^dispatch\\.board\\.truck_line$","task":"ROUND-23.1-TRUCK-LINE-FIVE-DEFECTS"} */
/**
 * ROUND 23.1 — TRUCK LINE: five owner-reported, live-verified defects (2026-09-13).
 *
 * D1 — drivers with no unit are not rows on this UNIT board (filtered in the row builder, not the
 *      renderer, so the top-bar count and the rendered row count can never disagree).
 * D2 — stale GPS never prints raw minutes past 60 (fmtDuration, same helper every other duration
 *      on this board uses), and keeps the last known location beside the age.
 * D3 — every position label carries "City, ST" (or the richer formatted_location) — one shared
 *      helper, every call site.
 * D4 — Next appointment renders BOTH the pickup and delivery lines when both exist.
 * D5 — every column header is a real sortable control (aria-sort, three-state click cycle).
 *
 * --selftest plants each regression and requires the guard to fail.
 */
import fs from "node:fs";

const ROUTES = "apps/backend/src/dispatch/truck-line/truck-line.routes.ts";
const BOARD = "apps/frontend/src/pages/dispatch/TruckLineBoard.tsx";
const API = "apps/frontend/src/api/truckLine.ts";

function analyze(src) {
  const { routes, board, api } = src;
  const errors = [];

  // D1 — THIS IS A UNIT BOARD.
  if (!/\.filter\(\(r\) => r\.unit_id != null && r\.unit_number != null\)/.test(routes)) {
    errors.push("D1: truck-line.routes.ts must filter availableRows to unit_id/unit_number != null in the row builder");
  }
  if (/no unit assigned/.test(board)) {
    errors.push('D1: TruckLineBoard.tsx must never render the retired "no unit assigned" string — an available row always has a real unit');
  }

  // D2 — stale GPS format + location kept.
  if (!/function formatStaleAge/.test(board) || !/staleMinutes <= 60/.test(board)) {
    errors.push("D2a: TruckLineBoard.tsx must format stale age via a helper that keeps raw minutes only at or under 60, fmtDuration beyond that");
  }
  if (!/fmtDuration\(staleMinutes \* 60_000\)/.test(board)) {
    errors.push("D2a: formatStaleAge must hand off to the SAME fmtDuration every other duration on this board uses, not a second duration formatter");
  }
  const staleBranch = (board.match(/live\.signalLabel === "Stale" \? \(([\s\S]*?)\) : \(/) ?? [])[1] ?? "";
  if (!/formatLocationLabel\(r\.position\)/.test(staleBranch)) {
    errors.push("D2b: the Stale branch must still render the last known location (formatLocationLabel(r.position)) beside the age");
  }
  if (!/formatStaleAge\(r\.position\?\.stale_minutes/.test(staleBranch)) {
    errors.push("D2b: the Stale branch must render the age via formatStaleAge, not raw stale_minutes");
  }

  // D3 — state present on every position label, one shared helper.
  if (!/function formatLocationLabel/.test(board)) {
    errors.push("D3: TruckLineBoard.tsx must define one formatLocationLabel helper — no per-call-site concatenation");
  }
  if (!/if \(loc\.formatted_location\) return loc\.formatted_location;/.test(board)) {
    errors.push("D3: formatLocationLabel must prefer formatted_location (the richest string) before falling back to city+state");
  }
  const locationCallSites = (board.match(/formatLocationLabel\(/g) ?? []).length;
  if (locationCallSites < 4) {
    // 1 definition + Live branch + Stale branch + THE AVAILABLE TRUCK's parked-at line + the
    // pickup/delivery appointment lines (D4) — one helper, many call sites, never re-concatenated.
    errors.push(`D3: formatLocationLabel must be reused at every position call site (Live/Stale/parked-at/appointments) — found only ${locationCallSites} reference(s)`);
  }
  if (!/COALESCE\(p\.formatted_location, loc\.formatted_location\) AS pos_formatted_location/.test(routes)) {
    errors.push("D3: truck-line.routes.ts must select formatted_location (COALESCE'd the same way as city/state) so the frontend helper has it to prefer");
  }

  // D4 — both appointment lines.
  if (!/appointments:\s*\{\s*pickup:\s*AppointmentLeg;\s*delivery:\s*AppointmentLeg\s*\}\s*\|\s*null\s*=\s*null;/.test(routes)) {
    errors.push("D4: truck-line.routes.ts must declare a typed `appointments: { pickup; delivery } | null` local, alongside (not replacing) next_appointment");
  }
  if (!/\bappointments,\n/.test(routes)) {
    errors.push("D4: truck-line.routes.ts must return `appointments` on the loaded row, beside next_appointment");
  }
  if (!/next_appointment: nextAppointment,/.test(routes)) {
    errors.push("D4: next_appointment must stay exactly as-is for one release (kept beside the new appointments field)");
  }
  if (!/data-testid=\{`truck-line-appt-pickup-\$\{r\.unit_id\}`\}/.test(board) || !/data-testid=\{`truck-line-appt-delivery-\$\{r\.unit_id\}`\}/.test(board)) {
    errors.push("D4: TruckLineBoard.tsx must render BOTH a pickup line and a delivery line, each independently gated on its own r.appointments.pickup / .delivery");
  }
  if (!/Pickup ·/.test(board) || !/Delivery ·/.test(board)) {
    errors.push('D4: the appointment cell must label each line "Pickup ·" / "Delivery ·"');
  }
  // Each leg's line must be independently conditional (r.appointments.pickup ? ... : null / r.appointments.delivery ? ... : null)
  // — never a single combined condition that would force both lines to appear together or neither.
  if (!/\{r\.appointments\.pickup \? \(/.test(board) || !/\{r\.appointments\.delivery \? \(/.test(board)) {
    errors.push("D4: pickup and delivery lines must each be gated on their OWN appointments field — never a single combined condition (a load with one remaining leg must render only that line)");
  }

  // D5 — sortable headers.
  if (!/aria-sort=\{ariaSort\}/.test(board)) {
    errors.push("D5: every column header must carry aria-sort");
  }
  const sortKeys = ["truck", "load", "line", "appt", "signal"];
  for (const key of sortKeys) {
    if (!new RegExp(`sortKey="${key}"`).test(board)) errors.push(`D5: header for sortKey="${key}" missing — every one of the five columns must be sortable`);
  }
  // Bounded to a fixed window right after `const cycleSort` — an open-ended slice-to-end-of-file
  // would let a planted mutation that deletes cycleSort's own `return null;` hide behind some
  // unrelated `return null;` elsewhere in the file (there are several); a brace-search for the
  // function's own closing `};` is just as unsafe here because `{ key, dir: "asc" };` (an object
  // literal followed by a semicolon) matches the same "};" text well before the real function end.
  const cycleSortStart = board.indexOf("const cycleSort");
  const cycleSortBody = cycleSortStart >= 0 ? board.slice(cycleSortStart, cycleSortStart + 300) : "";
  if (
    !/if \(!prev \|\| prev\.key !== key\) return \{ key, dir: "asc" \};/.test(cycleSortBody) ||
    !/if \(prev\.dir === "asc"\) return \{ key, dir: "desc" \};/.test(cycleSortBody) ||
    !/return null;/.test(cycleSortBody)
  ) {
    errors.push("D5: sort must cycle three states — ascending, descending, then back to the board's default (null) order");
  }
  // Sorting must never persist (no storageKey — already asserted by verify-dispatch-truck-line.mjs
  // check (j)) and must never re-fetch: cycleSort/setSort must never appear beside a refetch or
  // invalidateQueries call.
  if (/refetch\(\)|invalidateQueries/.test(cycleSortBody)) {
    errors.push("D5: changing the sort must never re-fetch — cycleSort must only update local state");
  }
  if (!/const rows = useMemo/.test(board) || !/withIndex\.sort\(/.test(board)) {
    errors.push("D5: sorting must happen client-side over rows already in hand (a stable sort with an original-index tiebreak), never a second query");
  }

  return errors;
}

function loadSources() {
  return {
    routes: fs.readFileSync(ROUTES, "utf8"),
    board: fs.readFileSync(BOARD, "utf8"),
    api: fs.readFileSync(API, "utf8"),
  };
}

function withField(src, field, transform) {
  return { ...src, [field]: transform(src[field]) };
}

if (process.argv.includes("--selftest")) {
  const base = loadSources();
  const clean = analyze(base);
  if (clean.length) {
    console.error(`SELFTEST FAIL — clean source rejected:\n- ${clean.join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    ["D1 backend filter removed", withField(base, "routes", (s) => s.replace(".filter((r) => r.unit_id != null && r.unit_number != null)\n      ", ""))],
    ["D1 retired string reintroduced", withField(base, "board", (s) => s.replace("available truck", "no unit assigned"))],
    ["D2a formatStaleAge threshold removed", withField(base, "board", (s) => s.replace("staleMinutes <= 60", "false"))],
    ["D2a formatStaleAge stops using fmtDuration", withField(base, "board", (s) => s.replace("fmtDuration(staleMinutes * 60_000)", "String(staleMinutes)"))],
    ["D2b Stale branch drops the location", withField(base, "board", (s) => s.replace('<b style={{ color: RED }}>Stale</b> · {formatLocationLabel(r.position)} ·{" "}', '<b style={{ color: RED }}>Stale</b> ·{" "}'))],
    ["D2b Stale branch stops using formatStaleAge", withField(base, "board", (s) => s.replace("formatStaleAge(r.position?.stale_minutes ?? null) ?? \"—\"", "r.position?.stale_minutes ?? \"—\""))],
    ["D3 helper removed", withField(base, "board", (s) => s.replace("function formatLocationLabel", "function goneFormatLocationLabel"))],
    ["D3 formatted_location preference removed", withField(base, "board", (s) => s.replace("if (loc.formatted_location) return loc.formatted_location;", ""))],
    ["D3 backend stops selecting formatted_location", withField(base, "routes", (s) => s.replace("COALESCE(p.formatted_location, loc.formatted_location) AS pos_formatted_location,", ""))],
    ["D4 appointments type removed", withField(base, "routes", (s) => s.replace("appointments: { pickup: AppointmentLeg; delivery: AppointmentLeg } | null = null;", "appointments: unknown = null;"))],
    ["D4 appointments field dropped from the return", withField(base, "routes", (s) => s.replace("        appointments,\n", ""))],
    ["D4 next_appointment removed", withField(base, "routes", (s) => s.replace("next_appointment: nextAppointment,", ""))],
    ["D4 delivery line testid removed", withField(base, "board", (s) => s.replace('data-testid={`truck-line-appt-delivery-${r.unit_id}`}', ""))],
    ["D4 pickup/delivery collapsed into one combined condition", withField(base, "board", (s) => s.replace("{r.appointments.delivery ? (", "{false ? ("))],
    ["D5 aria-sort removed", withField(base, "board", (s) => s.replace("aria-sort={ariaSort}", ""))],
    ["D5 a sortKey column dropped", withField(base, "board", (s) => s.replace('sortKey="signal"', 'sortKey="gone"'))],
    ["D5 three-state cycle broken (no default restore)", withField(base, "board", (s) => s.replace('if (prev.dir === "asc") return { key, dir: "desc" };\n      return null;', 'if (prev.dir === "asc") return { key, dir: "desc" };\n      return { key, dir: "asc" };'))],
    ["D5 sort triggers a refetch", withField(base, "board", (s) => s.replace("const cycleSort = (key: TruckLineSortKey) => {", "const cycleSort = (key: TruckLineSortKey) => {\n    void query.refetch();"))],
  ];
  let caught = 0;
  for (const [label, mutated] of mutations) {
    if (analyze(mutated).length > 0) { caught += 1; continue; }
    console.error(`SELFTEST FAIL — mutation escaped: ${label}`);
    process.exit(1);
  }
  console.log(`PASS verify-truck-line-board --selftest ${caught}/${mutations.length}`);
  process.exit(0);
}

const failures = analyze(loadSources());
if (failures.length) {
  console.error("FAIL verify-truck-line-board");
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}
console.log("PASS verify-truck-line-board — D1 unit-only rows, D2 stale age+location honest, D3 state on every position label, D4 both appointment lines, D5 sortable headers with aria-sort + three-state cycle");
