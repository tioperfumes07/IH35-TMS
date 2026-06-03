import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("dispatch arch tabs routes (B21-D2)", () => {
  const routesPath = resolve(import.meta.dirname, "arch-tabs.routes.ts");
  const servicePath = resolve(import.meta.dirname, "arch-tabs.service.ts");
  const indexPath = resolve(import.meta.dirname, "../index.ts");

  it("registers at-risk, intransit list, assignment history, and resolve routes", () => {
    const src = readFileSync(routesPath, "utf8");
    expect(src).toContain("/api/v1/dispatch/at-risk-loads");
    expect(src).toContain("/api/v1/dispatch/intransit-issues");
    expect(src).toContain("/api/v1/dispatch/assignment-history");
    expect(src).toContain("/api/v1/dispatch/intransit-issues/:id/resolve");
    expect(src).toContain("/api/v1/dispatch/intransit-issues/office");
  });

  it("queries canonical dispatch tables in service layer", () => {
    const src = readFileSync(servicePath, "utf8");
    expect(src).toContain("views.dispatch_load_with_driver_status");
    expect(src).toContain("dispatch.intransit_issues");
    expect(src).toContain("dispatch.load_assignment_history");
    expect(src).toContain("late_risk");
  });

  it("is wired in backend index bootstrap", () => {
    const src = readFileSync(indexPath, "utf8");
    expect(src).toContain("registerDispatchArchTabsRoutes");
  });
});
