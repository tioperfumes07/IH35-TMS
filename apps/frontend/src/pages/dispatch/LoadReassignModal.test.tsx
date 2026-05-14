import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { postLoadReassign } from "../../api/dispatch";
import "../../design/design-tokens.css";
import { LoadReassignModal } from "./LoadReassignModal";

vi.mock("../../api/dispatch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/dispatch")>();
  return {
    ...actual,
    postLoadReassign: vi.fn().mockResolvedValue({ ok: true, load_id: "x" }),
  };
});

vi.mock("../../components/Toast", () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

describe("LoadReassignModal (P5-T17)", () => {
  it("submits reassign with reason code", async () => {
    const user = userEvent.setup();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onClose = vi.fn();
    render(
      <QueryClientProvider client={qc}>
        <LoadReassignModal
          open
          onClose={onClose}
          loadId="00000000-0000-4000-8000-000000000001"
          operatingCompanyId="00000000-0000-4000-8000-000000000002"
          loadNumber="L-100"
          driversOverride={[
            {
              driver_id: "00000000-0000-4000-8000-000000000010",
              display_name: "Test Driver",
              display_id: "d1",
              hours_remaining_today: 8,
              hours_remaining_week: 60,
              distance_to_pickup_miles: 10,
              hos_safe: true,
              is_in_violation: false,
            },
          ]}
        />
      </QueryClientProvider>
    );

    const combos = screen.getAllByRole("combobox");
    const driverSelect = combos[0];
    await user.selectOptions(driverSelect, "00000000-0000-4000-8000-000000000010");

    await user.click(screen.getByRole("button", { name: /^Reassign$/i }));

    await vi.waitFor(() => {
      expect(postLoadReassign).toHaveBeenCalled();
    });
    const body = (postLoadReassign as ReturnType<typeof vi.fn>).mock.calls[0][1] as { reason_code: string };
    expect(body.reason_code).toBeTruthy();
  });
});
