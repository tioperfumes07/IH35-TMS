import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const routesPath = path.join(here, "../qbo-master-read.routes.ts");

describe("accounting customers listing test-seed archive filter", () => {
  it("filters archived test/seed customers from the list route (canonical mdata.customers, LEAD 443.188)", () => {
    const source = fs.readFileSync(routesPath, "utf8");
    expect(source).toContain("EXCLUDE_ARCHIVED_MDATA_CUSTOMERS_ALIAS_SQL");
    expect(source).toMatch(/FROM mdata\.customers c[\s\S]*AND \$\{EXCLUDE_ARCHIVED_MDATA_CUSTOMERS_ALIAS_SQL\}/);
    expect(source).toContain("deactivated_at IS NULL");
  });
});
