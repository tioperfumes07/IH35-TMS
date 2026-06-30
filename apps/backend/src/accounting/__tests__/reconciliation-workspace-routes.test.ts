import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("accounting reconciliation workspace routes", () => {
  it("exposes workspace GET under accounting namespace", () => {
    const routes = fs.readFileSync(
      path.resolve("apps/backend/src/accounting/reconciliation.routes.ts"),
      "utf8"
    );
    expect(routes).toContain("/api/v1/accounting/reconciliation/workspace");
    expect(routes).toContain("getReconWorklist");
  });

  it("wires match POST", () => {
    const routes = fs.readFileSync(
      path.resolve("apps/backend/src/accounting/reconciliation.routes.ts"),
      "utf8"
    );
    expect(routes).toContain("/api/v1/accounting/reconciliation/match");
    expect(routes).toContain("acceptReconMatch");
  });

  it("wires unmatch PATCH", () => {
    const routes = fs.readFileSync(
      path.resolve("apps/backend/src/accounting/reconciliation.routes.ts"),
      "utf8"
    );
    expect(routes).toContain("/api/v1/accounting/reconciliation/unmatch");
    expect(routes).toContain("rejectReconMatch");
  });

  it("maps unreconciled bank txns in workspace payload", () => {
    const routes = fs.readFileSync(
      path.resolve("apps/backend/src/accounting/reconciliation.routes.ts"),
      "utf8"
    );
    expect(routes).toContain("unreconciled_bank_transactions");
    expect(routes).toContain("candidate_ledger_entries");
  });
});

// REGRESSION GUARD (P5-T2): these GET/POST/PATCH routes are NOT manually registered in
// apps/backend/src/index.ts. They go live ONLY because `registerAccountingRoutes` autoloads every
// `*.routes.{ts,js}` under apps/backend/src/accounting/ AND this file exports a `default fp(...)`
// plugin (the @fastify/autoload contract). Empirically (onRoute capture against the compiled
// dist/accounting autoload) the three routes register and the frontend (api/accounting.ts) calls
// the exact same paths/methods — so there is NO 404. The latent risk is silent: if the
// `export default fp(...)` is dropped (refactored to a named-only export like items.routes.ts), or
// the accounting autoload / `registerAccountingRoutes(app)` call is removed, autoload stops loading
// this file and ALL THREE routes 404 — while the string-grep tests above stay green. This block
// pins every link in that registration chain so the regression fails loudly here.
describe("accounting reconciliation workspace — autoload registration contract", () => {
  it("route file exports a default fastify-plugin so @fastify/autoload loads it", () => {
    const routes = fs.readFileSync(
      path.resolve("apps/backend/src/accounting/reconciliation.routes.ts"),
      "utf8"
    );
    // `default fp(...)` is what makes autoload pick the file up. A named-only export 404s silently.
    expect(routes).toMatch(/export\s+default\s+fp\(/);
    expect(routes).toContain("registerAccountingReconciliationRoutes");
  });

  it("accounting module autoloads *.routes.{ts,js} (the mechanism that registers this file)", () => {
    const accountingIndex = fs.readFileSync(
      path.resolve("apps/backend/src/accounting/index.ts"),
      "utf8"
    );
    expect(accountingIndex).toContain("@fastify/autoload");
    // matchFilter must keep matching `.routes.` files or the autoloader silently drops this route file.
    expect(accountingIndex).toMatch(/matchFilter:\s*\/\\\.routes\\\.\(ts\|js\)\$\//);
  });

  it("backend boot registers the accounting autoload group", () => {
    const indexSrc = fs.readFileSync(
      path.resolve("apps/backend/src/index.ts"),
      "utf8"
    );
    expect(indexSrc).toMatch(/await\s+registerAccountingRoutes\(app\);/);
  });
});
