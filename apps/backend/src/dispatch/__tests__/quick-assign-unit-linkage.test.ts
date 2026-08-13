import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dispatchDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(dispatchDir, "../../../..");
const service = fs.readFileSync(path.join(dispatchDir, "quick-assign.service.ts"), "utf8");
const routes = fs.readFileSync(path.join(dispatchDir, "quicksave.routes.ts"), "utf8");
const aggregate = fs.readFileSync(path.join(root, "apps/backend/src/mdata/unit-aggregate.service.ts"), "utf8");
const reverse = fs.readFileSync(path.join(root, "apps/frontend/src/components/vehicle-profile/CurrentLoadSection.tsx"), "utf8");

describe("quick-assign unit linkage", () => {
  it("rejects missing, inactive, or cross-company units before both writes", () => {
    expect(service.match(/E_UNIT_NOT_FOUND/g)).toHaveLength(2);
    expect(service.match(/deactivated_at IS NULL/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(service).toContain('code: "UNIT_OOS"');
    expect(routes).toContain('code === "E_UNIT_NOT_FOUND"');
  });

  it("writes the canonical FK and exposes the exact reverse load drill", () => {
    expect(service).toContain("assigned_unit_id = COALESCE($3, assigned_unit_id)");
    expect(service).toContain("previous_unit_id, new_unit_id");
    expect(aggregate).toContain("l.assigned_unit_id = $1::uuid");
    expect(aggregate).toContain("l.operating_company_id = $2::uuid");
    expect(reverse).toContain('kind="load"');
    expect(reverse).toContain("Available — no active load assigned to unit");
  });
});
