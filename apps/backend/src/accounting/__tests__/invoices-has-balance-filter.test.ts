import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("invoices has_balance filter", () => {
  const routes = fs.readFileSync(path.resolve("apps/backend/src/accounting/invoices.routes.ts"), "utf8");

  it("routes schema accepts has_balance + offset", () => {
    expect(routes).toContain("has_balance");
    expect(routes).toMatch(/offset:\s*z\.coerce\.number/);
  });

  it("filters open balance and aging-compatible statuses before LIMIT/OFFSET", () => {
    expect(routes).toContain("q.has_balance");
    expect(routes).toContain("COALESCE(i.amount_open_cents, 0) > 0");
    expect(routes).toContain("i.voided_at IS NULL");
    expect(routes).toMatch(/status NOT IN \('draft', 'void', 'voided', 'paid'\)/);
    // COUNT must use the same WHERE (truthful total/has_more) before LIMIT/OFFSET.
    expect(routes).toContain("SELECT COUNT(*)::int AS total");
    expect(routes).toContain("has_more");
    const hasBalanceIdx = routes.indexOf("if (q.has_balance)");
    const limitIdx = routes.indexOf("LIMIT $", hasBalanceIdx);
    expect(hasBalanceIdx).toBeGreaterThan(-1);
    expect(limitIdx).toBeGreaterThan(hasBalanceIdx);
  });

  it("COUNT and LIST SQL literals retain explicit mdata entity predicates (no baseline widen)", () => {
    const listStart = routes.indexOf('app.get("/api/v1/accounting/invoices"');
    const listEnd = routes.indexOf('app.get("/api/v1/accounting/invoices/:id"');
    const handler = routes.slice(listStart, listEnd);
    for (const needle of [
      "c.operating_company_id = i.operating_company_id",
      "c.operating_company_id = $1",
      "i.operating_company_id = $1",
      "l.operating_company_id = i.operating_company_id",
    ]) {
      expect(handler).toContain(needle);
    }
    // COUNT (customers) + LIST (customers + loads) — both must keep i.operating_company_id=$1 in-literal.
    expect(handler.match(/i\.operating_company_id = \$1/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});
