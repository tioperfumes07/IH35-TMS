import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { detectPlannerConflict } from "../planner.service.js";

describe("dispatch planner routes (B21-D4)", () => {
  const routesPath = resolve(import.meta.dirname, "../planner.routes.ts");
  const servicePath = resolve(import.meta.dirname, "../planner.service.ts");
  const indexPath = resolve(import.meta.dirname, "../../index.ts");

  it("registers planner week and start_at patch routes", () => {
    const src = readFileSync(routesPath, "utf8");
    expect(src).toContain("/api/v1/dispatch/planner/week");
    expect(src).toContain("/api/v1/dispatch/planner/loads/:id/start_at");
    expect(src).toContain("reschedulePlannerLoad");
  });

  it("queries canonical load and HOS tables in service layer", () => {
    const src = readFileSync(servicePath, "utf8");
    expect(src).toContain("mdata.loads");
    expect(src).toContain("mdata.load_stops");
    expect(src).toContain("hos.duty_status_events");
    expect(src).toContain("getCurrentClocks");
  });

  it("blocks overlapping planner drops via conflict detection", () => {
    const conflict = detectPlannerConflict(
      [
        { id: "a", driver_id: "d1", start_at: "2026-06-03T12:00:00.000Z" },
        { id: "b", driver_id: "d1", start_at: "2026-06-03T14:00:00.000Z" },
      ],
      "c",
      "d1",
      "2026-06-03T13:00:00.000Z"
    );
    expect(conflict.conflict).toBe(true);
    expect(conflict.with_load_id).toBe("a");
  });
});
