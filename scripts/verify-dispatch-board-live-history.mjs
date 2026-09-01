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

console.log("PASS verify-dispatch-board-live-history");
