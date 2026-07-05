import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

// CI GUARD (SETTLE-3) — the office Settlements "Dispute" tab (SettlementDisputesTab.tsx →
// api/driverFinance.ts) calls /api/v1/driver-finance/settlement-disputes*. registerSettlementDisputeRoutes
// was defined but NEVER called in apps/backend/src/index.ts, so every one of those endpoints 404'd.
// This static guard fails if the import or the mount is ever removed again — it catches the regression
// the route-level test cannot (that test registers its own app).
const here = path.dirname(fileURLToPath(import.meta.url));
const INDEX_TS = path.resolve(here, "../index.ts"); // apps/backend/src/index.ts

describe("office settlement-dispute routes are mounted in index.ts (SETTLE-3 guard)", () => {
  const src = readFileSync(INDEX_TS, "utf8");

  it("index.ts imports registerSettlementDisputeRoutes from driver-finance/settlement-dispute.routes", () => {
    expect(src).toMatch(
      /import\s*\{\s*registerSettlementDisputeRoutes\s*\}\s*from\s*["']\.\/driver-finance\/settlement-dispute\.routes\.js["']/
    );
  });

  it("index.ts actually CALLS registerSettlementDisputeRoutes(app) (the route is wired into the app)", () => {
    expect(src).toMatch(/registerSettlementDisputeRoutes\s*\(\s*app\s*\)/);
  });
});
