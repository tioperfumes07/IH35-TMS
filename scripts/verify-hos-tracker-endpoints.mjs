#!/usr/bin/env node
// Guard — Compliance "HOS Tracker" data endpoints (Block 1). The per-driver daily timeline + clocks must come from
// the ingested hos.duty_status_events and stay HONEST: a driver-day with no events is "available:false" with null
// clocks + empty timeline (never a guessed default, never a violation on missing data). Locks the two endpoints
// (both 404'd before) + the honesty invariant so the HOS Tracker UI can't be built on fabricated clocks.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const fail = (m) => { console.error(`FAIL verify-hos-tracker-endpoints: ${m}`); process.exit(1); };

const routes = read("apps/backend/src/telematics/hos-tracker.routes.ts");
if (!/"\/api\/v1\/telematics\/hos\/daily"/.test(routes)) fail("must expose GET /api/v1/telematics/hos/daily");
if (!/"\/api\/v1\/telematics\/hos\/events"/.test(routes)) fail("must expose GET /api/v1/telematics/hos/events");
if (!/requireAuth/.test(routes) || !/withCurrentUser/.test(routes))
  fail("HOS tracker routes must be auth-gated + run under withCurrentUser (RLS company scope)");

const idx = read("apps/backend/src/index.ts");
if (!/registerHosTrackerRoutes\(app\)/.test(idx)) fail("registerHosTrackerRoutes must be wired in index.ts");

const svc = read("apps/backend/src/telematics/hos-tracker.service.ts");
if (!/FROM hos\.duty_status_events/.test(svc)) fail("daily timeline must read hos.duty_status_events (the ingested events)");
// HONEST: no events -> available:false, null clocks, empty timeline (never a default/violation on missing data).
if (!/eightDayEvents\.length === 0[\s\S]{0,200}available: false[\s\S]{0,120}clocks: null/.test(svc))
  fail("a driver-day with no events must return available:false + clocks:null + empty segments (honest unavailable)");
if (!/computeHosClocks\(eightDayEvents/.test(svc))
  fail("clocks must be computed from the real 8-day event stream (not a default)");
// COHERENCE: an internally-impossible clock set (gapped stream) -> available:false, never a violation on the timeline.
if (!/hosClocksCoherent\(clocks\)[\s\S]{0,200}available: false/.test(svc))
  fail("daily endpoint must return available:false on an incoherent clock set (no false violation on a gapped stream)");
// UNION (no double-count): day totals + 8-day breakdown must use the flattened non-overlapping timeline, never a
// raw sum of overlapping/duplicate/open-ended segments (GUARD: CAZARES 06-14 summed to 35h -> false cyc:0).
if (!/flattenDutySegments\(eightDayEvents/.test(svc))
  fail("getHosDaily must build segments + breakdown from flattenDutySegments (union), not a raw per-event sum");
// HARD SANITY: no day may exceed 1440 min; an impossible day -> cycle "unavailable", never a false violation.
if (!/on_duty_min > 1440[\s\S]{0,160}available: false/.test(svc))
  fail("a breakdown day > 1440 min must force available:false (cycle unavailable, not a false cyc:0 violation)");
// driven-in-cycle = 70h - cycle_remaining (Jorge's explicit ask), only when available.
if (!/CYCLE_70_MIN - clocks\.cycle_remaining_min/.test(svc))
  fail("driven_cycle_min must = 70h*60 - cycle_remaining_min (hours driven in the cycle)");
// RLS scope set per request.
if (!/set_config\('app\.operating_company_id'/.test(svc))
  fail("service must set app.operating_company_id (RLS scope) before reading events");

console.log("OK verify-hos-tracker-endpoints: /telematics/hos/daily + /events read real events; honest 'unavailable' when none.");
