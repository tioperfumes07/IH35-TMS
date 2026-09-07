#!/usr/bin/env node
/**
 * verify-factoring-collapsed-filter-chrome.mjs
 *
 * NEW-20 (owner 2026-09-07): "customer/load boxes too large and misaligned; filter/range box +
 * gear should sit in the same row as the customer/load boxes." Root cause, live-verified on
 * /factoring/recourse-pipeline and /factoring/chargebacks-fees (Chrome, this session):
 * FactoringHome.tsx rendered the Customer/Load EntityPicker filters as two full-width boxes in
 * their OWN outer bordered div, with Apply/Cancel/Reset in a THIRD div, all floating ABOVE the
 * table's own separately-bordered shell (which has its own search/Range/gear row) — three
 * disconnected boxes instead of one.
 *
 * FIX: both filter sections now render through CollapsedListFilters (the same slim
 * "Filters [n]" toggle chrome already standard across the Accounting module — Expenses,
 * Payments, Credit Memos, Bill Payments, Manual JE) passed into ParityTable's own `filterBar`
 * slot (via RecoursePipelineTable.tsx / ChargebacksTable.tsx's new `filterBar` passthrough prop)
 * — one bordered table shell, the toggle sitting in the same frame as search/range/gear instead
 * of a separate box.
 *
 * WHAT IS ASSERTED:
 *  - RecoursePipelineTable.tsx and ChargebacksTable.tsx both accept a `filterBar` prop and pass
 *    it through to their ParityTable call (`filterBar={filterBar}`).
 *  - FactoringHome.tsx's recourse_pipeline and chargebacks_fees sections both pass a
 *    <CollapsedListFilters> element as that filterBar, not the old grid-of-boxes markup.
 *
 * Usage:
 *   node scripts/verify-factoring-collapsed-filter-chrome.mjs            # scan
 *   node scripts/verify-factoring-collapsed-filter-chrome.mjs --selftest # planted-failure harness
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-factoring-collapsed-filter-chrome";
const HOME = "apps/frontend/src/pages/factoring/FactoringHome.tsx";
const RECOURSE_TABLE = "apps/frontend/src/pages/factoring/RecoursePipelineTable.tsx";
const CHARGEBACKS_TABLE = "apps/frontend/src/pages/factoring/ChargebacksTable.tsx";

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return { ok: false, src: "", err: `MISSING ${rel}` };
  return { ok: true, src: fs.readFileSync(p, "utf8"), err: null };
}

export function checkTablePassthrough(file, src) {
  const failures = [];
  if (!/filterBar\?:\s*ReactNode/.test(src)) {
    failures.push(`${file}: missing "filterBar?: ReactNode" prop declaration.`);
  }
  if (!/filterBar\s*[,}]/.test(src.split("export function")[1] ?? "")) {
    failures.push(`${file}: component does not destructure filterBar from its props.`);
  }
  if (!/filterBar=\{filterBar\}/.test(src)) {
    failures.push(`${file}: does not pass filterBar through to <ParityTable filterBar={filterBar} />.`);
  }
  return failures;
}

export function checkHomeUsesCollapsedFilters(src) {
  const failures = [];
  const recourseSection = src.split('data-testid="factoring-home-recourse-filters"')[1]?.slice(0, 3000) ?? "";
  if (!/<CollapsedListFilters/.test(recourseSection)) {
    failures.push(`${HOME}: recourse_pipeline filter section must use <CollapsedListFilters>, not a bespoke grid.`);
  }
  if (
    !/RecoursePipelineTable[\s\S]{0,300}filterBar=\{[\s\S]{0,1200}<CollapsedListFilters/.test(recourseSection)
  ) {
    failures.push(`${HOME}: recourse_pipeline's CollapsedListFilters must be passed as RecoursePipelineTable's filterBar prop.`);
  }

  const chargebacksSection = src.split('data-testid="factoring-home-chargebacks-filters"')[1]?.slice(0, 3000) ?? "";
  if (!chargebacksSection) {
    failures.push(`${HOME}: missing data-testid="factoring-home-chargebacks-filters" section.`);
  } else if (!/<CollapsedListFilters/.test(chargebacksSection)) {
    failures.push(`${HOME}: chargebacks_fees filter section must use <CollapsedListFilters>, not a bespoke grid.`);
  }

  if (!/import\s*\{\s*CollapsedListFilters\s*\}\s*from\s*["']\.\.\/\.\.\/components\/table\/CollapsedListFilters["']/.test(src)) {
    failures.push(`${HOME}: missing CollapsedListFilters import.`);
  }
  return failures;
}

export function run() {
  const failures = [];
  const home = read(HOME);
  if (!home.ok) failures.push(home.err);
  else failures.push(...checkHomeUsesCollapsedFilters(home.src));

  for (const file of [RECOURSE_TABLE, CHARGEBACKS_TABLE]) {
    const { ok, src, err } = read(file);
    if (!ok) {
      failures.push(err);
      continue;
    }
    failures.push(...checkTablePassthrough(file, src));
  }
  return { ok: failures.length === 0, failures };
}

if (process.argv.includes("--selftest")) {
  const goodTable = `
import type { ReactNode } from "react";
type Props = { rows: Row[]; filterBar?: ReactNode; };
export function RecoursePipelineTable({ rows, filterBar }: Props) {
  return <ParityTable rows={rows} filterBar={filterBar} />;
}
  `;
  const badTableNoProp = goodTable.replace("filterBar?: ReactNode; ", "");
  const badTableNoPassthrough = goodTable.replace("filterBar={filterBar}", "");

  const goodHome = `
import { CollapsedListFilters } from "../../components/table/CollapsedListFilters";
function Home() {
  return (
    <div data-testid="factoring-home-recourse-filters">
      <RecoursePipelineTable
        filterBar={
          <CollapsedListFilters>
            <label className="text-[11px] text-slate-600">
              Customer
            </label>
          </CollapsedListFilters>
        }
      />
    </div>
  );
  return (
    <div data-testid="factoring-home-chargebacks-filters">
      <ChargebacksTable filterBar={<CollapsedListFilters><label>Customer</label></CollapsedListFilters>} />
    </div>
  );
}
  `;
  const badHomeBespokeGrid = `
function Home() {
  return (
    <div data-testid="factoring-home-recourse-filters">
      <div className="relative grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-[11px] text-slate-600">Customer</label>
      </div>
      <RecoursePipelineTable />
    </div>
  );
}
  `;

  const checks = [
    ["clean RecoursePipelineTable passes", checkTablePassthrough(RECOURSE_TABLE, goodTable).length === 0],
    ["missing filterBar prop declaration fails", checkTablePassthrough(RECOURSE_TABLE, badTableNoProp).length > 0],
    ["missing filterBar passthrough fails", checkTablePassthrough(RECOURSE_TABLE, badTableNoPassthrough).length > 0],
    ["clean FactoringHome passes", checkHomeUsesCollapsedFilters(goodHome).length === 0],
    ["bespoke grid regression fails", checkHomeUsesCollapsedFilters(badHomeBespokeGrid).length > 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const [name] of failed) console.error(`  ✗ ${name}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const { ok, failures } = run();
if (!ok) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — Recourse Pipeline + Chargebacks & Fees filter chrome uses CollapsedListFilters (NEW-20)`);
process.exit(0);
