import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("company context route registration", () => {
  it("registers company-context routes in backend index", async () => {
    const indexSource = await readFile(new URL("../index.ts", import.meta.url), "utf8");
    expect(indexSource).toContain('import { registerCompanyContextRoutes } from "./identity/company-context.routes.js";');
    expect(indexSource).toMatch(/await\s+registerCompanyContextRoutes\(app\);/);
  });
});
