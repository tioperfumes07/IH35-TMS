#!/usr/bin/env node
/**
 * GUARD: dispatch DispatchBoard.tsx's unitsWithoutLoadQuery ("Unassigned Units" / "Awaiting
 * assignment") must render a real error state on failure in BOTH views it feeds, never let a
 * failed fetch masquerade as "all units have loads" — matching the sibling inShopUnitsQuery
 * pattern already in the same file.
 *
 * ROOT CAUSE this freezes shut: unitsWithoutLoadQuery.isError was never referenced anywhere,
 * while the SAME file's inShopUnitsQuery correctly gates a ListErrorState in the List/Table
 * boardSections loop. The repo's own CLS-LIST-ERROR-STATE-UNGUARDED guard
 * (verify-list-error-state-coverage.mjs) is file-level substring matching for "isError" — because
 * inShopUnitsQuery.isError already appears in this file, that guard false-greens the whole file
 * even though this second, sibling query was never covered. A failed unitsWithoutLoadQuery
 * silently rendered a dispatcher's "Unassigned Units" board as zero rows, visually
 * indistinguishable from "every truck is booked."
 *
 * Static-only (text-pattern) check against the real files, three independent parts (window sizes
 * measured directly against the real files, all with headroom):
 *   1. DispatchBoard.tsx's List/Table boardSections loop: `section.key === "awaiting" &&
 *      unitsWithoutLoadQuery.isError` must gate a ListErrorState render with a real onRetry.
 *   2. DispatchBoard.tsx's Assignment view: the <UnitsWithoutLoadTable> call must pass
 *      errorState={dataTableErrorState(unitsWithoutLoadQuery.error, ...)}.
 *   3. UnitsWithoutLoadTable.tsx must forward that errorState prop into <DataTable
 *      errorState={errorState} ...> — DataTable already renders a real error state when given one.
 *
 * Run:  node scripts/verify-dispatch-board-unassigned-units-error-state.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BOARD_PATH = path.join(root, "apps/frontend/src/pages/dispatch/DispatchBoard.tsx");
const OVERVIEW_PATH = path.join(root, "apps/frontend/src/pages/dispatch/DispatchOverview.tsx");
const TABLE_PATH = path.join(
  root,
  "apps/frontend/src/pages/dispatch/components/UnitsWithoutLoadTable.tsx"
);
const LABEL = "verify-dispatch-board-unassigned-units-error-state";

const SECTION_RE =
  /section\.key === "awaiting" && unitsWithoutLoadQuery\.isError[\s\S]{0,400}<ListErrorState[\s\S]{0,700}onRetry=\{\(\) => void unitsWithoutLoadQuery\.refetch\(\)\}/;
const ASSIGNMENT_RE =
  /<UnitsWithoutLoadTable[\s\S]{0,300}errorState=\{dataTableErrorState\(unitsWithoutLoadQuery\.error/;
const FORWARD_RE = /<DataTable[\s\S]{0,200}errorState=\{errorState\}/;
const OVERVIEW_RE = /unitsWithoutLoadQ\.isLoading[\s\S]{0,180}unitsWithoutLoadQ\.isError[\s\S]{0,220}PanelError\("Couldn't load unassigned units\.",[\s\S]{0,120}unitsWithoutLoadQ\.refetch\(\)[\s\S]{0,180}unitsWithoutLoad\.length === 0/;

export function checkUnassignedUnitsErrorState(boardSrc, tableSrc, overviewSrc) {
  const problems = [];

  if (!SECTION_RE.test(boardSrc)) {
    problems.push(
      "the List/Table boardSections loop does not gate a ListErrorState for the 'awaiting' section on unitsWithoutLoadQuery.isError — a failed fetch renders 0 rows, identical to 'all units have loads'"
    );
  }

  if (!ASSIGNMENT_RE.test(boardSrc)) {
    problems.push(
      "the Assignment view's <UnitsWithoutLoadTable> call does not pass errorState={dataTableErrorState(unitsWithoutLoadQuery.error, ...)} — a failed fetch renders the same empty table as a genuinely clean board"
    );
  }

  if (!FORWARD_RE.test(tableSrc)) {
    problems.push(
      "UnitsWithoutLoadTable.tsx does not forward its errorState prop into <DataTable errorState={errorState} ...> — even if the caller passes one, it would never reach the rendered table"
    );
  }

  if (!OVERVIEW_RE.test(overviewSrc)) {
    problems.push("DispatchOverview.tsx must render a retryable unitsWithoutLoadQ error before its honest-empty branch");
  }

  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];

  const badBoard = `
    boardSections.map((section) => (
      <Fragment key={section.key}>
        {section.key === "in_shop" && inShopUnitsQuery.isError ? (
          <ListErrorState onRetry={() => void inShopUnitsQuery.refetch()} />
        ) : null}
      </Fragment>
    ));
    <UnitsWithoutLoadTable rows={unassignedUnits} loading={unitsWithoutLoadQuery.isLoading} onRowClick={onRowClick} />
  `;
  const badTable = `
    export function UnitsWithoutLoadTable({ rows, onRowClick, loading }) {
      return <DataTable rows={rows} loading={loading} emptyText="All units currently have active loads." />;
    }
  `;
  const badOverview = `unitsWithoutLoadQ.isLoading ? <PanelLoading /> : unitsWithoutLoad.length === 0 ? PanelEmpty("All units currently have active loads.") : <PanelRows />`;
  const badProblems = checkUnassignedUnitsErrorState(badBoard, badTable, badOverview);
  if (badProblems.length !== 4) {
    failures.push(
      `the full pre-fix defect expected 4 problems, got ${badProblems.length}: ${badProblems.join("; ")}`
    );
  }

  const goodBoard = fs.readFileSync(BOARD_PATH, "utf8");
  const goodTable = fs.readFileSync(TABLE_PATH, "utf8");
  const goodOverview = fs.readFileSync(OVERVIEW_PATH, "utf8");
  const goodProblems = checkUnassignedUnitsErrorState(goodBoard, goodTable, goodOverview);
  if (goodProblems.length !== 0) {
    failures.push(`the real fixed files were flagged: ${goodProblems.join("; ")}`);
  }

  // Partial regression: DataTable forwarding fixed, but the two DispatchBoard.tsx wiring sites
  // still missing — proves the three checks are independent.
  const partialProblems = checkUnassignedUnitsErrorState(badBoard, goodTable, goodOverview);
  if (partialProblems.length !== 2) {
    failures.push(
      `a partial fix (table forwarding present, board wiring still missing) expected 2 problems, got ${partialProblems.length}: ${partialProblems.join("; ")}`
    );
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — the real pre-fix defect caught (3/3), the real fixed files clear, a ` +
      `partial fix (table forwarding only) caught (2/2).`
  );
  process.exit(0);
}

const boardSrc = fs.readFileSync(BOARD_PATH, "utf8");
const tableSrc = fs.readFileSync(TABLE_PATH, "utf8");
const overviewSrc = fs.readFileSync(OVERVIEW_PATH, "utf8");
const problems = checkUnassignedUnitsErrorState(boardSrc, tableSrc, overviewSrc);
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} problem(s):`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(
  `${LABEL} OK — dispatch board and overview render retryable unassigned-unit errors before honest empty states.`
);
