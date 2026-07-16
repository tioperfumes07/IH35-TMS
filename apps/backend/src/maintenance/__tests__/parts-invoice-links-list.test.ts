import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const routesPath = path.join(here, "../parts-invoice-links.routes.ts");

describe("parts-invoice-links assignment list (inventory honesty)", () => {
  const source = fs.readFileSync(routesPath, "utf8");

  it("exposes GET /api/v1/maintenance/parts-invoice-links for company-wide trail", () => {
    expect(source).toMatch(/app\.get\(\s*"\/api\/v1\/maintenance\/parts-invoice-links"/);
  });

  it("reads SoR maintenance.parts_invoice_links (not stock on-hand list)", () => {
    expect(source).toMatch(/FROM maintenance\.parts_invoice_links pil/);
    expect(source).toMatch(/INNER JOIN maintenance\.work_orders wo/);
    expect(source).toMatch(/LEFT JOIN mdata\.units u/);
    // Must not be a disguised parts_inventory stock dump
    expect(source).not.toMatch(/FROM maintenance\.parts_inventory WHERE operating_company_id/);
  });

  it("returns WO + unit + qty_used fields needed for assignment trail UI", () => {
    expect(source).toMatch(/work_order_display_id/);
    expect(source).toMatch(/unit_number/);
    expect(source).toMatch(/qty_used/);
    expect(source).toMatch(/parts_inventory_id/);
  });

  it("keeps existing create + delete routes (never-delete)", () => {
    expect(source).toMatch(/app\.post\(\s*"\/api\/v1\/maintenance\/work-orders\/:id\/parts-invoice-links"/);
    expect(source).toMatch(/app\.delete\(\s*"\/api\/v1\/maintenance\/parts-invoice-links\/:id"/);
  });
});
