import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  UNIT_PATCHABLE_FIELD_KEYS,
  UNIT_PATCH_FORBIDDEN_COLUMNS,
  UNIT_PATCH_OWNER_ONLY_COLUMNS,
  ownerOnlyPatchViolation,
  updateUnitBodySchema,
} from "./unit-update-schema.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const routes = fs.readFileSync(path.join(here, "units.routes.ts"), "utf8");

describe("unit update zod allowlist", () => {
  it("accepts valid identity field patch", () => {
    const parsed = updateUnitBodySchema.safeParse({ unit_number: "TRK-101" });
    expect(parsed.success).toBe(true);
  });

  it("rejects forbidden operating_company_id field via strict schema", () => {
    const parsed = updateUnitBodySchema.safeParse({ operating_company_id: "00000000-0000-0000-0000-000000000001" });
    expect(parsed.success).toBe(false);
  });

  it("returns owner-only violation for non-Owner role on sold_price", () => {
    expect(ownerOnlyPatchViolation("Manager", { sold_price: 1000 })).toBe("sold_price");
    expect(ownerOnlyPatchViolation("Owner", { sold_price: 1000 })).toBeNull();
  });

  it("PATCH route enforces owner-only RBAC and audit diff wiring", () => {
    expect(routes).toMatch(/ownerOnlyPatchViolation/);
    expect(routes).toMatch(/buildPatchChanges/);
    expect(routes).toMatch(/appendCrudAudit/);
  });

  it("allowlist has at least 50 patchable fields and excludes forbidden cols", () => {
    expect(UNIT_PATCHABLE_FIELD_KEYS.length).toBeGreaterThanOrEqual(50);
    for (const col of UNIT_PATCH_FORBIDDEN_COLUMNS) {
      expect(UNIT_PATCHABLE_FIELD_KEYS).not.toContain(col);
    }
    expect(UNIT_PATCH_OWNER_ONLY_COLUMNS.length).toBeGreaterThanOrEqual(4);
  });
});
