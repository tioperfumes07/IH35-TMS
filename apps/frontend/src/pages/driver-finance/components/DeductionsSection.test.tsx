import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DeductionsSection, type DeductionRow } from "./DeductionsSection";

const HELD_ROW: DeductionRow = {
  id: "d1",
  description: "Escrow",
  balance_left: 25,
  this_period_amount: 25,
  is_held: true,
  source_deduction_id: "real-1",
};

const UNHELD_ROW: DeductionRow = {
  id: "d2",
  description: "Admin fee",
  balance_left: 10,
  this_period_amount: 10,
  is_held: false,
  source_deduction_id: "real-2",
};

// R-102-B item 3 (owner, ROUND 112 — "NOTHING EDITABLE ON A VOIDED DOCUMENT"): Hold/Resume had NO
// isOpen check at all before this fix — both stayed clickable regardless of settlement lock/cancel
// state. This test would have failed red before the fix (buttons were never disabled).
describe("DeductionsSection — R-102-B item 3 read-only enforcement", () => {
  it("disables Hold and Resume (and Add) when isOpen is false, with a hover reason", () => {
    render(
      <DeductionsSection
        rows={[HELD_ROW, UNHELD_ROW]}
        onHold={vi.fn()}
        onResume={vi.fn()}
        onAdd={vi.fn()}
        isOpen={false}
        operatingCompanyId="company-1"
      />,
    );
    const add = screen.getByTestId("deductions-section-add");
    expect(add).toBeDisabled();
    expect(add).toHaveAttribute("title", "Settlement locked");

    const resume = screen.getByRole("button", { name: "Resume" });
    expect(resume).toBeDisabled();
    expect(resume).toHaveAttribute("title", "Settlement locked");

    const hold = screen.getByRole("button", { name: "Hold" });
    expect(hold).toBeDisabled();
    expect(hold).toHaveAttribute("title", "Settlement locked");
  });

  it("keeps Hold/Resume/Add enabled when isOpen is true", () => {
    render(
      <DeductionsSection
        rows={[HELD_ROW, UNHELD_ROW]}
        onHold={vi.fn()}
        onResume={vi.fn()}
        onAdd={vi.fn()}
        isOpen={true}
        operatingCompanyId="company-1"
      />,
    );
    expect(screen.getByTestId("deductions-section-add")).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Resume" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Hold" })).not.toBeDisabled();
  });
});
