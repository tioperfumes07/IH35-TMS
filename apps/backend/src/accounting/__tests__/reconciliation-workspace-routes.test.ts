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
