import { describe, expect, it } from "vitest";
import { buildExhibitsPrintBodyHtml } from "../exhibitsPrintHtml";

const BASE = {
  filing_uuid: "f1",
  period_start: "2026-08-01",
  period_end: "2026-08-31",
};

describe("buildExhibitsPrintBodyHtml — F425C-EXHIBIT-C-UNVERIFIED-OPENING-FEEDS-TOTAL", () => {
  it("prints a real closing balance as a dollar amount", () => {
    const html = buildExhibitsPrintBodyHtml(
      {
        ...BASE,
        exhibits: {
          c: {
            letter: "c",
            title: "Exhibit C — Bank reconciliation summary",
            accounts: [
              {
                account_label: "DIP Operating ••••3500",
                opening_balance_cents: 900000,
                inflows_cents: 500000,
                outflows_cents: 200000,
                closing_balance_cents: 1200000,
                opening_balance_source: "reconciliation_session",
              },
            ],
            total_closing_cents: 1200000,
            accounts_excluded_from_total: 0,
          },
        },
      } as never,
      "USMCA Freight Solutions Inc",
    );
    expect(html).toContain("$12,000.00");
    expect(html).not.toContain("excludes");
  });

  it("never renders a null (unavailable) closing balance as $0.00, and flags the total's exclusion", () => {
    const html = buildExhibitsPrintBodyHtml(
      {
        ...BASE,
        exhibits: {
          c: {
            letter: "c",
            title: "Exhibit C — Bank reconciliation summary",
            accounts: [
              {
                account_label: "DIP Operating ••••3500",
                opening_balance_cents: 900000,
                inflows_cents: 500000,
                outflows_cents: 200000,
                closing_balance_cents: 1200000,
                opening_balance_source: "reconciliation_session",
              },
              {
                account_label: "Relay Fuel Wallet",
                opening_balance_cents: null,
                inflows_cents: 10000,
                outflows_cents: 0,
                closing_balance_cents: null,
                opening_balance_source: "unavailable",
              },
            ],
            total_closing_cents: 1200000,
            accounts_excluded_from_total: 1,
          },
        },
      } as never,
      "USMCA Freight Solutions Inc",
    );
    // The verified account's real number still prints.
    expect(html).toContain("$12,000.00");
    // The unavailable account's row: opening AND closing render as em-dash (never a fabricated
    // number), while its real inflows/outflows figures still print normally.
    const relayRowMatch = html.match(/<tr><td>Relay Fuel Wallet<\/td>.*?<\/tr>/);
    expect(relayRowMatch).toBeTruthy();
    const relayRow = relayRowMatch?.[0] ?? "";
    expect(relayRow).toContain("<td>—</td><td>$100.00</td><td>$0.00</td><td>—</td>");
    expect(html).toContain("excludes 1 account");
  });
});
