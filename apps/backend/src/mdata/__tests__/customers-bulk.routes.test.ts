import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const routesPath = path.join(here, "../customers-bulk.routes.ts");
const indexPath = path.join(here, "../index.ts");

describe("customers-bulk.routes", () => {
  const source = fs.readFileSync(routesPath, "utf8");
  const indexSource = fs.readFileSync(indexPath, "utf8");

  it("registers canonical bulk-update path via registerBulkRoute", () => {
    expect(source).toContain('path: "/api/v1/mdata/customers/bulk-update"');
    expect(source).toContain("registerBulkRoute");
  });

  it("supports set_status, archive, and classify actions", () => {
    expect(source).toContain("set_status: customerStatusPayloadSchema");
    expect(source).toContain("archive: emptyPayloadSchema");
    expect(source).toContain("classify: customerClassifyPayloadSchema");
  });

  it("requires reason for status and archive mutations", () => {
    expect(source).toContain('requireReasonActions: ["set_status", "archive"]');
    expect(source).toContain('destructiveActions: ["archive"]');
  });

  it("uses archive (UPDATE) not DELETE and emits per-entity bulk audit", () => {
    expect(source).not.toMatch(/\bDELETE\b/i);
    expect(source).toContain("archived_at");
    expect(source).toContain("appendBulkCrudAudit");
    expect(indexSource).toContain("registerCustomerBulkRoutes");
  });
});
