#!/usr/bin/env node
// Dispatch Live GPS wiring guard — the Live GPS column must bind to a real last-known position
// (batched, per-entity, from integrations.samsara_vehicle_positions), NOT the hardcoded null stub.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const fail = (m) => {
  console.error(`FAIL verify-dispatch-live-gps-wired: ${m}`);
  process.exit(1);
};

// Backend batched per-entity positions endpoint reading the in-app Samsara store.
const route = read("apps/backend/src/telematics/hos.routes.ts");
if (!route.includes("/api/v1/dispatch/load-positions")) fail("batched /api/v1/dispatch/load-positions endpoint missing");
if (!route.includes("integrations.samsara_vehicle_positions")) fail("positions must come from integrations.samsara_vehicle_positions");
if (!route.includes("set_config('app.operating_company_id'")) fail("positions endpoint must be per-entity scoped");

// Frontend client + board binding (no more null stub).
const api = read("apps/frontend/src/api/dispatch.ts");
if (!api.includes("getDispatchLoadPositions")) fail("frontend api getDispatchLoadPositions missing");
const board = read("apps/frontend/src/pages/dispatch/DispatchBoard.tsx");
if (!board.includes("getDispatchLoadPositions")) fail("DispatchBoard must fetch load positions");
if (!board.includes("positionByLoad[load.id]")) fail("Live GPS cell must bind to positionByLoad, not null");
if (/LoadLivePositionCell position=\{null\}/.test(board)) fail("the hardcoded Live GPS null stub must be removed");

console.log("PASS verify-dispatch-live-gps-wired");
