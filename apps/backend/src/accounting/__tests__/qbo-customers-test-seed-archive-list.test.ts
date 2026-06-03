import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const routesPath = path.join(here, "../qbo-master-read.routes.ts");

describe("accounting customers listing test-seed archive filter", () => {
  it("filters archived qbo customers from list and detail routes", () => {
    const source = fs.readFileSync(routesPath, "utf8");
    expect(source).toContain("EXCLUDE_ARCHIVED_QBO_CUSTOMERS_SQL");
    expect(source).toContain("archived_at IS NULL");
  });
});
