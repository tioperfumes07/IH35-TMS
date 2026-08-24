#!/usr/bin/env node
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
 * Usage:
 *   node scripts/verify-resizable-table-column-widths-no-fetch-loop.mjs            # scan
 *   node scripts/verify-resizable-table-column-widths-no-fetch-loop.mjs --selftest # regression harness -> must FAIL on bug
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const COLUMN_WIDTHS_FILE = "apps/frontend/src/hooks/useColumnWidths.ts";
const LIST_VIEW_FILE = "apps/frontend/src/components/lists/ListView/hooks/useListView.ts";

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

export function checkNoFetchLoop({ columnWidthsSrc, listViewSrc }) {
  const offenders = [];

  const cwDeps = findEffectDeps(columnWidthsSrc, FETCH_EFFECT_MARKER);
  if (cwDeps === null) {
    offenders.push(`${COLUMN_WIDTHS_FILE}: table-preferences fetch effect marker not found (has it moved?)`);
  } else if (/defaultWidths/.test(cwDeps)) {
    offenders.push(
      `${COLUMN_WIDTHS_FILE}: fetch effect depends on 'defaultWidths' (an object literal callers rebuild every render) — RESIZABLE-TABLE-COLUMN-WIDTHS-FETCH-LOOP regression. Use a ref for the latest value and depend only on tableId.`,
    );
  }

  const lvDeps = findEffectDeps(listViewSrc, FETCH_EFFECT_MARKER);
  if (lvDeps === null) {
    offenders.push(`${LIST_VIEW_FILE}: table-preferences fetch effect marker not found (has it moved?)`);
  } else if (/\bcolumns\b/.test(lvDeps)) {
    offenders.push(
      `${LIST_VIEW_FILE}: fetch effect depends on 'columns' (an array literal callers rebuild every render, and never read inside the effect body) — RESIZABLE-TABLE-COLUMN-WIDTHS-FETCH-LOOP regression. Depend only on tableId.`,
    );
  }

  return offenders;
}

export function run() {
  const columnWidthsSrc = fs.readFileSync(path.join(repoRoot, COLUMN_WIDTHS_FILE), "utf8");
  const listViewSrc = fs.readFileSync(path.join(repoRoot, LIST_VIEW_FILE), "utf8");
  const offenders = checkNoFetchLoop({ columnWidthsSrc, listViewSrc });
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
  const buggyListView = `
    useEffect(() => {
      void (async () => {
        const resp = await apiRequest(\`/api/v1/users/me/table-preferences?table_id=\${tableId}\`);
      })();
    }, [tableId, columns]);
  `;
  const fixedListView = `
    useEffect(() => {
      void (async () => {
        const resp = await apiRequest(\`/api/v1/users/me/table-preferences?table_id=\${tableId}\`);
      })();
    }, [tableId]);
  `;

  const buggyOffenders = checkNoFetchLoop({ columnWidthsSrc: buggyColumnWidths, listViewSrc: buggyListView });
  const fixedOffenders = checkNoFetchLoop({ columnWidthsSrc: fixedColumnWidths, listViewSrc: fixedListView });

  if (buggyOffenders.length === 2 && fixedOffenders.length === 0) {
    console.log("verify:resizable-table-column-widths-no-fetch-loop selftest OK");
    process.exit(0);
  }
  console.error("verify:resizable-table-column-widths-no-fetch-loop selftest FAILED", {
    buggyOffenders,
    fixedOffenders,
  });
  process.exit(1);
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
    "verify:resizable-table-column-widths-no-fetch-loop OK — both table-preferences fetch effects depend only on tableId, not a per-render object/array literal",
  );
}
