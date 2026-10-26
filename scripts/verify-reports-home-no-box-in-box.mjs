#!/usr/bin/env node
/**
 * verify-reports-home-no-box-in-box.mjs
 * ROUND 443.267 — Accounting + financial is board table (ReportsHomeBoard);
 * Management reports stay a single outer section frame with flat divide/border-t cells
 * — no nested `rounded-sm border` tiles (Cascade row 205).
 *
 * FINAL-3 row 40 (#27715, owner v3 rebuild — docs/design/v3/Reports.dc.html): the whole hub, including the
 * Management strip, moved into ReportsHomeBoard. The Management frame is now the shared V3Panel (or the legacy
 * single section frame); the flat border-t / sm:divide-x cell law and the no-nested-tile law are unchanged, and the
 * accounting panel title is the v3 spec's "Accounting & financial".
 *
 * --selftest exercises pass + nested-tile failure fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOME = "apps/frontend/src/pages/reports/ReportsHome.tsx";
const BOARD = "apps/frontend/src/pages/reports/components/ReportsHomeBoard.tsx";
const LABEL = "verify-reports-home-no-box-in-box";
const BORDER_FRAME = "(?:border-slate-200|border-\\[#E5E7EB\\])";
const FRAME_RE = new RegExp(`<section className="overflow-hidden rounded-sm border ${BORDER_FRAME} bg-white">`, "g");
const NESTED_TILE_RE = new RegExp(`className="[^"]*rounded-sm border ${BORDER_FRAME}[^"]*"`, "g");

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|--|\*)/.test(l))
    .join("\n");
}

/** Slice covering Management report section on the hub. */
export function managementCatalogSection(src) {
  const body = stripComments(src);
  const start = body.indexOf("Management reports");
  if (start < 0) return "";
  const sectionStart = Math.max(body.lastIndexOf("<section", start), body.lastIndexOf("<V3Panel", start));
  const frequently = body.indexOf("<FrequentlyRunTable", start);
  const panelClose = body.indexOf("</V3Panel>", start);
  const ends = [frequently, panelClose >= 0 ? panelClose + "</V3Panel>".length : -1].filter((i) => i >= 0);
  const end = ends.length ? Math.min(...ends) : body.length;
  return body.slice(sectionStart >= 0 ? sectionStart : start, end);
}

/** @param {string} section Management JSX slice */
export function collectManagementProblems(section) {
  const problems = [];
  if (!section.includes("Management reports")) {
    problems.push(`${HOME}: missing Management reports section`);
    return problems;
  }
  const frames = section.match(FRAME_RE);
  const v3Frame = /^<V3Panel\b/.test(section.trimStart());
  if (!v3Frame && (!frames || frames.length < 1)) {
    problems.push(
      `${HOME}: Management must use a single overflow-hidden section frame`,
    );
  }
  const nested = section.match(NESTED_TILE_RE) ?? [];
  const innerNested = nested.filter(
    (m) => !m.includes("overflow-hidden rounded-sm border") || !m.includes("bg-white"),
  );
  if (innerNested.length > 0) {
    problems.push(
      `${HOME}: nests ${innerNested.length} bordered tile(s) — use border-t / divide-x cells only`,
    );
  }
  if (/gap-2 p-3/.test(section)) {
    problems.push(`${HOME}: must not use gap-2 padded nested tile grids (box-in-box chrome)`);
  }
  if (!/border-t (?:border-slate-100|border-\[#E5E7EB\])/.test(section)) {
    problems.push(`${HOME}: report cells must flatten with border-t rows`);
  }
  if (!/sm:divide-x sm:divide-(?:slate-100|\[#E5E7EB\])/.test(section)) {
    problems.push(`${HOME}: report grids must flatten with sm:divide-x columns`);
  }
  return problems;
}

/** @param {string} boardSrc ReportsHomeBoard.tsx */
export function collectBoardProblems(boardSrc) {
  const problems = [];
  const body = stripComments(boardSrc);
  if (!body.includes('title="Accounting &amp; financial"') && !body.includes("Accounting + financial reports")) {
    problems.push(`${BOARD}: missing Accounting + financial reports panel`);
  }
  if (!body.includes("What it shows")) {
    problems.push(`${BOARD}: accounting table must include What it shows column`);
  }
  if (!body.includes("Open in viewer")) {
    problems.push(`${BOARD}: accounting table must include Open in viewer column`);
  }
  // ParityTable takes tableTestId=… (renders data-testid on the <table>); hand-rolled tables used data-testid=.
  if (
    !/data-testid="reports-accounting-financial-table"/.test(body) &&
    !/tableTestId="reports-accounting-financial-table"/.test(body)
  ) {
    problems.push(`${BOARD}: must render reports-accounting-financial-table`);
  }
  if (!/getKpiSummary\s*\(/.test(body)) {
    problems.push(`${BOARD}: must call getKpiSummary`);
  }
  if (!/V3KpiTile/.test(body)) {
    problems.push(`${BOARD}: must use V3KpiTile for KPI strip`);
  }
  // No nested rounded-sm border tiles inside the board accounting surface.
  const nested = body.match(NESTED_TILE_RE) ?? [];
  if (nested.length > 0) {
    problems.push(`${BOARD}: must not nest bordered rounded-sm tiles (use V3Panel + table)`);
  }
  return problems;
}

/** Back-compat export used by older imports / selftest helpers. */
export function reportCatalogSections(src) {
  return managementCatalogSection(src);
}

export function collectProblems(section) {
  return collectManagementProblems(section);
}

function selftest() {
  const goodMgmt = `
    <section className="overflow-hidden rounded-sm border border-slate-200 bg-white">
      <div>Management reports</div>
      <div className="grid sm:grid-cols-3 sm:divide-x sm:divide-slate-100">
        <button className="border-t border-slate-100 px-3 py-2">Sales</button>
      </div>
    </section>
    <FrequentlyRunTable />
  `;
  const badMgmt = `
    <section className="rounded-sm border border-slate-200 bg-white">
      <div>Management reports</div>
      <div className="grid gap-2 p-3 sm:grid-cols-3">
        <button className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2">Sales</button>
      </div>
    </section>
    <FrequentlyRunTable />
  `;
  const goodBoard = `
    export function ReportsHomeBoard() {
      getKpiSummary(companyId);
      return (
        <div>
          <V3KpiTile label="Available reports" />
          <div>Accounting + financial reports</div>
          <ParityTable tableTestId="reports-accounting-financial-table" columns={[{ label: "What it shows" }, { label: "Open in viewer" }]} />
        </div>
      );
    }
  `;
  const goodBoardLegacyTable = `
    export function ReportsHomeBoard() {
      getKpiSummary(companyId);
      return (
        <div>
          <V3KpiTile label="Available reports" />
          <div>Accounting + financial reports</div>
          <table data-testid="reports-accounting-financial-table">
            <th>What it shows</th>
            <th>Open in viewer</th>
          </table>
        </div>
      );
    }
  `;
  const badBoard = `
    export function ReportsHomeBoard() {
      return (
        <div>
          <div className="rounded-sm border border-slate-200 px-3">tile</div>
        </div>
      );
    }
  `;
  const badBoardNoTableId = goodBoard.replace('tableTestId="reports-accounting-financial-table"', 'tableTestId="other"');
  const goodV3Mgmt = `
    <V3Panel title="Management reports" subtitle="Branded financial compilations">
      <div className="grid sm:grid-cols-3 sm:divide-x sm:divide-[#E5E7EB]">
        <button className="border-t border-[#E5E7EB] px-3 py-2">Sales</button>
      </div>
    </V3Panel>
  `;
  const badV3Mgmt = goodV3Mgmt
    .replace('className="grid sm:grid-cols-3 sm:divide-x sm:divide-[#E5E7EB]"', 'className="grid gap-2 p-3 sm:grid-cols-3"')
    .replace('className="border-t border-[#E5E7EB] px-3 py-2"', 'className="rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] px-3 py-2"');
  const goodV3P = collectManagementProblems(managementCatalogSection(goodV3Mgmt));
  if (goodV3P.length) throw new Error(`selftest good V3Panel mgmt failed: ${goodV3P.join("; ")}`);
  if (collectManagementProblems(managementCatalogSection(badV3Mgmt)).length < 2) {
    throw new Error("selftest: nested tiles inside the V3Panel Management frame were not flagged");
  }
  const goodP = collectManagementProblems(managementCatalogSection(goodMgmt));
  if (goodP.length) throw new Error(`selftest good mgmt failed: ${goodP.join("; ")}`);
  const badP = collectManagementProblems(managementCatalogSection(badMgmt));
  if (badP.length < 2) throw new Error(`selftest bad mgmt not flagged enough: ${badP.join("; ")}`);
  const goodBP = collectBoardProblems(goodBoard);
  if (goodBP.length) throw new Error(`selftest good board failed: ${goodBP.join("; ")}`);
  const goodLegacyBP = collectBoardProblems(goodBoardLegacyTable);
  if (goodLegacyBP.length) throw new Error(`selftest good legacy board failed: ${goodLegacyBP.join("; ")}`);
  const badBP = collectBoardProblems(badBoard);
  if (badBP.length < 2) throw new Error(`selftest bad board not flagged enough: ${badBP.join("; ")}`);
  if (!collectBoardProblems(badBoardNoTableId).some((p) => /reports-accounting-financial-table/.test(p))) {
    throw new Error("selftest: missing accounting table testid was not flagged");
  }
  console.log(`${LABEL} --selftest OK`);
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN && process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

if (IS_MAIN) {
  const homeSrc = fs.readFileSync(path.join(ROOT, HOME), "utf8");
  const boardSrc = fs.readFileSync(path.join(ROOT, BOARD), "utf8");
  if (!homeSrc.includes("ReportsHomeBoard")) {
    console.error(`${LABEL} FAIL:`);
    console.error(`  - ${HOME}: must mount ReportsHomeBoard`);
    process.exit(1);
  }
  const problems = [
    // The Management strip lives on the board since #27715; the home shell no longer carries it.
    ...collectManagementProblems(managementCatalogSection(boardSrc)),
    ...collectBoardProblems(boardSrc),
  ];
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS — Reports home board table + flat Management strip`);
}
