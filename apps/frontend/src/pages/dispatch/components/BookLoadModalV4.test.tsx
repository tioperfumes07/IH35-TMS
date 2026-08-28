import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "../../../components/Toast";
import { BookLoadModalV4 } from "./BookLoadModalV4";

// The customer field does NOT search-as-you-type: it is a `ReferenceSelect` fed by a react-query bulk
// preload (`listCustomers({limit: 5000})`, queryKey "book-load-v4-customers"). This file used to mock
// `searchQboMasterData` — a function BookLoadModalV4 does not reference at all (0 occurrences) — so the
// spy could never fire and the D3-3 test failed on "expected vi.fn() to be called at least once" while
// looking like a missing-customer-data bug. Mock the seam the component actually calls.
const listCustomersMock = vi.fn().mockResolvedValue({
  customers: [{ id: "61111111-1111-4111-8111-111111111111", name: "LIVE TEST CUSTOMER LLC" }],
});

vi.mock("../../../api/mdata", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/mdata")>();
  return { ...actual, listCustomers: (...args: unknown[]) => listCustomersMock(...args) };
});

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
  // MemoryRouter: the Book Load wizard (or a child it gained) calls useNavigate, so EVERY render threw
  // "useNavigate() may be used only in the context of a <Router> component" — both cases died before a
  // single assertion ran, leaving the module's core screen with no executing coverage at all. The app
  // always renders this inside the router; the harness was the unrealistic part.
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("BookLoadModalV4", () => {
  it("renders correct locked wizard structure", async () => {
    render(
      wrap(
        <ToastProvider>
          <BookLoadModalV4
            open
            operatingCompanyId="91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071"
            onClose={vi.fn()}
            onCreated={vi.fn()}
          />
        </ToastProvider>
      )
    );

    expect(screen.getByText(/Dispatch › Book load/)).toBeTruthy();
    expect(screen.getByText("Book load")).toBeTruthy();
    expect(screen.getByText(/Drop rate confirmation PDF/)).toBeTruthy();
    expect(screen.getAllByText(/Expected adjustments/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Equipment · Driver · Trailer/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Stops · Miles/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Pre-dispatch validation/i)).toBeTruthy();
    expect(screen.getByText(/Enter Shortest \(driver pay\)/i)).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText(/L-20991231-0001/)).toBeTruthy();
    });
    expect(screen.getByText(/● Reserved/i)).toBeTruthy();
  });

  it("clears the stale customer_id when the picked customer text is edited over (D3-3)", async () => {
    const user = userEvent.setup();

    render(
      wrap(
        <ToastProvider>
          <BookLoadModalV4
            open
            operatingCompanyId="91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071"
            onClose={vi.fn()}
            onCreated={vi.fn()}
          />
        </ToastProvider>
      )
    );

    // Pick a real customer from the list — the picker is a listbox, so the option is clicked, not typed.
    const customerInput = await screen.findByPlaceholderText(/Search customers/i);
    await user.click(customerInput);
    await user.click(await screen.findByRole("option", { name: /LIVE TEST CUSTOMER LLC/i }));

    // Precondition: a real customer FK was captured on the hidden customer_id field.
    const hidden = () => document.querySelector<HTMLInputElement>('input[name="customer_id"]');
    await waitFor(() => expect(hidden()?.value).toBe("61111111-1111-4111-8111-111111111111"));

    // THE INVARIANT. Typing over the picked customer must drop the old FK. Before the fix this held the
    // ORIGINAL id while the box read "LIVE TEST CUSTOMER LLCXYZ" — a customer that does not exist — so a
    // dispatcher could book the load against a customer that was no longer on screen.
    await user.type(customerInput, "XYZ");
    await waitFor(() => expect(hidden()?.value).toBe(""));
  });

  it("prefills the canonical driver and unit FKs supplied by an awaiting-unit entry point", async () => {
    render(
      wrap(
        <ToastProvider>
          <BookLoadModalV4
            open
            operatingCompanyId="91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071"
            prefillUnitId="395352db-7b51-4f07-8dc7-f1e2f1a321bc"
            prefillDriverId="49427973-e93e-4ea7-a2eb-eb9eefa7f331"
            onClose={vi.fn()}
            onCreated={vi.fn()}
          />
        </ToastProvider>
      )
    );

    await waitFor(() => expect(screen.getByTestId("deadhead-optimizer-panel")).toBeTruthy());
    expect(screen.getByTestId("book-miles-shortest").getAttribute("required")).not.toBeNull();
    expect(screen.queryByText("Select driver / unit / customer to run checks")).toBeNull();
  });
});
