#!/usr/bin/env node
// Smoke guard — Dispatch Board Phase 1 live/history scope wiring (no verify-step claim required).
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-dispatch-board-live-history";

const fail = (msg) => {
  console.error(`FAIL ${LABEL}: ${msg}`);
  process.exit(1);
};

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function runChecks(rootDir) {
  const errors = [];
  const loadsApi = readFileSync(join(rootDir, "apps/frontend/src/api/loads.ts"), "utf8");
  const dispatchPage = readFileSync(join(rootDir, "apps/frontend/src/pages/Dispatch.tsx"), "utf8");
  const loadsRoutes = readFileSync(join(rootDir, "apps/backend/src/mdata/loads.routes.ts"), "utf8");
  const dispatchBoard = readFileSync(join(rootDir, "apps/frontend/src/pages/dispatch/DispatchBoard.tsx"), "utf8");
  // 52699c6c2f (443.182-A catalog one-source, #26871) moved listLoads' query building into api/catalog-loads.ts
  // (loads.ts re-exports it); 50bb604dc9 (TRUCKLINE-16, #23316) made board_scope=live an ALLOW-list
  // (canonicalDispatchWorkStatusClause over DISPATCH_WORK_LOAD_STATUSES). Same rules, read where they live now.
  const catalogLoads = readFileSync(join(rootDir, "apps/frontend/src/api/catalog-loads.ts"), "utf8");
  const activeSet = readFileSync(join(rootDir, "apps/backend/src/dispatch/canonical-active-load-set.ts"), "utf8");
  const listOf = (src, name) => {
    const m = src.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\]`));
    return m ? [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]) : null;
  };

  if (!loadsApi.includes('board_scope?: "live" | "history"')) {
    errors.push("LoadsListFilters must declare board_scope live|history");
  }
  if (!loadsApi.includes('query.set("board_scope", filters.board_scope)') && !catalogLoads.includes('query.set("board_scope", filters.board_scope)')) {
    errors.push("listLoads must pass board_scope query param");
  }

  if (!dispatchPage.includes('data-testid="dispatch-board-scope-live"')) {
    errors.push("Dispatch page must expose Live board_scope toggle");
  }
  if (!dispatchPage.includes('data-testid="dispatch-board-scope-history"')) {
    errors.push("Dispatch page must expose History board_scope toggle");
  }
  if (!dispatchPage.includes("Loads history")) {
    errors.push("Dispatch page History toggle must read Loads history");
  }
  if (!dispatchPage.includes("boardScope={boardScope}")) {
    errors.push("Dispatch page must pass boardScope into DispatchBoard");
  }
  if (!dispatchPage.includes("board_scope: boardScope")) {
    errors.push("Dispatch page must pass board_scope into useLoadsList");
  }
  if (!/next\.set\("board_scope", "history"\)[\s\S]{0,120}next\.set\("view", "list"\)/.test(dispatchPage)) {
    errors.push("History toggle must force list view for terminal-only board");
  }
  if (!dispatchPage.includes("disabled={boardScope === \"history\"}")) {
    errors.push("Live-only dispatch views must disable when boardScope=history");
  }

  if (!loadsRoutes.includes('board_scope: z.enum(["live", "history"])')) {
    errors.push("listLoadsQuerySchema must accept board_scope live|history");
  }
  if (!loadsRoutes.includes("pickup_scheduled_at")) {
    errors.push("loads list SELECT must project pickup_scheduled_at");
  }
  if (!loadsRoutes.includes("CLOSED_LOAD_STATUSES")) {
    // LOADBOARD-LIFECYCLE (owner 2026-09-09): the board_scope split now keys off the CLOSED cohort
    // (closed/cancelled/abandoned/walkoff/no-show) — a load stays LIVE until it is closed.
    errors.push("loads list must define CLOSED_LOAD_STATUSES for board_scope filtering");
  }
  // Either the old exclusion, or the TRUCKLINE-16 allow-list on the live branch that shares NO status with the closed cohort.
  const closed = listOf(loadsRoutes, "CLOSED_LOAD_STATUSES");
  const work = listOf(activeSet, "DISPATCH_WORK_LOAD_STATUSES");
  const liveBranchUsesWorkSet = /board_scope === "live"\)\s*\{[\s\S]{0,1200}canonicalDispatchWorkStatusClause\("l"\)/.test(loadsRoutes)
    && /canonicalDispatchWorkStatusClause[\s\S]{0,120}DISPATCH_WORK_LOAD_STATUSES/.test(activeSet);
  const allowListExcludesClosed = Boolean(closed?.length && work?.length) && closed.every((st) => !work.includes(st));
  if (!loadsRoutes.includes("NOT (l.status = ANY") && !(liveBranchUsesWorkSet && allowListExcludesClosed)) {
    errors.push("board_scope=live must exclude the closed cohort when no explicit status filter");
  }

  if (!dispatchBoard.includes('boardScope?: "live" | "history"')) {
    errors.push("DispatchBoard must accept boardScope live|history prop");
  }
  if (!dispatchBoard.includes('boardScope = "live"')) {
    errors.push("DispatchBoard must default boardScope to live");
  }
  if (!dispatchBoard.includes("HISTORY_SECTION_META")) {
    errors.push("DispatchBoard must define HISTORY_SECTION_META for loads-history-only rows");
  }
  if (!dispatchBoard.includes("enabled: Boolean(companyId) && !isHistoryBoard")) {
    errors.push("DispatchBoard must skip live truck roster queries when boardScope=history");
  }

  return errors;
}

function selftest() {
  const liveErrors = runChecks(root);
  if (liveErrors.length) {
    console.error(`${LABEL} SELFTEST FAIL — live tree already broken:\n- ${liveErrors.join("\n- ")}`);
    process.exit(1);
  }

  const tmp = mkdtempSync(join(tmpdir(), "dispatch-live-history-selftest-"));
  try {
    const poisonDispatch = read("apps/frontend/src/pages/Dispatch.tsx").replace(
      `next.set("board_scope", "history");
                next.set("view", "list");
                next.delete("statuses");`,
      `next.set("board_scope", "history");
                next.delete("statuses");`,
    );
    for (const rel of [
      "apps/frontend/src/api/loads.ts",
      "apps/frontend/src/api/catalog-loads.ts",
      "apps/backend/src/mdata/loads.routes.ts",
      "apps/backend/src/dispatch/canonical-active-load-set.ts",
      "apps/frontend/src/pages/dispatch/DispatchBoard.tsx",
    ]) {
      const tmpAbs = join(tmp, rel);
      mkdirSync(dirname(tmpAbs), { recursive: true });
      writeFileSync(tmpAbs, read(rel));
    }
    const tmpPoisonAbs = join(tmp, "apps/frontend/src/pages/Dispatch.tsx");
    mkdirSync(dirname(tmpPoisonAbs), { recursive: true });
    writeFileSync(tmpPoisonAbs, poisonDispatch);
    const planted = runChecks(tmp);
    if (!planted.some((e) => e.includes("force list view"))) {
      console.error(`${LABEL} SELFTEST FAIL — planted history/list regression not caught`);
      process.exit(1);
    }
    // 443.187 plants: a closed status leaking into the live allow-list, and listLoads dropping board_scope.
    const tmpActive = join(tmp, "apps/backend/src/dispatch/canonical-active-load-set.ts");
    const goodActive = read("apps/backend/src/dispatch/canonical-active-load-set.ts");
    writeFileSync(tmpActive, goodActive.replace('export const DISPATCH_WORK_LOAD_STATUSES = [\n  "booked",', 'export const DISPATCH_WORK_LOAD_STATUSES = [\n  "cancelled",\n  "booked",'));
    writeFileSync(tmpPoisonAbs, read("apps/frontend/src/pages/Dispatch.tsx"));
    if (!runChecks(tmp).some((e) => e.includes("closed cohort"))) {
      console.error(`${LABEL} SELFTEST FAIL — a closed status in the live allow-list was not caught`);
      process.exit(1);
    }
    writeFileSync(tmpActive, goodActive);
    const tmpCatalog = join(tmp, "apps/frontend/src/api/catalog-loads.ts");
    writeFileSync(tmpCatalog, read("apps/frontend/src/api/catalog-loads.ts").replace('query.set("board_scope", filters.board_scope)', "void 0"));
    if (!runChecks(tmp).some((e) => e.includes("board_scope query param"))) {
      console.error(`${LABEL} SELFTEST FAIL — listLoads dropping board_scope was not caught`);
      process.exit(1);
    }
    console.log(`${LABEL} SELFTEST PASS`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const errors = runChecks(root);
if (errors.length) {
  fail(errors.join("; "));
}
console.log(`PASS ${LABEL}`);
