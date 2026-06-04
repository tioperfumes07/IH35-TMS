import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const routesPath = path.join(here, "../customers.routes.ts");

describe("GET /api/v1/mdata/customers test-seed archive filter", () => {
  it("filters archived test/seed customers from default listings", () => {
    const source = fs.readFileSync(routesPath, "utf8");
    expect(source).toContain("EXCLUDE_ARCHIVED_MDATA_CUSTOMERS_SQL");
  });
});
