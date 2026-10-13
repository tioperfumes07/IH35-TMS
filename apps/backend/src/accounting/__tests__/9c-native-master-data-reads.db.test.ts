/**
 * 9c: native master-data reads — no QBO mirror in money paths
 *
 * Verifies that the money-path endpoints/services read from canonical app
 * tables (mdata.vendors, mdata.customers, catalogs.accounts, catalogs.items)
 * not from QBO mirrors. Tests fail if the old mirror reads are restored.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "../../../../..");

const QBO_MIRROR_RE = /(FROM|JOIN)\s+mdata\.(qbo_vendors|qbo_customers|qbo_accounts|qbo_items)/i;

const TARGETS: Array<{ file: string; desc: string }> = [
  {
    file: "apps/backend/src/work-orders/work-orders.routes.ts",
    desc: "work-orders vendor validation",
  },
  {
    file: "apps/backend/src/mdata/accounts.routes.ts",
    desc: "mdata accounts route",
  },
  {
    file: "apps/backend/src/mdata/items.routes.ts",
    desc: "mdata items route",
  },
  {
    file: "apps/backend/src/accounting/qbo-master-read.routes.ts",
    desc: "accounting master-read routes",
  },
  {
    file: "apps/backend/src/lists/names-master.routes.ts",
    desc: "names-master search/counts",
  },
  {
    file: "apps/backend/src/cash-advances/cash-advances.routes.ts",
    desc: "cash-advances bill picker",
  },
  {
    file: "apps/backend/src/reports/form-425c/exhibits/exhibit-f-supporting-docs.ts",
    desc: "exhibit-f bills query",
  },
  {
    file: "apps/backend/src/accounting/pse-mirror.service.ts",
    desc: "pse-mirror sync source",
  },
];

describe("9c native master-data reads", () => {
  for (const { file, desc } of TARGETS) {
    it(`${desc} must not read QBO mirror tables`, () => {
      const src = readFileSync(resolve(ROOT, file), "utf8");
      const offending = src
        .split("\n")
        .filter((ln) => QBO_MIRROR_RE.test(ln))
        .map((ln) => ln.trim());
      expect(offending, `QBO mirror reads in ${file}:\n${offending.join("\n")}`).toHaveLength(0);
    });
  }

  it("work-orders vendor validation uses mdata.vendors (not qbo_vendors)", () => {
    const src = readFileSync(resolve(ROOT, "apps/backend/src/work-orders/work-orders.routes.ts"), "utf8");
    expect(src).toContain("FROM mdata.vendors WHERE id");
  });

  it("pse-mirror service reads catalogs.accounts (not qbo_accounts)", () => {
    const src = readFileSync(resolve(ROOT, "apps/backend/src/accounting/pse-mirror.service.ts"), "utf8");
    expect(src).toContain("FROM catalogs.accounts ca");
  });

  it("pse-mirror service reads catalogs.items (not qbo_items)", () => {
    const src = readFileSync(resolve(ROOT, "apps/backend/src/accounting/pse-mirror.service.ts"), "utf8");
    expect(src).toContain("FROM catalogs.items ci");
  });

  it("names-master counts no longer include unlinkedQboCustomers/Vendors from mirrors", () => {
    const src = readFileSync(resolve(ROOT, "apps/backend/src/lists/names-master.routes.ts"), "utf8");
    expect(src).not.toContain("searchUnlinkedQboCustomers");
    expect(src).not.toContain("searchUnlinkedQboVendors");
  });
});
