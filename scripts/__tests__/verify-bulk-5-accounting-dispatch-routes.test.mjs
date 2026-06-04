import { describe, expect, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const script = fs.readFileSync(path.join(here, "../verify-bulk-5-accounting-dispatch-routes.mjs"), "utf8");

describe("verify-bulk-5-accounting-dispatch-routes", () => {
  it("checks loads, invoices, and bills bulk route contracts", () => {
    expect(script).toContain("registerLoadsBulkRoutes");
    expect(script).toContain("/api/v1/dispatch/loads/bulk-update");
    expect(script).toContain("/api/v1/accounting/invoices/bulk-update");
    expect(script).toContain("/api/v1/accounting/bills/bulk-update");
  });
});
