import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("dispatch arch tabs routes (B21-D2)", () => {
  const routesPath = resolve(import.meta.dirname, "../arch-tabs.routes.ts");
  const servicePath = resolve(import.meta.dirname, "../arch-tabs.service.ts");
  const indexPath = resolve(import.meta.dirname, "../../index.ts");

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

  // Regression: at-risk-loads returned 500 (Postgres 42703 "column sd.city does not exist")
  // because the `sd` delivery-stop lateral subquery selected only scheduled_arrival_at while
  // the outer query read sd.city / sd.state. Guard the whole class: every column read from the
  // `sd` lateral alias must be projected by that lateral's SELECT list.
  it("at-risk-loads: sd delivery-stop lateral projects every column the outer query reads", () => {
    const src = readFileSync(servicePath, "utf8");

    // Parse every column read from the `sd` lateral alias in the outer query — generic,
    // not hardcoded to city/state, so a future `sd.zip` (etc.) is covered too.
    const sdRefs = [...new Set([...src.matchAll(/\bsd\.([a-z_]+)/g)].map((m) => m[1]))];
    expect(
      sdRefs.length,
      "expected at least one sd.<col> reference in the outer query (guard must not pass vacuously)"
    ).toBeGreaterThan(0);

    // Anchor on the LATERAL so we capture ONLY the sd subquery's projection — NOT the outer
    // SELECT (which contains sd.city/sd.state and would mask a missing projection).
    const sdBlock = src.match(
      /LATERAL\s*\(\s*SELECT([\s\S]*?)FROM mdata\.load_stops\s+WHERE load_id = l\.id AND stop_type = 'delivery'/
    );
    expect(sdBlock, "sd delivery-stop lateral subquery not found").not.toBeNull();
    const projection = sdBlock![1];

    for (const col of sdRefs) {
      expect(
        projection.includes(col),
        `sd lateral must project "${col}" (outer query reads sd.${col})`
      ).toBe(true);
    }
  });
});
