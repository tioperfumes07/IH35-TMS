import { describe, expect, it } from "vitest";
import type { PlaidBankAccount } from "../../../api/banking";
import { derivePlaidConnectionBadgeClasses, derivePlaidConnectionBadgeLabel } from "./plaid-item-display";

function account(overrides: Partial<PlaidBankAccount> = {}): PlaidBankAccount {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    operating_company_id: "00000000-0000-4000-8000-000000000002",
    institution_name: "Amex",
    account_name: "Card",
    account_type: "credit",
    account_mask: "1234",
    current_balance_cents: 0,
    available_balance_cents: 0,
    currency_code: "USD",
    sync_status: "active",
    is_active: true,
    last_synced_at: null,
    ...overrides,
  };
}

describe("plaid item display badge", () => {
  const now = Date.parse("2026-06-03T12:00:00.000Z");

  it("shows Never synced when active status has no timestamp", () => {
    expect(derivePlaidConnectionBadgeLabel([account()], now)).toBe("Never synced");
    expect(derivePlaidConnectionBadgeClasses("Never synced")).toContain("red");
  });

  it("shows Healthy when last sync is within 24h and status is active", () => {
    const label = derivePlaidConnectionBadgeLabel(
      [account({ last_synced_at: "2026-06-03T08:00:00.000Z" })],
      now
    );
    expect(label).toBe("Healthy");
    expect(derivePlaidConnectionBadgeClasses(label)).toContain("green");
  });

  it("shows Stale when last sync is between 24h and 72h", () => {
    expect(
      derivePlaidConnectionBadgeLabel([account({ last_synced_at: "2026-06-01T12:00:00.000Z" })], now)
    ).toBe("Stale");
  });

  it("shows Login Required when sync_status is needs_reauth", () => {
    expect(
      derivePlaidConnectionBadgeLabel(
        [account({ sync_status: "needs_reauth", last_synced_at: "2026-06-03T08:00:00.000Z" })],
        now
      )
    ).toBe("Login Required");
  });
});
