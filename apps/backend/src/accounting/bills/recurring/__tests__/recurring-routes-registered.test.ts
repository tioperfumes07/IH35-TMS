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
const repoRootPath = (p: string) => path.resolve(fileURLToPath(new URL("../../../../../../../", import.meta.url)), p);


// Guard for QA-sweep A1: the recurring-bill-templates feature had backend logic
// (table + generator + cron) but NO reachable HTTP surface — the route file was
// never autoloaded and the served paths did not match the FE client literals.
// These checks fail loudly if the wiring silently regresses again.

const dir = repoRootPath("apps/backend/src/accounting/bills/recurring");
const routes = fs.readFileSync(path.join(dir, "routes.ts"), "utf8");

describe("recurring-bill-templates route registration (A1)", () => {
  it("ships an autoload wrapper that the accounting autoloader picks up", () => {
    const wrapperPath = path.join(dir, "recurring.routes.ts");
    expect(fs.existsSync(wrapperPath)).toBe(true);
    const wrapper = fs.readFileSync(wrapperPath, "utf8");
    // accounting/index.ts autoloads files matching /\.routes\.(ts|js)$/.
    expect(/\.routes\.(ts|js)$/.test(wrapperPath)).toBe(true);
    // Wrapper must register the handlers defined in ./routes.js.
    expect(wrapper).toContain('from "./routes.js"');
    expect(wrapper).toContain("app.register");
  });

  it("serves the exact v1 paths the FE client (api/accounting.ts) calls", () => {
    expect(routes).toContain('app.post("/api/v1/accounting/recurring-bill-templates"');
    expect(routes).toContain('app.get("/api/v1/accounting/recurring-bill-templates"');
    expect(routes).toContain('"/api/v1/accounting/recurring-bill-templates/:uuid/deactivate"');
    expect(routes).toContain('"/api/v1/accounting/recurring-bill-templates/:uuid/generate-now"');
  });

  it("uses POST for deactivate + generate-now (FE uses POST, not PATCH)", () => {
    expect(routes).toContain('app.post("/api/v1/accounting/recurring-bill-templates/:uuid/deactivate"');
    expect(routes).toContain('app.post("/api/v1/accounting/recurring-bill-templates/:uuid/generate-now"');
  });

  it("reads operating_company_id from the create body (FE sends it in the JSON body)", () => {
    expect(routes).toContain("body.data.operating_company_id");
  });

  it("never reverts to the old, unreachable noun/path", () => {
    expect(routes).not.toContain("/api/accounting/recurring-bills/templates");
  });
});
