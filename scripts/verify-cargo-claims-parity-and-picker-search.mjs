#!/usr/bin/env node
/**
 * GUARD: cargo claims use the shared grid with real links; safety pickers search server-side.
 *
 * WHY THIS EXISTS (2026-07-23 audit — SAF-F21, SAF-F31)
 *
 * F21: /safety/cargo-claims rendered a raw <table> — outside the shared QBO-parity grammar, so no
 * density toggle, no column sizing, no export, no per-page control. Worse, it showed neither the
 * CLAIMANT nor the LOAD, the two things a cargo claim is actually about, and nothing on the row
 * drilled anywhere. Both are canonical FKs on safety.incidents (claimant_customer_id, load_id).
 *
 * F31: every safety picker fetched `limit: 200` with no server-side search, so past 200 units (or
 * loads, or vendors) the rest were unselectable and NOTHING told the operator — a silent truncation
 * on evidence and money records. The server already supported `search` on these endpoints; the
 * pickers just never sent it.
 *
 * The `onSearch` prop is optional and additive on purpose: every other call site in the app keeps
 * its client-side behaviour. Where it IS passed, local filtering is skipped — the server already
 * filtered, and filtering again would drop server matches whose label does not literally contain the
 * typed text (a unit matched by VIN, a load matched by customer name).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CARGO = "apps/frontend/src/pages/safety/components/CargoClaimIntakeSurface.tsx";
const COMBOBOX = "apps/frontend/src/components/Combobox.tsx";
const DRAWER = "apps/frontend/src/components/safety/AccidentReportDrawer.tsx";
const FILES = [CARGO, COMBOBOX, DRAWER];
const LABEL = "verify-cargo-claims-parity-and-picker-search";
const SELFTEST = process.argv.includes("--selftest");

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^[ \t]*\/\/.*$/gm, "");

export function assertCargoParityAndPickerSearch(sources) {
  const src = {};
  for (const rel of FILES) src[rel] = stripComments(sources?.[rel] ?? read(rel));
  const problems = [];

  // F21 — shared grid, not a hand-rolled table.
  if (!/ParityTable</.test(src[CARGO])) {
    problems.push(`${CARGO}: cargo claims do not use ParityTable — a raw <table> has no density toggle, column sizing, export or per-page control.`);
  }
  if (/<table\s/.test(src[CARGO])) {
    problems.push(`${CARGO}: still renders a raw <table> — the shared grammar was reintroduced alongside a hand-rolled grid.`);
  }
  // F21 — the two links a claim is about.
  if (!/kind="customer"/.test(src[CARGO]) || !/claimant_customer_id/.test(src[CARGO])) {
    problems.push(`${CARGO}: the claimant is not an EntityLink kind="customer" — a claim you cannot trace to its customer is a number in a list.`);
  }
  if (!/kind="load"/.test(src[CARGO]) || !/load_id/.test(src[CARGO])) {
    problems.push(`${CARGO}: the load is not an EntityLink kind="load".`);
  }

  // F31 — the engine supports server search and skips double-filtering.
  if (!/onSearch\?: \(query: string\) => void;/.test(src[COMBOBOX])) {
    problems.push(`${COMBOBOX}: no optional onSearch prop — pickers cannot ask the server, so limit:200 silently truncates.`);
  }
  if (!/if \(onSearch\) return sourceOptions\.slice\(0, MAX_VISIBLE_OPTIONS\);/.test(src[COMBOBOX])) {
    problems.push(`${COMBOBOX}: server-filtered options are still filtered locally — a server match whose label lacks the typed text (unit by VIN, load by customer) would be dropped before it renders.`);
  }

  // F31 — the safety pickers actually pass it, and the term reaches the request.
  for (const [state, what] of [
    ["unitSearch", "units"],
    ["loadSearch", "loads"],
    ["vendorSearch", "vendors"],
  ]) {
    if (!src[DRAWER].includes(state)) {
      problems.push(`${DRAWER}: no ${state} state — the ${what} picker cannot search server-side and stays capped at 200.`);
    }
    if (!new RegExp(`search: ${state} \\|\\| undefined`).test(src[DRAWER])) {
      problems.push(`${DRAWER}: ${what} query does not send \`search\` — the state exists but never reaches the server.`);
    }
    if (!new RegExp(`queryKey: \\[[^\\]]*${state}\\]`).test(src[DRAWER])) {
      problems.push(`${DRAWER}: ${what} queryKey omits ${state} — react-query would serve the first page from cache and never refetch on a new term.`);
    }
  }

  return problems;
}

if (SELFTEST) {
  const live = Object.fromEntries(FILES.map((rel) => [rel, read(rel)]));
  const failures = [];
  const expectCaught = (name, mutated, needle) => {
    if (JSON.stringify(mutated) === JSON.stringify(live)) {
      failures.push(`${name}: inert mutation — the guard was never actually exercised`);
      return;
    }
    const problems = assertCargoParityAndPickerSearch(mutated);
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(`${name}: NOT caught (expected "${needle}", got: ${problems.join(" | ") || "none"})`);
    }
  };

  expectCaught("paritytable-reverted",
    { ...live, [CARGO]: live[CARGO].split("ParityTable<").join("SomeOtherGrid<") }, "do not use ParityTable");
  expectCaught("claimant-link-dropped",
    { ...live, [CARGO]: live[CARGO].split('kind="customer"').join('kind="vendor"') }, "not an EntityLink kind=\"customer\"");
  expectCaught("combobox-loses-onsearch",
    { ...live, [COMBOBOX]: live[COMBOBOX].replace("onSearch?: (query: string) => void;", "someOtherProp?: string;") },
    "no optional onSearch prop");
  expectCaught("double-filtering-returns",
    { ...live, [COMBOBOX]: live[COMBOBOX].replace("if (onSearch) return sourceOptions.slice(0, MAX_VISIBLE_OPTIONS);", "") },
    "still filtered locally");
  expectCaught("search-term-never-sent",
    { ...live, [DRAWER]: live[DRAWER].replace("search: unitSearch || undefined", "limit: 200") },
    "units query does not send `search`");
  expectCaught("querykey-forgets-the-term",
    { ...live, [DRAWER]: live[DRAWER].replace('queryKey: ["accident", "loads", operatingCompanyId, loadSearch]', 'queryKey: ["accident", "loads", operatingCompanyId]') },
    "loads queryKey omits loadSearch");

  const liveProblems = assertCargoParityAndPickerSearch(live);
  if (liveProblems.length) failures.push(`live sources FAIL (false positive): ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 6 planted defects caught, live sources clean`);
  process.exit(0);
}

const problems = assertCargoParityAndPickerSearch();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — cargo claims use ParityTable with claimant + load drill-through; safety pickers search server-side`);
