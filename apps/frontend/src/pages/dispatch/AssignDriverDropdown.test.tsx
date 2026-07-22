import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import "../../design/design-tokens.css";
import { AssignDriverDropdown } from "./AssignDriverDropdown";

vi.mock("../../components/drivers/CreateDriverModal", () => ({
  CreateDriverModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="create-driver-modal-stub">CreateDriverModal</div> : null,
}));

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("AssignDriverDropdown (P5-T19)", () => {
  it("shows HOS warning panel before confirming unsafe driver", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    wrap(
      <AssignDriverDropdown
        loadId="00000000-0000-4000-8000-000000000001"
        operatingCompanyId="00000000-0000-4000-8000-000000000002"
        value=""
        onChange={onChange}
        driversOverride={[
          {
            driver_id: "00000000-0000-4000-8000-000000000010",
            display_name: "Safe Driver",
            display_id: "d1",
            hours_remaining_today: 8,
            hours_remaining_week: 60,
            distance_to_pickup_miles: 10,
            hos_safe: true,
            is_in_violation: false,
          },
          {
            driver_id: "00000000-0000-4000-8000-000000000011",
            display_name: "Tired Driver",
            display_id: "d2",
            hours_remaining_today: 0,
            hours_remaining_week: 40,
            distance_to_pickup_miles: 20,
            hos_safe: false,
            is_in_violation: true,
          },
        ]}
      />
    );

    const input = screen.getByRole("combobox");
    await user.click(input);
    await user.click(await screen.findByRole("option", { name: /Tired Driver/i }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/out of hours today/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /assign anyway/i }));
    expect(onChange).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000011");
  });

  it("exposes + Create driver allowAddNew row", async () => {
    const user = userEvent.setup();
    wrap(
      <AssignDriverDropdown
        loadId="00000000-0000-4000-8000-000000000001"
        operatingCompanyId="00000000-0000-4000-8000-000000000002"
        value=""
        onChange={vi.fn()}
        driversOverride={[]}
      />
    );

    await user.click(screen.getByRole("combobox"));
    expect(await screen.findByRole("option", { name: /\+ Create driver/i })).toBeInTheDocument();
  });
});
