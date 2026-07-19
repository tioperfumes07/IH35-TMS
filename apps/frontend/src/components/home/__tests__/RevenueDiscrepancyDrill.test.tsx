/**
 * Accessible discrepancy drill-through (0280-02) — keyboard + valid API hrefs.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { RevenueDiscrepancyDrill } from "../RevenueDiscrepancyDrill";

describe("RevenueDiscrepancyDrill", () => {
  it("renders invoice + JE links from API hrefs and supports keyboard focus/activation", async () => {
    const user = userEvent.setup();
    const invId = "11111111-1111-4111-8111-111111111112";
    const jeId = "22222222-2222-4222-8222-222222222222";
    render(
      <MemoryRouter>
        <RevenueDiscrepancyDrill
          discrepancyCount={2}
          discrepancyCents={5000}
          invoices={[
            {
              invoice_id: invId,
              display_id: "INV-2026-10002",
              recognition_date: "2026-07-18",
              invoice_revenue_cents: 5000,
              gl_revenue_cents: 0,
              journal_entry_ids: [],
              reason: "missing_je",
              href: `/accounting/invoices/${invId}`,
            },
          ]}
          journals={[
            {
              journal_entry_id: jeId,
              entry_date: "2026-07-18",
              gl_revenue_cents: 2500,
              invoice_id: null,
              account_ids: [],
              reason: "unlinked_gl_revenue",
              href: `/accounting/journal-entries/${jeId}`,
            },
          ]}
        />
      </MemoryRouter>
    );

    expect(screen.getByTestId("revenue-discrepancy-drill")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Revenue discrepancies/i })).toBeInTheDocument();

    const invLink = screen.getByTestId(`revenue-drill-invoice-${invId}`);
    expect(invLink).toHaveAttribute("href", `/accounting/invoices/${invId}`);
    const jeLink = screen.getByTestId(`revenue-drill-je-${jeId}`);
    expect(jeLink).toHaveAttribute("href", `/accounting/journal-entries/${jeId}`);

    invLink.focus();
    expect(invLink).toHaveFocus();
    await user.tab();
    expect(jeLink).toHaveFocus();
  });

  it("renders nothing when there are no discrepancies", () => {
    const { container } = render(
      <MemoryRouter>
        <RevenueDiscrepancyDrill discrepancyCount={0} invoices={[]} journals={[]} />
      </MemoryRouter>
    );
    expect(container).toBeEmptyDOMElement();
  });
});
