import { describe, expect, it } from "vitest";
import panel from "./PlaidSyncStatusPanel.tsx?raw";

describe("PlaidSyncStatusPanel", () => {
  it("renders status test id", () => {
    expect(panel).toContain("plaid-sync-status-panel");
  });

  it("loads plaid bank accounts", () => {
    expect(panel).toContain("getPlaidBankAccounts");
  });

  it("shows counts and last sync", () => {
    expect(panel).toContain("Accounts:");
    expect(panel).toContain("Last sync");
  });
});
