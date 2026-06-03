import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const routesPath = path.join(here, "../users.routes.ts");

describe("identity users listing test-seed archive filter", () => {
  it("filters archived seed users from default listings", () => {
    const source = fs.readFileSync(routesPath, "utf8");
    expect(source).toContain("EXCLUDE_ARCHIVED_IDENTITY_USERS_SQL");
  });
});
