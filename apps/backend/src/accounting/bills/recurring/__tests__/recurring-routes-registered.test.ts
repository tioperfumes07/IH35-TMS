import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Guard for QA-sweep A1: the recurring-bill-templates feature had backend logic
// (table + generator + cron) but NO reachable HTTP surface — the route file was
// never autoloaded and the served paths did not match the FE client literals.
// These checks fail loudly if the wiring silently regresses again.

const dir = path.resolve("apps/backend/src/accounting/bills/recurring");
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
