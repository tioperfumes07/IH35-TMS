import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("bills has_balance filter", () => {
  it("routes schema accepts has_balance", () => {
    const routes = fs.readFileSync(path.resolve("apps/backend/src/accounting/bills.routes.ts"), "utf8");
    expect(routes).toContain("has_balance");
  });

  it("service filters positive remaining balance", () => {
    const service = fs.readFileSync(path.resolve("apps/backend/src/accounting/bills.service.ts"), "utf8");
    expect(service).toContain("options.hasBalance");
    expect(service).toContain("paid_cents");
  });
});
