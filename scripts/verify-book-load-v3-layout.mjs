#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["load","connectivity"],"leaves":["dispatch.panel.tour_miles"],"task":"LEAD-443.269-A-TOUR-MILES-PANEL","vertical":"class-sweep"} */
/**
 * LEAD 443.265-A (owner-approved V3 boards 10-22-2026-LEAD-MOD-DESIGN-V3-Dispatch-BookLoad-{Modal,TripType,Spec};
 * live defects measured in Chrome 10-22 9:50 PM CT). Same fields, same order, same engines — layout only:
 *   R1  Load # is a 110px box with every helper line UNDER it (the label's 160px min-width spilled the hint
 *       across "Previewed — assigned on save"); Load # and the rate-con upload sit in separate grid cells.
 *   R2  Broker / Direct has its own content-sized grid cell (it overflowed a ¼ cell into Commodity).
 *   R3  NB / TR / SB are three equal cards; NB shows Border crossing *, TR the tour line, SB both.
 *   R4  Section C miles: source order 1 AlwaysTrack lane history → 2 Select from reference → 3 Type it;
 *       the reference lists lanes on file into the same state (practical / trips / confidence) and never
 *       offers short miles; Google practical / short / empty line UNDER each box.
 *   R5  Every wizard input 32px; stop row 2 = City fills · State 64 · ZIP 88 · Appointment date 150 ·
 *       Time · Time window; columns A/B top-aligned (no stretched white block under column A).
 *   R6  (live walk 10-23 after #27294) the port-of-entry select is 390px (SelectCombobox's bare wrapper shrank it
 *       to ~100px); the 64px State cell shows the code with no clear button and no box-in-box ("T ×");
 *       Location / Address align at the top.
 *   R7  (Lead live 5:47 AM) columns A and B end level — A stretches and its last field (Special notes) fills
 *       the remaining height (no white block under it); "Upload Rate Con" is a one-line button.
 *   R8  (LEAD 443.269-A, owner live 10-23 on Pre-Settlements) the tours register has a "Load #" column (one per load);
 *       Ready to close? is a compact 2-column list whose EVERY row navigates (NB load · Truck Line assign · POD
 *       documents · tour costs · driver bills · miles panel); "Close tour → Settlement" is ENABLED at N of N and opens
 *       Settlement Close for this driver; the miles panel shows OUR database AND Google side by side; Entries says it
 *       is read-only and links to where an entry is made.
 *   R9  (443.269-A item 6) Drivers header: On Loads = drivers on dispatched/at-pickup/in-transit/at-delivery loads of
 *       the one board set, by driver id; Available = Active minus on loads; both click through to a filtered roster.
 *   R10 (LEAD 443.280-C, Spec board "1,260 center or 760 side panel") Book Load center 1260px / side 760px, both clamped
 *       to the viewport; the Load # number right-aligned in its 110px box (Modal board justify-content:flex-end).
 *   R11 (443.280-C) Truck Planner bars: "<load #> · <lane>" and "$ · mi · $/mi" from the load (practical miles).
 * --selftest plants each regression and requires a FAIL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const D = "apps/frontend/src/pages/dispatch/components";
const FILES = {
  modal: `${D}/BookLoadModalV4.tsx`,
  idBar: `${D}/book-load-v4/LiveLoadIdBar.tsx`,
  border: `${D}/book-load-v4/BorderCrossingCaptureField.tsx`,
  strip: `${D}/book-load-v4/MilesStrip.tsx`,
  stops: `${D}/BookLoadStopsSection.tsx`,
  service: "apps/backend/src/dispatch/lane-mileage.service.ts",
  ratecon: `${D}/book-load-v4/RateConUploadPanel.tsx`,
  legs: "apps/frontend/src/components/dispatch/TourLegsCell.tsx",
  tour: "apps/frontend/src/components/dispatch/TourPreSettlementTab.tsx",
  miles: "apps/frontend/src/components/dispatch/TourMilesPanel.tsx",
  close: "apps/frontend/src/pages/driver-finance/SettlementCloseArrivalPage.tsx",
  drivers: "apps/frontend/src/pages/Drivers.tsx",
  planner: "apps/frontend/src/pages/dispatch/planners/TruckPlanner.tsx",
  plannerBars: "apps/frontend/src/pages/dispatch/planners/planner-bars.ts",
};

export function audit(s) {
  const f = [];
  const need = (rule, cond, msg) => {
    if (!cond) f.push(`${rule}: ${msg}`);
  };
  // R1
  need("R1", /flex w-full max-w-\[220px\] flex-col/.test(s.idBar), "the Load # bar is not a column (helper beside the box overlaps it)");
  need("R1", /w-\[110px\] min-w-\[110px\] max-w-\[110px\][^"]*\[&_label\]:min-w-0/.test(s.idBar), "the 110px Load # box lets its label's min-width spill over the helper");
  need("R1", /data-testid="book-load-id-row"/.test(s.modal) && /sm:grid-cols-\[220px_minmax\(0,1fr\)\]/.test(s.modal), "Load # and the rate-con upload are not separate grid cells");
  // R2
  need("R2", /md:grid-cols-\[max-content_minmax\(0,1\.4fr\)/.test(s.modal) && /data-testid="book-load-freight-row"/.test(s.modal), "Broker / Direct shares a ¼ cell with Commodity");
  // R3
  const banner = s.modal.slice(s.modal.indexOf('data-testid="trip-type-banner"'), s.modal.indexOf("{gateBanner ? ("));
  need("R3", /grid grid-cols-1 gap-2 sm:grid-cols-3/.test(banner) && /trip-type-card-\$\{code\}/.test(banner), "NB / TR / SB are not three equal cards");
  need("R3", /watchedTripType === "TR" \|\| watchedTripType === "SB" \?[\s\S]{0,200}trip-type-tour-line/.test(banner), "TR / SB do not show the tour line");
  need("R3", /isCrossBorderTripType\(watchedTripType\) \?[\s\S]{0,40}<BorderCrossingCaptureField/.test(banner), "Border crossing is not rendered under the NB / SB cards");
  need("R3", /Border crossing — port of entry/.test(s.border) && !/bg-\[#FFF7ED\]/.test(s.border), "Border crossing is not the board field (label + select + consequence line)");
  // R4
  need("R4", /\["AlwaysTrack lane history", "Select from reference", "Type it"\]/.test(s.strip), "the mileage source order is not AlwaysTrack → reference → type it");
  need("R4", /data-testid="book-load-miles-reference-row"/.test(s.strip) && /onUseReferenceLane\(lane\)/.test(s.strip), "no Select-from-reference lanes");
  need("R4", /export async function listLaneMileageReference\(/.test(s.service) && /lower\(dest_state\) = lower\(\$4\)/.test(s.service), "the reference does not read lanes on file into the same state");
  const ref = s.service.slice(s.service.indexOf("export async function listLaneMileageReference("));
  need("R4", !/short_miles/.test(ref), "the reference offers short miles from the catalog");
  for (const id of ["book-load-google-reference-miles", "book-load-google-reference-short", "book-load-google-reference-empty"]) {
    const at = s.strip.indexOf(`data-testid="${id}"`);
    const grid = s.strip.indexOf('<div className="grid grid-cols-2 md:grid-cols-4">');
    const gridEnd = s.strip.indexOf('{referenceLanes && laneState === "new"');
    need("R4", at > grid && at < gridEnd && grid >= 0, `${id} is not under its box`);
  }
  // R5
  need("R5", /\.blw-sec input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\):not\(\[type="hidden"\]\):not\(\[type="file"\]\):not\(\.dp-input\),\n\.blw-sec select\{height:32px\}/.test(s.modal), "wizard inputs are not 32px");
  need("R5", /lg:grid-cols-\[minmax\(0,1fr\)_64px_88px_150px_104px_minmax\(0,0\.9fr\)\]/.test(s.stops), "stop row 2 is not City · State 64 · ZIP 88 · Appt 150 · Time · Time window");
  need("R5", /"--ih-w-date": "150px", "--ih-h-field": "32px"/.test(s.stops) && /style=\{APPT_BOX_VARS\}/.test(s.stops), "the appointment date box is not 150 × 32");
  // R7
  need("R7", /grid grid-cols-1 items-stretch gap-3 lg:grid-cols-\[1\.05fr_1fr\]/.test(s.modal) && /blw-sec flex flex-col" data-testid="book-load-section-a"/.test(s.modal), "column A does not stretch to column B's height");
  need("R7", /flex min-h-\[64px\] flex-1 flex-col gap-0\.5" data-testid="book-load-special-notes"/.test(s.modal), "column A leaves a white block under Special notes (the last field does not fill)");
  need("R7", /inline-flex h-8 shrink-0 cursor-pointer items-center whitespace-nowrap/.test(s.ratecon), "Upload Rate Con wraps (not a one-line button)");
  // R6
  need("R6", /<div className="w-\[390px\] max-w-full shrink-0">\s*<SelectCombobox/.test(s.border), "the port-of-entry select shrinks to its content (not the 390px board width)");
  need("R6", /<StateSelect [^>]*className="w-full" compact \/>/.test(s.stops) && !/CELL_STATE/.test(s.stops), "the 64px State cell clips its value (box-in-box + clear button)");
  need("R6", /items-start gap-2 sm:grid-cols-\[1fr_1\.4fr\]/.test(s.stops), "Location / Address are bottom-aligned (Address sits lower than Location)");
  // R8
  need("R8", /label: i === 0 \? "Load #" : `Load # \$\{i \+ 1\}`/.test(s.legs), "the tours register has no Load # column");
  need("R8", /data-testid="tour-close-button" disabled=\{!r\.can_close \|\| close\.isPending\}/.test(s.tour), "Close tour is not enabled at N of N (all hard checks ⇒ can_close)");
  need("R8", /data-testid="tour-open-settlement-close" to=\{`\/driver-finance\/settlement-close\?driver_id=/.test(s.tour) && /closeSearchParams\.get\("driver_id"\)/.test(s.close), "the pre-settlement does not open Settlement Close for this driver");
  for (const key of ["has_nb", "sb_delivered", "pods", "costs_complete", "driver_pay", "real_miles"]) {
    need("R8", new RegExp(`case "${key}":\\s*return \\{ kind: "[a-z-]+", title: [\\s\\S]{0,200}?, go: \\(\\) => `).test(s.tour), `readiness row "${key}" does not go anywhere`);
  }
  need("R8", /onClick=\{target\.go\}/.test(s.tour) && /grid-cols-\[max-content_max-content\]/.test(s.tour), "readiness rows are not a compact clickable list");
  need("R8", /data-testid=\{`tour-miles-db-\$\{field\}`\}/.test(s.miles) && /data-testid=\{`tour-miles-google-\$\{field\}`\}/.test(s.miles) && /useLoadMilesRecommendations\(/.test(s.miles), "the miles panel does not show our database AND Google from the one miles engine");
  need("R8", /<SettlementCloseMiles settlementId=\{settlement\.id\}/.test(s.close) && /<TourMilesPanel legs=\{legs\}/.test(s.close), "Settlement Close does not show our database + Google miles (owner: miles everywhere)");
  need("R8", /data-testid="tour-entries-readonly"/.test(s.tour) && /tour-entries-add-link/.test(s.tour), "Entries neither works nor says it is read-only with a link to where entries are made");
  // R9
  need("R9", /DRIVER_ON_LOAD_STATUSES = new Set\(\["dispatched", "at_pickup", "in_transit", "at_delivery"\]\)/.test(s.drivers) && /ids\.add\(String\(id\)\)/.test(s.drivers), "On Loads is not counted by driver id from dispatched / in-transit / at-stop loads");
  need("R9", /d\.status === "Active" && !onLoadDriverIds\.has\(String\(d\.id\)\)/.test(s.drivers), "Available is not Active minus on loads");
  need("R9", /to="\/drivers\/roster\?status=all&load_state=on"/.test(s.drivers) && /to="\/drivers\/roster\?status=active&load_state=free"/.test(s.drivers) && /loadStateFilter === "on"/.test(s.drivers), "On Loads / Available do not click through to a filtered roster");
  // R10
  need("R10", /max-w-\[min\(1260px,calc\(100vw-2rem\)\)\]/.test(s.modal) && /w-\[760px\] max-w-\[100vw\]/.test(s.modal) && /\{ width: "min\(760px, 100vw\)", minWidth: 440/.test(s.modal), "Book Load is not 1260 center / 760 side (Spec board), clamped to the viewport");
  need("R10", /\[&_input\]:text-right/.test(s.idBar), "the Load # number is not right-aligned in its box");
  // R11
  need("R11", /bar\.label = `\$\{load\.load_number\} · \$\{plannerBarLane\(load\)\}`/.test(s.planner) && /bar\.detail = plannerBarMoneyDetail\(load\)/.test(s.planner), "Truck Planner bars do not carry the lane and $ · mi · $/mi");
  need("R11", /load\.miles_practical/.test(s.plannerBars) && /\/mi`/.test(s.plannerBars) && /if \(!\(miles > 0\)\) return `\$\{money\} · — mi`/.test(s.plannerBars), "planner $/mi is not rate ÷ practical miles (or divides by a missing mile)");
  return f;
}

function load() {
  const out = {};
  for (const [k, rel] of Object.entries(FILES)) out[k] = fs.readFileSync(path.join(ROOT, rel), "utf8");
  return out;
}

if (process.argv.includes("--selftest")) {
  const real = load();
  const base = audit(real).length;
  const plant = (key, from, to) => {
    if (!real[key].includes(from)) return null;
    return audit({ ...real, [key]: real[key].replace(from, to) }).length > base;
  };
  const cases = [
    ["helper beside the Load # box FAILS", plant("idBar", "flex w-full max-w-[220px] flex-col", "flex flex-wrap items-end gap-3")],
    ["Broker / Direct in a ¼ cell FAILS", plant("modal", "md:grid-cols-[max-content_minmax(0,1.4fr)", "md:grid-cols-4 x[")],
    ["trip type as small buttons FAILS", plant("modal", "grid grid-cols-1 gap-2 sm:grid-cols-3", "mt-1 flex flex-wrap gap-2")],
    ["border crossing outside the cards FAILS", plant("modal", "isCrossBorderTripType(watchedTripType) ? (\n              <BorderCrossingCaptureField", "false ? (\n              <BorderCrossingCaptureField")],
    ["source order swapped FAILS", plant("strip", '["AlwaysTrack lane history", "Select from reference", "Type it"]', '["Type it", "AlwaysTrack lane history", "Select from reference"]')],
    ["short miles offered from the catalog FAIL", plant("service", "id, origin_city, origin_state, dest_city, dest_state, practical_miles, n_practical, confidence", "id, origin_city, origin_state, dest_city, dest_state, practical_miles, short_miles, n_practical, confidence")],
    ["Google line moved below the strip FAILS", plant("strip", '<div className="grid grid-cols-2 md:grid-cols-4">', '<div className="grid grid-cols-2 md:grid-cols-4 x">')],
    ["28px inputs FAIL", plant("modal", ".blw-sec select{height:32px}", ".blw-sec select{height:28px}")],
    ["equal City / State / ZIP FAIL", plant("stops", "lg:grid-cols-[minmax(0,1fr)_64px_88px_150px_104px_minmax(0,0.9fr)]", "lg:grid-cols-6")],
    ["port select back in a shrinking wrapper FAILS", plant("border", '<div className="w-[390px] max-w-full shrink-0">', "<div>")],
    ["State without compact FAILS", plant("stops", 'className="w-full" compact />', 'className="w-full" />')],
    ["bottom-aligned Location / Address FAILS", plant("stops", "items-start gap-2 sm:grid-cols-[1fr_1.4fr]", "items-end gap-2 sm:grid-cols-[1fr_1.4fr]")],
    ["no Load # column FAILS", plant("legs", 'label: i === 0 ? "Load #" : `Load # ${i + 1}`', "label: `Leg ${i + 1}`")],
    ["Close disabled at N of N FAILS", plant("tour", 'data-testid="tour-close-button" disabled={!r.can_close || close.isPending}', 'data-testid="tour-close-button" disabled={true}')],
    ["Settlement Close without the miles panel FAILS", plant("close", "<SettlementCloseMiles settlementId={settlement.id}", "<div data-x={settlement.id}")],
    ["no way to Settlement Close FAILS", plant("tour", 'data-testid="tour-open-settlement-close"', 'data-testid="x"')],
    ["a dead readiness row FAILS", plant("tour", 'case "pods":', 'case "pods_dead":')],
    ["miles panel without Google FAILS", plant("miles", "data-testid={`tour-miles-google-${field}`}", "data-x")],
    ["Entries silently read-only FAILS", plant("tour", 'data-testid="tour-entries-readonly"', "")],
    ["On Loads by driver name FAILS", plant("drivers", "ids.add(String(id))", "ids.add(String(load.driver_short_name))")],
    ["Available = all active FAILS", plant("drivers", 'd.status === "Active" && !onLoadDriverIds.has(String(d.id))', 'd.status === "Active"')],
    ["column A ending above column B FAILS", plant("modal", "grid grid-cols-1 items-stretch gap-3 lg:grid-cols-[1.05fr_1fr]", "grid grid-cols-1 items-start gap-3 lg:grid-cols-[1.05fr_1fr]")],
    ["white block under Special notes FAILS", plant("modal", 'flex min-h-[64px] flex-1 flex-col gap-0.5" data-testid="book-load-special-notes"', 'flex flex-col gap-0.5" data-testid="book-load-special-notes"')],
    ["wrapping Upload Rate Con FAILS", plant("ratecon", "items-center whitespace-nowrap", "items-center")],
    ["the old 1120 center FAILS", plant("modal", "max-w-[min(1260px,calc(100vw-2rem))]", "max-w-[min(1120px,calc(100vw-2rem))]")],
    ["the old 660 side panel FAILS", plant("modal", "w-[760px] max-w-[100vw]", "w-[660px] max-w-[100vw]")],
    ["a left-aligned Load # FAILS", plant("idBar", "[&_input]:text-right", "[&_input]:text-left")],
    ["planner bar without the lane FAILS", plant("planner", "bar.label = `${load.load_number} · ${plannerBarLane(load)}`", "bar.label = load.load_number")],
    ["planner bar with only the $ FAILS", plant("planner", "bar.detail = plannerBarMoneyDetail(load)", "bar.detail = String(load.rate_total_cents)")],
    ["$/mi dividing by a missing mile FAILS", plant("plannerBars", "if (!(miles > 0)) return `${money} · — mi`;", "")],
  ];
  let bad = 0;
  for (const [n, ok] of cases) {
    console.log(`  ${ok ? "✓" : "✗"} ${n}${ok === null ? " (plant anchor missing)" : ""}`);
    if (!ok) bad += 1;
  }
  console.log(bad ? "verify-book-load-v3-layout --selftest FAIL" : `verify-book-load-v3-layout --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

const failures = audit(load());
if (failures.length) {
  console.error(`verify-book-load-v3-layout: FAIL — ${failures.length}`);
  for (const x of failures) console.error(`  ✗ ${x}`);
  process.exit(1);
}
console.log("verify-book-load-v3-layout: OK — 1260/760 widths, Load # right-aligned, planner lane + $/mi, Load # helper under the box, Broker/Direct own cell, NB/TR/SB cards, miles source order + reference lanes, 32px stop rows, live-walk fixes, A/B level, Pre-Settlements close flow + Drivers KPIs (R1–R9)");
