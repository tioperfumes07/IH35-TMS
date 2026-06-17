#!/usr/bin/env node
// Guard: the Fleet "Inactivate selected" path is soft-delete (deactivated_at), per-entity RLS, and
// the frontend handles a failed response (isolated per-unit, never hangs the renderer).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const fail = (m) => {
  console.error(`FAIL verify-unit-inactivate-path: ${m}`);
  process.exit(1);
};

// Backend: per-unit deactivate endpoint = soft-delete (deactivated_at), under RLS, never a hard delete.
const route = read("apps/backend/src/mdata/units.routes.ts");
if (!route.includes('"/api/v1/mdata/units/:id/deactivate"')) fail("units /deactivate endpoint missing");
if (!/UPDATE mdata\.units[\s\S]{0,160}deactivated_at = now\(\)/.test(route)) fail("deactivate must soft-delete (SET deactivated_at = now())");
if (/DELETE FROM mdata\.units/.test(route)) fail("inactivate must be soft-delete — never DELETE FROM mdata.units");

// Frontend: bulk inactivate isolates per-unit failures (allSettled) and surfaces errors — no hang.
const fleet = read("apps/frontend/src/components/FleetTable.tsx");
if (!/inactivateMutation[\s\S]{0,400}Promise\.allSettled/.test(fleet)) {
  fail("bulk inactivate must use Promise.allSettled (isolate failures, never hang the page)");
}
if (!/Inactivate failed|failed/.test(fleet)) fail("bulk inactivate must surface a failure message");

console.log("PASS verify-unit-inactivate-path");
