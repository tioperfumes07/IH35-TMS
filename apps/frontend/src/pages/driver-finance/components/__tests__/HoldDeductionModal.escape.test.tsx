import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../../../components/Toast";
import { HoldDeductionModal } from "../HoldDeductionModal";

vi.mock("../../../../api/driverFinance", () => ({
  holdDeduction: vi.fn(),
}));

const deduction = {
  id: "ded-1",
  description: "Test deduction",
  balance_left: 12.34,
  this_period_amount: 5,
};

describe("HoldDeductionModal", () => {
  it("Escape closes via Modal handler", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <ToastProvider>
        <HoldDeductionModal
          open
          deduction={deduction}
          operatingCompanyId="91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071"
          onClose={onClose}
          onHeld={vi.fn()}
        />
      </ToastProvider>
    );

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
