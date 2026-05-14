import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { getLoadStopsForDispatch, replaceLoadStopsDispatch } from "../../api/dispatch";
import "../../design/design-tokens.css";
import { MultiStopEditor } from "./MultiStopEditor";

vi.mock("../../api/dispatch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/dispatch")>();
  return {
    ...actual,
    getLoadStopsForDispatch: vi.fn().mockResolvedValue({
      stops: [
        {
          id: "s1",
          load_id: "L1",
          sequence_number: 1,
          stop_type: "pickup",
          city: "Austin",
          state: "TX",
          country: "US",
          address_line1: "123 Main",
          scheduled_arrival_at: null,
          appointment_start_at: null,
          appointment_end_at: null,
          notes: null,
          latitude: null,
          longitude: null,
          signature_required: false,
          photo_required: false,
        },
        {
          id: "s2",
          load_id: "L1",
          sequence_number: 2,
          stop_type: "delivery",
          city: "Dallas",
          state: "TX",
          country: "US",
          address_line1: "456 Oak",
          scheduled_arrival_at: null,
          appointment_start_at: null,
          appointment_end_at: null,
          notes: null,
          latitude: null,
          longitude: null,
          signature_required: false,
          photo_required: false,
        },
      ],
    }),
    replaceLoadStopsDispatch: vi.fn().mockResolvedValue({ ok: true, load_id: "L1" }),
  };
});

vi.mock("../../components/Toast", () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

describe("MultiStopEditor (P5-T18)", () => {
  it("add stop increases list", async () => {
    const user = userEvent.setup();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MultiStopEditor loadId="00000000-0000-4000-8000-000000000099" operatingCompanyId="00000000-0000-4000-8000-000000000088" />
      </QueryClientProvider>
    );

    await vi.waitFor(() => {
      expect(screen.getByText("#1 Type")).toBeInTheDocument();
    });
    const before = screen.getAllByRole("button", { name: /Drag to reorder/i }).length;
    await user.click(screen.getByRole("button", { name: /\+ Add stop/i }));
    const after = screen.getAllByRole("button", { name: /Drag to reorder/i }).length;
    expect(after).toBe(before + 1);
  });

  it("save posts replace stops", async () => {
    const user = userEvent.setup();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MultiStopEditor loadId="00000000-0000-4000-8000-000000000099" operatingCompanyId="00000000-0000-4000-8000-000000000088" />
      </QueryClientProvider>
    );
    await vi.waitFor(() => expect(getLoadStopsForDispatch).toHaveBeenCalled());
    const saveBtn = await screen.findByRole("button", { name: /Save stops/i });
    await user.click(saveBtn);
    await vi.waitFor(() => expect(replaceLoadStopsDispatch).toHaveBeenCalled());
  });
});
