#!/usr/bin/env node
/**
 * verify-bill-allocation-assets-limit-in-bounds.mjs
 *
 * ACCT-F5407 — BillAllocationPanel.tsx's fetchAssets() requested `limit=250` from
 * GET /api/v1/assets, but assets.routes.ts's listQuerySchema caps limit at 200
 * (`z.coerce.number().int().min(1).max(200)`). Every real request 400'd on validation, the
 * catch() swallowed it silently, and the panel showed "Live service is unavailable; showing a
 * local preview until the API is connected" for every company, forever — even though USMCA alone
 * has 42 real rows in mdata.assets. Confirmed live: GET .../assets?limit=250 -> 400
 * "Too big: expected number to be <=200"; GET .../assets?limit=200 -> 200 with 42 real assets.
 *
 * Guards against the frontend's requested limit exceeding the backend's declared max again.
 */
import { readFileSync } from "node:fs";

const panelPath = "apps/frontend/src/components/allocation/BillAllocationPanel.tsx";
const routesPath = "apps/backend/src/assets/assets.routes.ts";

const panelSrc = readFileSync(panelPath, "utf8");
const routesSrc = readFileSync(routesPath, "utf8");

const failures = [];

const backendMaxMatch = routesSrc.match(/limit:\s*z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\((\d+)\)/);
if (!backendMaxMatch) {
  failures.push("could not find the backend's listQuerySchema limit .max(N) declaration in assets.routes.ts — re-check this guard");
}
const backendMax = backendMaxMatch ? Number(backendMaxMatch[1]) : null;

const frontendLimitMatches = [...panelSrc.matchAll(/limit:\s*"(\d+)"/g)];
if (frontendLimitMatches.length === 0) {
  failures.push("could not find a 'limit: \"N\"' request param in BillAllocationPanel.tsx — re-check this guard");
}
for (const m of frontendLimitMatches) {
  const requested = Number(m[1]);
  if (backendMax !== null && requested > backendMax) {
    failures.push(
      `BillAllocationPanel.tsx requests limit=${requested}, but GET /api/v1/assets caps limit at ${backendMax} ` +
      `(assets.routes.ts) — every request will 400, the panel will silently fall back to a fake local preview`
    );
  }
}

if (failures.length > 0) {
  console.error("verify-bill-allocation-assets-limit-in-bounds: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`verify-bill-allocation-assets-limit-in-bounds: OK — requested limit(s) [${frontendLimitMatches.map((m) => m[1]).join(", ")}] within backend max ${backendMax}`);
