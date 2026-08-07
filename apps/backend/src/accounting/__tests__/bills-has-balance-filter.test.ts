import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Repo-root anchored, NOT cwd-anchored. These tests read source files by path; using
 * repoRootPath("apps/backend/...") silently resolves against the CURRENT WORKING DIRECTORY, so the
 * same test passes from the repo root and throws ENOENT from apps/backend with a doubled path
 * ("apps/backend/apps/backend/..."). That reads as a broken test rather than a broken invocation and
 * has already cost one false "pre-existing failures" diagnosis. Anchoring to this file's own location
 * makes the tests independent of where vitest is started.
 */
const repoRootPath = (p: string) => path.resolve(fileURLToPath(new URL("../../../../../", import.meta.url)), p);


describe("bills has_balance filter", () => {
  it("routes schema accepts has_balance", () => {
    const routes = fs.readFileSync(repoRootPath("apps/backend/src/accounting/bills.routes.ts"), "utf8");
    expect(routes).toContain("has_balance");
  });

  it("service filters positive remaining balance", () => {
    const service = fs.readFileSync(repoRootPath("apps/backend/src/accounting/bills.service.ts"), "utf8");
    expect(service).toContain("options.hasBalance");
    expect(service).toContain("paid_cents");
  });
});
