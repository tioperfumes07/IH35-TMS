import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const routesPath = path.join(here, "../vendors-bulk.routes.ts");
const indexPath = path.join(here, "../index.ts");

describe("vendors-bulk.routes", () => {
  const source = fs.readFileSync(routesPath, "utf8");
  const indexSource = fs.readFileSync(indexPath, "utf8");

  it("registers canonical bulk-update path via registerBulkRoute", () => {
    expect(source).toContain('path: "/api/v1/mdata/vendors/bulk-update"');
    expect(source).toContain("registerBulkRoute");
  });

  it("supports set_status, archive, and set_1099_eligibility actions", () => {
    expect(source).toContain("set_status: vendorStatusPayloadSchema");
    expect(source).toContain("archive: emptyPayloadSchema");
    expect(source).toContain("set_1099_eligibility: vendor1099PayloadSchema");
  });

  it("requires reason for status and archive mutations", () => {
    expect(source).toContain('requireReasonActions: ["set_status", "archive"]');
    expect(source).toContain('destructiveActions: ["archive"]');
  });

  it("uses archive (UPDATE) not DELETE and scopes by operating_company_id", () => {
    expect(source).not.toMatch(/\bDELETE\b/i);
    expect(source).toContain("operating_company_id = $2::uuid");
    expect(source).toContain("appendBulkCrudAudit");
    expect(indexSource).toContain("registerVendorBulkRoutes");
  });
});
