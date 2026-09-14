import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../../api/client";
import { LiveLoadIdBar } from "./LiveLoadIdBar";

vi.mock("../../../../api/dispatch", () => ({
  reserveDispatchLoadId: vi.fn(),
  releaseDispatchLoadReservation: vi.fn().mockResolvedValue({ released: true }),
}));

import { reserveDispatchLoadId } from "../../../../api/dispatch";

describe("LiveLoadIdBar first load number", () => {
  it("keeps Load # typed when reserve-id returns first_load_number_required", async () => {
    vi.mocked(reserveDispatchLoadId).mockRejectedValue(
      new ApiError(422, { error: "first_load_number_required" })
    );
    const onReservationUpdate = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <LiveLoadIdBar
          operatingCompanyId="5c854333-6ea5-4faa-af31-67cb272fef80"
          onReservationUpdate={onReservationUpdate}
        />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/First load for this company/)).toBeTruthy();
    });
    expect(screen.queryByText(/Load number unavailable/)).toBeNull();
    const input = screen.getByTestId("qbo-document-number-load");
    expect(input).not.toBeDisabled();
    await userEvent.type(input, "13508");
    expect(onReservationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ load_number: "13508", reservation_uuid: "" })
    );
  });
});

describe("LiveLoadIdBar pre-fill (P1 2026-09-14)", () => {
  it("pre-fills the reserved number on open, and a typed override wins verbatim", async () => {
    vi.mocked(reserveDispatchLoadId).mockResolvedValue({
      reservation_uuid: "resv-1",
      load_number: "13596",
      reserved_until: new Date(Date.now() + 60_000).toISOString(),
      ttl_seconds: 60,
    });
    const onReservationUpdate = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <LiveLoadIdBar
          operatingCompanyId="5c854333-6ea5-4faa-af31-67cb272fef80"
          onReservationUpdate={onReservationUpdate}
        />
      </QueryClientProvider>
    );

    const input = screen.getByTestId("qbo-document-number-load") as HTMLInputElement;
    // Editable, but pre-filled on open — the owner's own words for this fix.
    await waitFor(() => expect(input.value).toBe("13596"));
    expect(onReservationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ load_number: "13596", reservation_uuid: "resv-1" })
    );

    // Typed value wins verbatim, same QuickBooks rule as the Load Costs NUMBER column.
    await userEvent.clear(input);
    await userEvent.type(input, "13700");
    expect(input.value).toBe("13700");
    expect(onReservationUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ load_number: "13700" })
    );
  });
});
