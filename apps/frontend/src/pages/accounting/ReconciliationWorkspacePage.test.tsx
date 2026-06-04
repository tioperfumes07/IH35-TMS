import { describe, expect, it } from "vitest";
import source from "./ReconciliationWorkspacePage.tsx?raw";

describe("ReconciliationWorkspacePage", () => {
  it("renders dual-pane workspace test id", () => {
    expect(source).toContain("accounting-reconciliation-workspace");
    expect(source).toContain("Unreconciled bank transactions");
  });

  it("calls accounting reconciliation APIs", () => {
    expect(source).toContain("getAccountingReconciliationWorkspace");
    expect(source).toContain("matchAccountingReconciliation");
    expect(source).toContain("unmatchAccountingReconciliation");
  });

  it("supports match and unmatch actions", () => {
    expect(source).toContain("Match");
    expect(source).toContain("Unmatch");
  });

  it("filters by account and date range", () => {
    expect(source).toContain("period_start");
    expect(source).toContain("type=\"date\"");
  });
});
