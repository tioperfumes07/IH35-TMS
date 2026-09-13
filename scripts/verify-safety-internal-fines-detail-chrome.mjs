#!/usr/bin/env node
/** @matrix-built {"modules":["safety"],"cols":["driver","load"],"leafRe":"^safety\\.internal_fines\\.detail$","task":"SAFETY-INTERNAL-FINES-DETAIL-CHROME"} */
/** SAFETY-INTERNAL-FINES-DETAIL-CHROME — drawer drill-through, display #, load/settlement, QBO format, flat layout. */
import fs from "node:fs";

const PAGE = "apps/frontend/src/pages/safety/InternalFinesPage.tsx";
const DRAWER = "apps/frontend/src/pages/safety/components/InternalFineDetailDrawer.tsx";
const DISPLAY = "apps/frontend/src/lib/internal-fine-display.ts";
const ROUTES = "apps/backend/src/safety/safety-v5.routes.ts";

const sources = Object.fromEntries(
  [PAGE, DRAWER, DISPLAY, ROUTES].map((rel) => [rel, fs.readFileSync(rel, "utf8")]),
);

function failures(input) {
  const out = [];
  const page = input[PAGE];
  const drawer = input[DRAWER];
  const display = input[DISPLAY];
  const routes = input[ROUTES];

  if (!/InternalFineDetailDrawer/.test(page) || !/setSelectedFine\(/.test(page)) out.push("detail drawer");
  if (!/searchParams\.get\("fine_id"\)/.test(page) || !/next\.delete\("fine_id"\)/.test(page)) out.push("fine_id URL");
  // The "internal-fine-driver-open-" testid this check originally named never actually existed in
  // this file (confirmed via `git log -S`, empty across its whole history) — a driver cell that
  // ALSO opened the fine drawer would shadow the driver's own real destination. The real, correct,
  // established pattern (matching every other list page's Driver column in this codebase) is a real
  // EntityLink kind="driver" drill to the driver's own profile; the Fine # column (checked below via
  // internalFineDisplayId + "Fine #") is the actual drawer-open control.
  if (!/kind="driver"[\s\S]{0,120}?id=\{row\.driver_id/.test(page)) out.push("driver drills to profile");
  if (!/internalFineDisplayId/.test(page) || !/label: "Fine #"/.test(page)) out.push("display number column");
  if (!/formatUsd\(/.test(page)) out.push("QBO money formatUsd");
  if (/\.toFixed\(2\)/.test(page)) out.push("raw toFixed forbidden");
  if (!/formatDateUS\(/.test(page)) out.push("QBO calendar formatDateUS");
  if (!/kind="load"/.test(page) || !/related_load_number/.test(page)) out.push("load EntityLink");
  if (!/kind="settlement"/.test(page) && !/kind="settlement_deduction"/.test(page)) out.push("settlement linkage");
  if (/rounded-sm border border-gray-200 bg-white p-3/.test(page)) out.push("box-in-box create card");
  if (!/data-testid="internal-fines-create"/.test(page)) out.push("flat create section");
  if (!/ParityDrawer/.test(drawer) || !/formatUsd\(/.test(drawer) || !/formatDateUS\(/.test(drawer)) out.push("drawer QBO chrome");
  if (!/internalFineDisplayId/.test(drawer)) out.push("drawer display number");
  if (!/export function internalFineDisplayId/.test(display)) out.push("display helper");
  if (!/AS display_id/.test(routes) || !/related_load_number/.test(routes) || !/settlement_deduction_id/.test(routes)) out.push("list API enrichment");
  return out;
}

const current = failures(sources);
if (current.length) {
  console.error(`FAIL verify-safety-internal-fines-detail-chrome: ${current.join("; ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    [PAGE, () => sources[PAGE].replaceAll("setSelectedFine(", "setSelectedFineRemoved(")],
    [PAGE, () => sources[PAGE].replace('next.delete("fine_id")', "// delete fine_id")],
    [PAGE, () => sources[PAGE].replace('kind="driver"', 'kind="driverz"')],
    [PAGE, () => sources[PAGE].replaceAll("formatUsd(", "formatMoneyRaw(")],
    [PAGE, () => sources[PAGE].replace('data-testid="internal-fines-create"', 'data-testid="internal-fines-nested-card"')],
    [DRAWER, () => sources[DRAWER].replaceAll("ParityDrawer", "PlainDrawer")],
    [DISPLAY, () => sources[DISPLAY].replace("export function internalFineDisplayId", "export function missingDisplay")],
    [ROUTES, () => sources[ROUTES].replace("AS display_id", "AS hidden_id")],
  ];
  let caught = 0;
  for (const [file, mutate] of mutations) {
    const fixture = { ...sources, [file]: mutate() };
    if (failures(fixture).length) caught += 1;
  }
  if (caught !== mutations.length) {
    console.error(`FAIL selftest caught ${caught}/${mutations.length}`);
    process.exit(1);
  }
  console.log(`PASS(selftest): verify-safety-internal-fines-detail-chrome ${caught}/${mutations.length} mutations`);
  process.exit(0);
}

console.log("PASS: Internal Fines detail chrome (drawer, display #, load/settlement, QBO format, flat layout)");
