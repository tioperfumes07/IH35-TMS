import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// G6-2 / G6-3 regression guard: master-data create paths must dedup case-insensitively AND
// entity-scoped by operating_company_id, returning a clear 409 (never a raw 23505 leak). These are
// static source assertions (same style as customers-bulk.routes.test.ts) so they run without a DB
// and cannot silently regress if someone reverts the SQL to exact/unscoped matching.
const here = path.dirname(fileURLToPath(import.meta.url));
const customerSource = fs.readFileSync(path.join(here, "../customers.routes.ts"), "utf8");
const vendorSource = fs.readFileSync(path.join(here, "../vendors.routes.ts"), "utf8");

describe("customer dedup (G6-3)", () => {
  it("name compare is case-insensitive via lower(btrim(...))", () => {
    expect(customerSource).toContain("lower(btrim(${check.column})) = lower(btrim($1))");
  });

  it("dedup is entity-scoped and ignores archived rows", () => {
    expect(customerSource).toContain("operating_company_id = $2 AND deactivated_at IS NULL");
  });

  it("passes a resolved operating company into the dedup check", () => {
    // The function signature must take operatingCompanyId (was missing → cross-entity false conflicts).
    expect(customerSource).toMatch(/assertUniqueCustomerFields\(\s*authUserId: string,\s*operatingCompanyId: string,/);
    // Create path resolves the opco before the check.
    expect(customerSource).toContain("assertUniqueCustomerFields(authUser.uuid, createOperatingCompanyId, {");
    // Patch path resolves the opco before the check.
    expect(customerSource).toContain("assertUniqueCustomerFields(authUser.uuid, patchScopedCompanyId, {");
  });

  it("returns a clear 409 conflict (not a raw 23505)", () => {
    expect(customerSource).toContain("mdata_customer_${conflict}_conflict");
    expect(customerSource).toMatch(/reply\.code\(409\)/);
  });
});

describe("vendor dedup (G6-2)", () => {
  it("has a dedup helper (previously absent)", () => {
    expect(vendorSource).toContain("async function vendorNameConflictExists(");
  });

  it("name compare is case-insensitive, entity-scoped, and ignores archived rows", () => {
    expect(vendorSource).toContain(
      "lower(btrim(vendor_name)) = lower(btrim($1)) AND operating_company_id = $2 AND deactivated_at IS NULL"
    );
  });

  it("create path resolves opco then checks for a name conflict, returning 409", () => {
    expect(vendorSource).toContain("if (await vendorNameConflictExists(authUser.uuid, createOperatingCompanyId, b.name))");
    expect(vendorSource).toContain('error: "mdata_vendor_name_conflict"');
    expect(vendorSource).toMatch(/reply\.code\(409\)/);
  });

  it("rename (patch) path is also guarded against collisions", () => {
    expect(vendorSource).toContain(
      "vendorNameConflictExists(authUser.uuid, patchScopedCompanyId, b.name, parsedParams.data.id)"
    );
  });
});
