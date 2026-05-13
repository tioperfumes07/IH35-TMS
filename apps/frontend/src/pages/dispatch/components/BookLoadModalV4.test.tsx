import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../../components/Toast";
import { BookLoadModalV4 } from "./BookLoadModalV4";

vi.mock("../../../auth/useAuth", () => ({
  useAuth: () => ({
    user: { role: "Dispatcher", uuid: "81111181-1111-4111-8111-111111111111" },
    session: null,
    isLoading: false,
    isUnauthenticated: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("../../../api/dispatch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/dispatch")>();
  return {
    ...actual,
    reserveDispatchLoadId: vi.fn().mockResolvedValue({
      reservation_uuid: "018bcd5c-e1a2-4b70-9b1c-7d9a2b111111",
      load_number: "L-20991231-0001",
      reserved_until: new Date(Date.now() + 60_000).toISOString(),
      ttl_seconds: 60,
    }),
    releaseDispatchLoadReservation: vi.fn().mockResolvedValue({ released: true }),
  };
});

function wrap(ui: ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe("BookLoadModalV4", () => {
  it("renders four banded sections, miles strip hint, and reserved load bar", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      wrap(
        <ToastProvider>
          <BookLoadModalV4
            open
            operatingCompanyId="91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071"
            onClose={onClose}
            onCreated={vi.fn()}
          />
        </ToastProvider>
      )
    );

    expect(screen.getByText(/Dispatch › Book load › Blueprint v4/)).toBeTruthy();
    expect(screen.getByText(/Drop rate confirmation PDF here/)).toBeTruthy();
    expect(screen.getByText(/Anticipated chargeback/i)).toBeTruthy();
    expect(screen.getAllByText(/Equipment · Driver · Trailer/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Stops · PC\*MILER/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Pre-Dispatch Validation/i)).toBeTruthy();
    expect(screen.getByText(/Shortest miles \(yellow\) used for driver pay/i)).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText(/L-20991231-0001/)).toBeTruthy();
    });
    expect(screen.getByText(/● Reserved/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /resize book load dialog/i })).toBeTruthy();

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
