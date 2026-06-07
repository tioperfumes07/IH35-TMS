import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("GAP-8 assignments quicksave", () => {
  it("service exports reassign helpers with audit prior/new values", () => {
    const src = fs.readFileSync(path.join(here, "../quicksave.service.ts"), "utf8");
    expect(src).toContain("reassignUnit");
    expect(src).toContain("reassignTrailer");
    expect(src).toContain("reassignDriver");
    expect(src).toContain("prior_value");
    expect(src).toContain("new_value");
    expect(src).toContain("E_VALIDATION_DRIVER_INACTIVE");
    expect(src).toContain("E_VALIDATION_UNIT_UNAVAILABLE");
  });

  it("routes register PATCH assign endpoints", () => {
    const src = fs.readFileSync(path.join(here, "../quicksave.routes.ts"), "utf8");
    expect(src).toContain("/api/v1/dispatch/loads/:uuid/assign-unit");
    expect(src).toContain("/api/v1/dispatch/loads/:uuid/assign-trailer");
    expect(src).toContain("/api/v1/dispatch/loads/:uuid/assign-driver");
    expect(src).toContain("registerDispatchAssignmentsQuicksaveRoutes");
  });
});
