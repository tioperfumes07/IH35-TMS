#!/usr/bin/env node
// Smoke guard — Dispatch Board Phase 1 live/history scope wiring (no verify-step claim required).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const fail = (msg) => {
  console.error(`FAIL verify-dispatch-board-live-history: ${msg}`);
  process.exit(1);
};

const loadsApi = readFileSync(join(root, "apps/frontend/src/api/loads.ts"), "utf8");
const dispatchPage = readFileSync(join(root, "apps/frontend/src/pages/Dispatch.tsx"), "utf8");
const loadsRoutes = readFileSync(join(root, "apps/backend/src/mdata/loads.routes.ts"), "utf8");

if (!loadsApi.includes('board_scope?: "live" | "history"')) {
  fail("LoadsListFilters must declare board_scope live|history");
}
if (!loadsApi.includes('query.set("board_scope", filters.board_scope)')) {
  fail("listLoads must pass board_scope query param");
}

if (!dispatchPage.includes('data-testid="dispatch-board-scope-live"')) {
  fail("Dispatch page must expose Live board_scope toggle");
}
if (!dispatchPage.includes('data-testid="dispatch-board-scope-history"')) {
  fail("Dispatch page must expose History board_scope toggle");
}
if (!dispatchPage.includes("Loads history")) {
  fail("Dispatch page History toggle must read Loads history");
}
if (!dispatchPage.includes("boardScope={boardScope}")) {
  fail("Dispatch page must pass boardScope into DispatchBoard");
}
if (!dispatchPage.includes("board_scope: boardScope")) {
  fail("Dispatch page must pass board_scope into useLoadsList");
}

if (!loadsRoutes.includes('board_scope: z.enum(["live", "history"])')) {
  fail("listLoadsQuerySchema must accept board_scope live|history");
}
if (!loadsRoutes.includes("pickup_scheduled_at")) {
  fail("loads list SELECT must project pickup_scheduled_at");
}
if (!loadsRoutes.includes("TERMINAL_LOAD_STATUSES")) {
  fail("loads list must define TERMINAL_LOAD_STATUSES for board_scope filtering");
}
if (!loadsRoutes.includes("NOT (l.status = ANY")) {
  fail("board_scope=live must exclude terminal statuses when no explicit status filter");
}

const dispatchBoard = readFileSync(join(root, "apps/frontend/src/pages/dispatch/DispatchBoard.tsx"), "utf8");

if (!dispatchBoard.includes('boardScope?: "live" | "history"')) {
  fail("DispatchBoard must accept boardScope live|history prop");
}
if (!dispatchBoard.includes('boardScope = "live"')) {
  fail("DispatchBoard must default boardScope to live");
}
if (!dispatchBoard.includes("HISTORY_SECTION_META")) {
  fail("DispatchBoard must define HISTORY_SECTION_META for loads-history-only rows");
}
if (!dispatchBoard.includes("enabled: Boolean(companyId) && !isHistoryBoard")) {
  fail("DispatchBoard must skip live truck roster queries when boardScope=history");
}

console.log("PASS verify-dispatch-board-live-history");
