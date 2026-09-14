import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../../api/client";
import { LiveLoadIdBar } from "./LiveLoadIdBar";

vi.mock("../../../../api/dispatch", () => ({
  peekNextLoadNumber: vi.fn(),
}));

import { peekNextLoadNumber } from "../../../../api/dispatch";

describe("LiveLoadIdBar first load number", () => {
  it("keeps Load # typed when peek returns first_load_number_required", async () => {
    vi.mocked(peekNextLoadNumber).mockRejectedValue(
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

describe("LiveLoadIdBar peek-only (P0 2026-09-14 — LOAD-NUMBER-COUNTER-BURN-ON-OPEN)", () => {
  it("pre-fills the BOX with the preview but does NOT publish it as a real request until edited", async () => {
    vi.mocked(peekNextLoadNumber).mockResolvedValue({ next_number: "13596" });
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
    // Editable, visually pre-filled on open — the owner's own words for the P1 fix still hold.
    await waitFor(() => expect(input.value).toBe("13596"));
    // THE CRITICAL BEHAVIOR: an unedited preview must publish an EMPTY load_number, never the
    // preview text itself — otherwise book-load.service.ts would treat it as a manually-typed
    // number (a direct claim, not the atomic save-time allocator), reintroducing the exact race
    // GO-10-REV-B eliminated and defeating the whole point of peek-only. The real number is
    // decided once, atomically, at actual save.
    expect(onReservationUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ load_number: "", reservation_uuid: "" })
    );

    // Typed value wins verbatim, same QuickBooks rule as the Load Costs NUMBER column — and NOW
    // it is published for real, because the operator explicitly chose it.
    await userEvent.clear(input);
    await userEvent.type(input, "13700");
    expect(input.value).toBe("13700");
    expect(onReservationUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ load_number: "13700" })
    );
  });

  it("never calls a reserving endpoint — only the non-consuming peek", async () => {
    vi.mocked(peekNextLoadNumber).mockResolvedValue({ next_number: "13596" });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <LiveLoadIdBar operatingCompanyId="5c854333-6ea5-4faa-af31-67cb272fef80" onReservationUpdate={() => {}} />
      </QueryClientProvider>
    );
    await waitFor(() => expect(peekNextLoadNumber).toHaveBeenCalledTimes(1));
    // No renewal timer, no polling — a single peek per mount. Wait past the old 60s TTL window's
    // scale (shortened here) and confirm no second call fires.
    await new Promise((r) => setTimeout(r, 50));
    expect(peekNextLoadNumber).toHaveBeenCalledTimes(1);
  });
});
