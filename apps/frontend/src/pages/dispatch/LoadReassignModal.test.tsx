import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { postLoadReassign } from "../../api/dispatch";
import "../../design/design-tokens.css";
import { LoadReassignModal } from "./LoadReassignModal";
import { pickCombo } from "../../test-utils/pickCombo";

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
      // MemoryRouter: the reassign modal (or a child it gained) calls useNavigate, so the render threw
      // "useNavigate() may be used only in the context of a <Router> component" and the reason-code submit
      // assertion never ran. The app always renders this inside the router.
      <QueryClientProvider client={qc}>
        <MemoryRouter>
        <LoadReassignModal
          open
          onClose={onClose}
          loadId="00000000-0000-4000-8000-000000000001"
          operatingCompanyId="00000000-0000-4000-8000-000000000002"
          loadNumber="L-100"
          driversOverride={[
            {
              driver_id: "00000000-0000-4000-8000-000000000010",
              customer_id: "00000000-0000-4000-8000-000000000020",
              unit_id: "00000000-0000-4000-8000-000000000030",
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
        </MemoryRouter>
      </QueryClientProvider>
    );

    // The driver field is the shared `Combobox` (input role=combobox + listbox), not a native <select>,
    // so `user.selectOptions(el, "<uuid>")` threw `Value "…" not found in options` and this test never
    // reached the reassign submit it exists to cover. Options are addressed by visible text, not by id.
    const combos = screen.getAllByRole("combobox");
    pickCombo(combos[0], /Test Driver/i);

    expect(screen.getAllByText("Test Driver").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("Driver — not visible")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Reassign$/i }));

    await vi.waitFor(() => {
      expect(postLoadReassign).toHaveBeenCalled();
    });
    const body = (postLoadReassign as ReturnType<typeof vi.fn>).mock.calls[0][1] as { reason_code: string };
    expect(body.reason_code).toBeTruthy();
  });

  it("renders the API's operator-facing reassign error", async () => {
    const user = userEvent.setup();
    (postLoadReassign as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Selected driver was not found for this operating company.")
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <LoadReassignModal
            open
            onClose={vi.fn()}
            loadId="00000000-0000-4000-8000-000000000001"
            operatingCompanyId="00000000-0000-4000-8000-000000000002"
            loadNumber="L-100"
            driversOverride={[
              {
                driver_id: "00000000-0000-4000-8000-000000000010",
                customer_id: "00000000-0000-4000-8000-000000000020",
                unit_id: "00000000-0000-4000-8000-000000000030",
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
        </MemoryRouter>
      </QueryClientProvider>
    );

    pickCombo(screen.getAllByRole("combobox")[0], /Test Driver/i);
    await user.click(screen.getByRole("button", { name: /^Reassign$/i }));

    expect(await screen.findByText("Selected driver was not found for this operating company.")).toBeInTheDocument();
  });
});
