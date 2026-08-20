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

  // F31 — the engine supports server search and skips double-filtering AND re-capping.
  // FE-COMBOBOX-50-DISPLAY-CAP (2026-08-08): the prior assertion required
  // `if (onSearch) return sourceOptions.slice(0, MAX_VISIBLE_OPTIONS)` — that kept a silent 50-row
  // display cap AFTER the server returned the full roster (ACCT-F209). The real SAF-F31 contract is:
  // when onSearch is set, return sourceOptions untouched (no local query filter, no MAX slice).
  if (!/onSearch\?: \(query: string\) => void;/.test(src[COMBOBOX])) {
    problems.push(`${COMBOBOX}: no optional onSearch prop — pickers cannot ask the server, so limit:200 silently truncates.`);
  }
  if (!/if \(onSearch\) return sourceOptions;/.test(src[COMBOBOX])) {
    problems.push(
      `${COMBOBOX}: server-filtered options are not returned as-is — either they are still filtered locally ` +
        `(dropping VIN/customer matches) or they are re-capped with MAX_VISIBLE_OPTIONS (FE-COMBOBOX-50-DISPLAY-CAP).`
    );
  }
  if (/if \(onSearch\) return sourceOptions\.slice\(0, MAX_VISIBLE_OPTIONS\);/.test(src[COMBOBOX])) {
    problems.push(
      `${COMBOBOX}: onSearch path still slices to MAX_VISIBLE_OPTIONS — server-returned roster is truncated in the UI with no notice.`
    );
  }
  if (!/onBlur=\{handleInputBlur\}/.test(src[COMBOBOX]) || !/function handleInputBlur/.test(src[COMBOBOX])) {
    problems.push(
      `${COMBOBOX}: Combobox must close its portal list on blur/tab-away — otherwise Payment Terms (and every picker) stays open until a row is picked.`
    );
  }

  // F31 — unit/load/vendor: EntityPicker (registry server search) OR legacy Combobox+*Search state.
  // EntityPicker supersedes local unitSearch/loadSearch/vendorSearch — the registry's own vendor
  // entry (components/parity/entityPickerRegistry.ts) already carries real server search
  // (serverSearch: true, search-scoped limit), so the F31 guarantee still holds under the new picker.
  const unitViaEntityPicker = /EntityPicker[\s\S]*?kind=["']unit["']/.test(src[DRAWER]);
  const loadViaEntityPicker = /EntityPicker[\s\S]*?kind=["']load["']/.test(src[DRAWER]);
  const vendorViaEntityPicker = /EntityPicker[\s\S]*?kind=["']vendor["']/.test(src[DRAWER]);
  if (!unitViaEntityPicker) {
    if (!src[DRAWER].includes("unitSearch")) {
      problems.push(`${DRAWER}: no unitSearch state — the units picker cannot search server-side and stays capped at 200.`);
    } else if (!/search: unitSearch \|\| undefined/.test(src[DRAWER])) {
      problems.push(`${DRAWER}: units query does not send \`search\` — the state exists but never reaches the server.`);
    } else if (!/queryKey: \[[^\]]*unitSearch\]/.test(src[DRAWER])) {
      problems.push(`${DRAWER}: units queryKey omits unitSearch — react-query would serve the first page from cache and never refetch on a new term.`);
    }
  }
  if (!loadViaEntityPicker) {
    if (!src[DRAWER].includes("loadSearch")) {
      problems.push(`${DRAWER}: no loadSearch state — the loads picker cannot search server-side and stays capped at 200.`);
    } else if (!/search: loadSearch \|\| undefined/.test(src[DRAWER])) {
      problems.push(`${DRAWER}: loads query does not send \`search\` — the state exists but never reaches the server.`);
    } else if (!/queryKey: \[[^\]]*loadSearch\]/.test(src[DRAWER])) {
      problems.push(`${DRAWER}: loads queryKey omits loadSearch — react-query would serve the first page from cache and never refetch on a new term.`);
    }
  }
  if (!vendorViaEntityPicker) {
    if (!src[DRAWER].includes("vendorSearch")) {
      problems.push(`${DRAWER}: no vendorSearch state — the vendors picker cannot search server-side and stays capped at 200.`);
    } else if (!/search: vendorSearch \|\| undefined/.test(src[DRAWER])) {
      problems.push(`${DRAWER}: vendors query does not send \`search\` — the state exists but never reaches the server.`);
    } else if (!/queryKey: \[[^\]]*vendorSearch\]/.test(src[DRAWER])) {
      problems.push(`${DRAWER}: vendors queryKey omits vendorSearch — react-query would serve the first page from cache and never refetch on a new term.`);
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
    { ...live, [COMBOBOX]: live[COMBOBOX].replace("if (onSearch) return sourceOptions;", "if (onSearch) return sourceOptions.filter((o) => o.label.includes(query));") },
    "not returned as-is");
  expectCaught("server-path-re-capped",
    { ...live, [COMBOBOX]: live[COMBOBOX].replace("if (onSearch) return sourceOptions;", "if (onSearch) return sourceOptions.slice(0, MAX_VISIBLE_OPTIONS);") },
    "still slices to MAX_VISIBLE_OPTIONS");
  // When EntityPicker owns unit/load, plant defects on vendorSearch (still Combobox) + EntityPicker removal.
  if (/EntityPicker[\s\S]*?kind=["']unit["']/.test(live[DRAWER])) {
    expectCaught(
      "entity-picker-unit-dropped",
      { ...live, [DRAWER]: live[DRAWER].replace(/kind=["']unit["']/g, 'kind="driver"') },
      "no unitSearch state"
    );
  } else {
    expectCaught("search-term-never-sent",
      { ...live, [DRAWER]: live[DRAWER].replace("search: unitSearch || undefined", "limit: 200") },
      "units query does not send `search`");
  }
  if (/EntityPicker[\s\S]*?kind=["']load["']/.test(live[DRAWER])) {
    expectCaught(
      "entity-picker-load-dropped",
      { ...live, [DRAWER]: live[DRAWER].replace(/kind=["']load["']/g, 'kind="driver"') },
      "no loadSearch state"
    );
  } else {
    expectCaught("querykey-forgets-the-term",
      { ...live, [DRAWER]: live[DRAWER].replace('queryKey: ["accident", "loads", operatingCompanyId, loadSearch]', 'queryKey: ["accident", "loads", operatingCompanyId]') },
      "loads queryKey omits loadSearch");
  }
  if (/EntityPicker[\s\S]*?kind=["']vendor["']/.test(live[DRAWER])) {
    expectCaught(
      "entity-picker-vendor-dropped",
      { ...live, [DRAWER]: live[DRAWER].replace(/kind=["']vendor["']/g, 'kind="driver"') },
      "no vendorSearch state"
    );
  } else {
    expectCaught(
      "vendor-search-never-sent",
      { ...live, [DRAWER]: live[DRAWER].replace("search: vendorSearch || undefined", "limit: 200") },
      "vendors query does not send `search`"
    );
  }

  const liveProblems = assertCargoParityAndPickerSearch(live);
  if (liveProblems.length) failures.push(`live sources FAIL (false positive): ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — planted defects caught, live sources clean`);
  process.exit(0);
}

const problems = assertCargoParityAndPickerSearch();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — cargo claims use ParityTable with claimant + load drill-through; safety pickers search server-side`);
