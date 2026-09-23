import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CloseTripPanel } from "./CloseTripPanel";
import { ToastProvider } from "../../../components/Toast";

// R-102-B item 3 (owner, ROUND 112 — "NOTHING EDITABLE ON A VOIDED DOCUMENT"): neither button here
// checked the settlement's own cancel state at all before this fix; closeSettlementTrip is a real
// write and both stayed clickable on a cancelled settlement.
describe("CloseTripPanel — R-102-B item 3 read-only enforcement", () => {
  it("disables Close trip with a reason when the settlement is cancelled", () => {
    render(
      <ToastProvider>
        <CloseTripPanel
          settlementId="s1"
          companyId="company-1"
          userRole="Owner"
          settlementModel="load_bookended"
          tripClosedAt={null}
          settlementIsCancelled
        />
      </ToastProvider>,
    );
    const btn = screen.getByTestId("close-trip-button");
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("title", "Settlement is cancelled");
  });

  it("disables Re-check settlement with a reason when the settlement is cancelled", () => {
    render(
      <ToastProvider>
        <CloseTripPanel
          settlementId="s1"
          companyId="company-1"
          userRole="Owner"
          settlementModel="load_bookended"
          tripClosedAt="2026-09-01T00:00:00Z"
          settlementIsCancelled
        />
      </ToastProvider>,
    );
    const btn = screen.getByTestId("close-trip-recheck-button");
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("title", "Settlement is cancelled");
  });

  it("stays enabled when the settlement is live", () => {
    render(
      <ToastProvider>
        <CloseTripPanel
          settlementId="s1"
          companyId="company-1"
          userRole="Owner"
          settlementModel="load_bookended"
          tripClosedAt={null}
          settlementIsCancelled={false}
        />
      </ToastProvider>,
    );
    expect(screen.getByTestId("close-trip-button")).not.toBeDisabled();
  });
});
