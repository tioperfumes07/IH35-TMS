#!/usr/bin/env node
// Dispatch HOS wiring guard (feed RESOLVED 2026-06-17 — in-app /safety/hos store, NOT Samsara).
// Locks the dispatch board's "Hrs available (cycle)" / "Hrs to reset" columns to the in-app HOS
// cycle clocks so they can't silently regress back to a "—" placeholder or drift onto Samsara.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const fail = (msg) => {
  console.error(`FAIL verify-dispatch-hos-columns-wired: ${msg}`);
  process.exit(1);
};

// 1. The HOS store computes the cycle clock + the 8-day roll-off "hours to reset".
const service = read("apps/backend/src/telematics/hos-clocks.service.ts");
if (!service.includes("cycle_remaining_min")) fail("HOS service must expose cycle_remaining_min (Hrs available)");
if (!service.includes("cycle_reset_in_min")) fail("HOS service must expose cycle_reset_in_min (Hrs to reset)");

// 2. Batched per-entity board endpoint, reusing the in-app HOS store (no Samsara import).
const route = read("apps/backend/src/telematics/hos.routes.ts");
if (!route.includes("/api/v1/dispatch/hos-clocks")) fail("batched /api/v1/dispatch/hos-clocks endpoint missing");
if (!route.includes("getCurrentClocks")) fail("batched endpoint must reuse getCurrentClocks (in-app HOS store)");
if (!route.includes("set_config('app.operating_company_id'")) fail("batched endpoint must be per-entity scoped");
// No actual Samsara dependency (an import or a samsara* identifier — a comment mentioning the
// word is fine). The board HOS columns read the in-app HOS store only.
if (/\bimport\b[^\n;]*samsara/i.test(route) || /samsara[A-Za-z]*\s*\(/i.test(route)) {
  fail("HOS route must NOT depend on Samsara (feed is the in-app HOS store)");
}

// 3. Frontend client + board binding.
const api = read("apps/frontend/src/api/dispatch.ts");
if (!api.includes("getDispatchHosClocks")) fail("frontend api getDispatchHosClocks missing");
const board = read("apps/frontend/src/pages/dispatch/DispatchBoard.tsx");
if (!board.includes("getDispatchHosClocks")) fail("DispatchBoard must fetch HOS clocks (getDispatchHosClocks)");
if (!board.includes("renderHosAvailable")) fail("DispatchBoard must render Hrs available from the cycle clock");
if (!board.includes("renderHosToReset")) fail("DispatchBoard must render Hrs to reset from the cycle clock");
if (board.includes("Driver HOS feed pending")) fail("the held HOS placeholder must be gone — feed is wired");

console.log("PASS verify-dispatch-hos-columns-wired");
