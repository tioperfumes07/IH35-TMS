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

  if (!loadsApi.includes('board_scope?: "live" | "history"')) {
    errors.push("LoadsListFilters must declare board_scope live|history");
  }
  if (!loadsApi.includes('query.set("board_scope", filters.board_scope)')) {
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
  if (!loadsRoutes.includes("TERMINAL_LOAD_STATUSES")) {
    errors.push("loads list must define TERMINAL_LOAD_STATUSES for board_scope filtering");
  }
  if (!loadsRoutes.includes("NOT (l.status = ANY")) {
    errors.push("board_scope=live must exclude terminal statuses when no explicit status filter");
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
      "apps/backend/src/mdata/loads.routes.ts",
      "apps/frontend/src/pages/dispatch/DispatchBoard.tsx",
    ]) {
      const abs = join(tmp, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, read(rel));
    }
    const poisonAbs = join(tmp, "apps/frontend/src/pages/Dispatch.tsx");
    mkdirSync(dirname(poisonAbs), { recursive: true });
    writeFileSync(poisonAbs, poisonDispatch);
    const planted = runChecks(tmp);
    if (!planted.some((e) => e.includes("force list view"))) {
      console.error(`${LABEL} SELFTEST FAIL — planted history/list regression not caught`);
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
