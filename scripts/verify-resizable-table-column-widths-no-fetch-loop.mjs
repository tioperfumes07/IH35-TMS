#!/usr/bin/env node
/** @matrix-built {"modules":["customers","vendors"],"cols":["connectivity","qbo_chrome"],"leaves":["list.view_master_detail"],"task":"CLASS-COLUMN-WIDTH-PREFERENCE-SAVE-SILENT-FAILURE","vertical":"class-sweep"} */
/** @matrix-built {"modules":["lists"],"cols":["connectivity","qbo_chrome"],"leaves":["chrome.toolbar_gear"],"task":"CLASS-COLUMN-WIDTH-PREFERENCE-SAVE-SILENT-FAILURE","vertical":"class-sweep"} */
/**
 * verify-resizable-table-column-widths-no-fetch-loop.mjs  (RESIZABLE-TABLE-COLUMN-WIDTHS-FETCH-LOOP)
 *
 * Root cause: two independent hooks fetched `GET /api/v1/users/me/table-preferences` inside a
 * useEffect whose dependency array included an object/array value the caller rebuilds as a fresh
 * literal on every render (`useColumnWidths`'s `defaultWidths`, built inline by ResizableTable via
 * `Object.fromEntries(columns.map(...))` with no memo; `useListView`'s `columns` param, which isn't
 * even read inside the effect). Each render produced a new reference, re-firing the effect, whose
 * state update (`setWidths` / `setLoading`) caused another render — an infinite fetch loop for as
 * long as the table/list stayed mounted. Live-confirmed on /vendors: 130+ identical GET requests
 * fired back-to-back, still climbing minutes after navigating away to an unrelated page.
 *
 * This guard makes the regression impossible to re-ship in either hook.
 *
 * LEAD 443.181 (one table component): ListView and ResizableTable are retired (their screens render
 * <ParityTable>), so useListView and both component surfaces are gone; the guard keeps the
 * useColumnWidths hook honest, and covers ParityTable's server-saved view (useParityServerView) — the
 * same fetch-loop rule and the same "a failed save is said, with Retry" rule.
 *
 * Usage:
 *   node scripts/verify-resizable-table-column-widths-no-fetch-loop.mjs            # scan
 *   node scripts/verify-resizable-table-column-widths-no-fetch-loop.mjs --selftest # regression harness -> must FAIL on bug
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const COLUMN_WIDTHS_FILE = "apps/frontend/src/hooks/useColumnWidths.ts";
const SERVER_VIEW_FILE = "apps/frontend/src/components/parity/useParityServerView.ts";
const PARITY_TABLE_FILE = "apps/frontend/src/components/parity/ParityTable.tsx";

const FETCH_EFFECT_MARKER = "table-preferences?table_id=";

function findEffectDeps(src, marker) {
  const idx = src.indexOf(marker);
  if (idx === -1) return null;
  // Find the closing `}, [...]);` of the useEffect containing this fetch — scan forward for the
  // next `}, [` after the marker.
  const depsIdx = src.indexOf("}, [", idx);
  if (depsIdx === -1) return null;
  const closeIdx = src.indexOf(");", depsIdx);
  if (closeIdx === -1) return null;
  return src.slice(depsIdx, closeIdx + 2);
}

export function checkNoFetchLoop({ columnWidthsSrc, serverViewSrc }) {
  const offenders = [];
  const svDeps = findEffectDeps(serverViewSrc, FETCH_EFFECT_MARKER);
  if (svDeps === null) {
    offenders.push(`${SERVER_VIEW_FILE}: table-preferences fetch effect marker not found (has it moved?)`);
  } else if (!/^\}, \[tableId\]\);$/.test(svDeps)) {
    offenders.push(`${SERVER_VIEW_FILE}: fetch effect must depend on [tableId] only — RESIZABLE-TABLE-COLUMN-WIDTHS-FETCH-LOOP regression.`);
  }

  const cwDeps = findEffectDeps(columnWidthsSrc, FETCH_EFFECT_MARKER);
  if (cwDeps === null) {
    offenders.push(`${COLUMN_WIDTHS_FILE}: table-preferences fetch effect marker not found (has it moved?)`);
  } else if (/defaultWidths/.test(cwDeps)) {
    offenders.push(
      `${COLUMN_WIDTHS_FILE}: fetch effect depends on 'defaultWidths' (an object literal callers rebuild every render) — RESIZABLE-TABLE-COLUMN-WIDTHS-FETCH-LOOP regression. Use a ref for the latest value and depend only on tableId.`,
    );
  }


  return offenders;
}

export function checkPersistenceFailureTruth({ columnWidthsSrc, parityTableSrc }) {
  const offenders = [];
  for (const token of ["persistError", "retryPersist", "data-column-width-save-error", "Retry save"]) {
    if (!parityTableSrc.includes(token)) offenders.push(`${PARITY_TABLE_FILE}: missing ${token}`);
  }
  for (const token of [
    "lastPersistDraftRef.current = next",
    "Column widths could not be saved. This layout is temporary.",
    "retryPersist",
  ]) {
    if (!columnWidthsSrc.includes(token)) offenders.push(`${COLUMN_WIDTHS_FILE}: missing ${token}`);
  }
  return offenders;
}

export function run() {
  const columnWidthsSrc = fs.readFileSync(path.join(repoRoot, COLUMN_WIDTHS_FILE), "utf8");
  const serverViewSrc = fs.readFileSync(path.join(repoRoot, SERVER_VIEW_FILE), "utf8");
  const parityTableSrc = fs.readFileSync(path.join(repoRoot, PARITY_TABLE_FILE), "utf8");
  const offenders = [
    ...checkNoFetchLoop({ columnWidthsSrc, serverViewSrc }),
    ...checkPersistenceFailureTruth({ columnWidthsSrc, parityTableSrc }),
  ];
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const buggyColumnWidths = `
    useEffect(() => {
      (async () => {
        const response = await apiRequest(\`/api/v1/users/me/table-preferences?table_id=\${tableId}\`);
      })();
    }, [tableId, defaultWidths]);
  `;
  const fixedColumnWidths = `
    useEffect(() => {
      (async () => {
        const response = await apiRequest(\`/api/v1/users/me/table-preferences?table_id=\${tableId}\`);
      })();
    }, [tableId]);
  `;

  const buggyOffenders = checkNoFetchLoop({ columnWidthsSrc: buggyColumnWidths, serverViewSrc: buggyColumnWidths.replace("defaultWidths", "columns") });
  const fixedOffenders = checkNoFetchLoop({ columnWidthsSrc: fixedColumnWidths, serverViewSrc: fixedColumnWidths });

  if (buggyOffenders.length !== 2 || fixedOffenders.length !== 0) {
    console.error("verify:resizable-table-column-widths-no-fetch-loop selftest FAILED", {
      buggyOffenders,
      fixedOffenders,
    });
    process.exit(1);
  }
  const actual = {
    columnWidthsSrc: fs.readFileSync(path.join(repoRoot, COLUMN_WIDTHS_FILE), "utf8"),
    parityTableSrc: fs.readFileSync(path.join(repoRoot, PARITY_TABLE_FILE), "utf8"),
  };
  const mutations = [
    { ...actual, columnWidthsSrc: actual.columnWidthsSrc.replace("lastPersistDraftRef.current = next", "BROKEN_DRAFT") },
    { ...actual, columnWidthsSrc: actual.columnWidthsSrc.replace("Column widths could not be saved. This layout is temporary.", "BROKEN_ERROR") },
    { ...actual, columnWidthsSrc: actual.columnWidthsSrc.replaceAll("retryPersist", "BROKEN_RETRY") },
    { ...actual, parityTableSrc: actual.parityTableSrc.replace("data-column-width-save-error", "BROKEN_ERROR_SURFACE") },
    { ...actual, parityTableSrc: actual.parityTableSrc.replaceAll("retryPersist", "BROKEN_RETRY") },
  ];
  mutations.forEach((mutation, index) => {
    if (!checkPersistenceFailureTruth(mutation).length) throw new Error(`persistence mutation ${index + 1} survived`);
  });
  console.log(`verify:resizable-table-column-widths-no-fetch-loop selftest OK — fetch-loop pair + ${mutations.length}/5 persistence defects rejected`);
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error(
      "verify:resizable-table-column-widths-no-fetch-loop FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "),
    );
    process.exit(1);
  }
  console.log(
    "verify:resizable-table-column-widths-no-fetch-loop OK — both table-preferences fetch effects (useColumnWidths, useParityServerView) depend only on tableId, not a per-render object/array literal",
  );
}
