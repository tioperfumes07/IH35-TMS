import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

// CI GUARD (2026-06-24) — fuel fraud-alerts 404. registerFuelFraudAlertRoutes was defined but NEVER called
// in apps/backend/src/index.ts, so GET /api/v1/fuel/fraud-alerts/summary 404'd and the "Open Fraud Alerts"
// KPI showed 0. This static guard fails if the mount is ever removed again. (Also locked the path to the
// /api/v1/fuel/ convention — the routes previously used a v1-less /api/fuel/ prefix.)
const here = path.dirname(fileURLToPath(import.meta.url));
const INDEX_TS = path.resolve(here, "../../../../index.ts"); // apps/backend/src/index.ts

describe("fuel fraud-alert routes are mounted in index.ts", () => {
  const src = readFileSync(INDEX_TS, "utf8");
  it("imports registerFuelFraudAlertRoutes", () => {
    expect(src).toMatch(/import\s*\{\s*registerFuelFraudAlertRoutes\s*\}\s*from\s*["']\.\/integrations\/fuel\/fraud-detector\/routes\.js["']/);
  });
  it("calls registerFuelFraudAlertRoutes(app)", () => {
    expect(src).toMatch(/registerFuelFraudAlertRoutes\s*\(\s*app\s*\)/);
  });
});

describe("fuel fraud-alert routes use the /api/v1/fuel/ prefix (consistency with the rest of fuel)", () => {
  const routesSrc = readFileSync(path.resolve(here, "../routes.ts"), "utf8");
  it("every fraud-alerts route is under /api/v1/fuel/", () => {
    // no v1-less /api/fuel/fraud-alerts paths remain
    expect(routesSrc).not.toMatch(/["']\/api\/fuel\/fraud-alerts/);
    expect(routesSrc).toMatch(/["']\/api\/v1\/fuel\/fraud-alerts/);
  });
});
