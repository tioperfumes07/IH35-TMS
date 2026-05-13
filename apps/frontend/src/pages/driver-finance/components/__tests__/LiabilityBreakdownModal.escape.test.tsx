import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LiabilityBreakdownModal } from "../LiabilityBreakdownModal";

describe("LiabilityBreakdownModal", () => {
  it("Escape closes", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <LiabilityBreakdownModal
        open
        onClose={onClose}
        liabilities={[
          {
            id: "1",
            type: "fuel",
            source_description: "Card",
            original: 100,
            paid: 20,
            balance: 80,
            schedule: "weekly",
          },
        ]}
      />
    );

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
