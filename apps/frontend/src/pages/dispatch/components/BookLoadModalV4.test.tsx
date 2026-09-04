import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "../../../components/Toast";
import { getLaneMileage } from "../../../api/dispatch";
import { BookLoadModalV4 } from "./BookLoadModalV4";

// GO-21/GO-23 A2 (real fix): the customer field is a `ReferenceSelect` fed by the server's ranked
// ?autocomplete=true search (searchCustomersAutocomplete, queryKey "book-load-v4-customers-
// autocomplete") — was a plain listCustomers(limit: 200/500) page, same CLS-SILENT-CAP defect
// fixed the same way as BookLoadCustomerSection.tsx (which is an orphan never rendered live —
// this is the real, live picker). This file used to mock `searchQboMasterData` — a function
// BookLoadModalV4 does not reference at all (0 occurrences) — so the spy could never fire and the
// D3-3 test failed on "expected vi.fn() to be called at least once" while looking like a
// missing-customer-data bug. Mock the seam the component actually calls.
const searchCustomersAutocompleteMock = vi.fn().mockResolvedValue([
  {
    id: "61111111-1111-4111-8111-111111111111",
    qbo_id: "",
    display_name: "LIVE TEST CUSTOMER LLC",
    primary_email: null,
    primary_phone: null,
    mc_number: null,
    active: true,
  },
]);

vi.mock("../../../api/mdata", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/mdata")>();
  return {
    ...actual,
    searchCustomersAutocomplete: (...args: unknown[]) => searchCustomersAutocompleteMock(...args),
    getCustomerDetail: vi.fn().mockResolvedValue({ customer: { deactivated_at: null } }),
    getDriver: vi.fn().mockResolvedValue({ status: "Active", deactivated_at: null }),
    getUnit: vi.fn().mockResolvedValue({ deactivated_at: null }),
  };
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
    getLaneMileage: vi.fn().mockResolvedValue({
      practical_miles: null,
      short_miles: null,
      empty_miles: null,
      runs: 0,
      short_runs: null,
      practical_spread: null,
      confidence: null,
      autofill_allowed: false,
      fills: false,
      fill_confidence: "none",
      match: "New lane",
      provenance: "New lane. Enter the miles.",
      matched_lane_id: null,
      source: null,
      short_miles_untrustworthy: false,
      short_miles_untrustworthy_reason: null,
    }),
    // GO-23: real getChainDeadhead calls fetch(); unmocked it hangs every test that sets a unit
    // + pickup city/state (chainDeadheadQuery becomes enabled). Default: no prior delivery found.
    getChainDeadhead: vi.fn().mockResolvedValue({
      deadhead_miles: null,
      source: "blank",
      reason: "no_prior_delivery_for_unit",
    }),
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
    expect(screen.getAllByText(/Stops and miles/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Pre-dispatch validation/i)).toBeTruthy();
    expect(screen.getByText(/Enter destination and the customer rate/i)).toBeTruthy();
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

  it("autofills Laredo TX → Denton TX when the city field carries the state", async () => {
    const user = userEvent.setup();
    vi.mocked(getLaneMileage).mockResolvedValue({
      practical_miles: 456.7,
      short_miles: 452.2,
      empty_miles: 0,
      runs: 12,
      short_runs: 12,
      practical_spread: 4.5,
      confidence: "High",
      autofill_allowed: true,
      fills: true,
      fill_confidence: "high",
      match: "City match",
      provenance: "12 runs on this lane. Miles filled from history.",
      matched_lane_id: "lane-laredo-denton",
      source: "history",
      short_miles_untrustworthy: false,
      short_miles_untrustworthy_reason: null,
    });

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

    const pickupCity = document.querySelector<HTMLInputElement>('input[name="stops.0.city"]');
    const deliveryCity = document.querySelector<HTMLInputElement>('input[name="stops.1.city"]');
    expect(pickupCity).toBeTruthy();
    expect(deliveryCity).toBeTruthy();
    await user.type(pickupCity!, "Laredo TX");
    await user.type(deliveryCity!, "Denton TX");

    await waitFor(() => {
      expect(getLaneMileage).toHaveBeenCalledWith(
        expect.objectContaining({
          origin_city: "Laredo",
          origin_state: "TX",
          dest_city: "Denton",
          dest_state: "TX",
        }),
      );
    });
    await waitFor(() => {
      expect((screen.getByTestId("book-miles-practical") as HTMLInputElement).value).toBe("456.7");
      expect((screen.getByTestId("book-miles-shortest") as HTMLInputElement).value).toBe("452.2");
    });
  });

  it("shows OK-only popup and inline flag when catalog short exceeds practical", async () => {
    const user = userEvent.setup();
    vi.mocked(getLaneMileage).mockResolvedValue({
      practical_miles: 1319.7,
      short_miles: 1478.1,
      empty_miles: 207.6,
      runs: 8,
      short_runs: 8,
      practical_spread: null,
      confidence: "High",
      autofill_allowed: true,
      fills: true,
      fill_confidence: "high",
      match: "City match",
      provenance: "8 runs on this lane. Miles filled from history.",
      matched_lane_id: "lane-indy-laredo",
      source: "history",
      short_miles_untrustworthy: true,
      short_miles_untrustworthy_reason: "short_exceeds_practical",
    });

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

    const pickupCity = document.querySelector<HTMLInputElement>('input[name="stops.0.city"]');
    const deliveryCity = document.querySelector<HTMLInputElement>('input[name="stops.1.city"]');
    await user.type(pickupCity!, "Indianapolis IN");
    await user.type(deliveryCity!, "Laredo TX");

    await waitFor(() => {
      expect(screen.getByTestId("miles-invert-ack-dialog")).toBeTruthy();
      expect(screen.getByTestId("book-load-miles-invert-flag")).toBeTruthy();
    });

    await user.click(screen.getByTestId("miles-invert-ack-ok"));

    await waitFor(() => {
      expect(screen.queryByTestId("miles-invert-ack-dialog")).toBeNull();
      expect(screen.getByTestId("book-load-miles-invert-flag")).toBeTruthy();
    });
  });

  it("shows OK-only popup when reverse-lane short differs by more than 100mi", async () => {
    const user = userEvent.setup();
    vi.mocked(getLaneMileage).mockResolvedValue({
      practical_miles: 456.7,
      short_miles: 620.0,
      empty_miles: 0,
      runs: 12,
      short_runs: 12,
      practical_spread: 4.5,
      confidence: "High",
      autofill_allowed: true,
      fills: true,
      fill_confidence: "reverse",
      match: "From the reverse lane",
      provenance: "From the reverse lane, 12 prior runs.",
      matched_lane_id: "lane-reverse-flagged",
      source: "history",
      short_miles_untrustworthy: true,
      short_miles_untrustworthy_reason: "reverse_lane_short_differs_over_100mi",
    });

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

    const pickupCity = document.querySelector<HTMLInputElement>('input[name="stops.0.city"]');
    const deliveryCity = document.querySelector<HTMLInputElement>('input[name="stops.1.city"]');
    await user.type(pickupCity!, "Laredo TX");
    await user.type(deliveryCity!, "Denton TX");

    await waitFor(() => {
      expect(screen.getByTestId("miles-invert-ack-dialog")).toBeTruthy();
      expect(screen.getByText(/differ by more than 100 miles/i)).toBeTruthy();
    });
  });

  it("keeps miles empty and names the blocker when Chicago has no state", async () => {
    const user = userEvent.setup();
    vi.mocked(getLaneMileage).mockClear();

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

    const pickupCity = document.querySelector<HTMLInputElement>('input[name="stops.0.city"]');
    const deliveryCity = document.querySelector<HTMLInputElement>('input[name="stops.1.city"]');
    await user.type(pickupCity!, "Chicago");
    await user.type(deliveryCity!, "Denton");

    await waitFor(() => {
      expect(screen.getByTestId("book-load-miles-lookup-note").textContent).toMatch(
        /Choose the state on pickup and delivery so miles can fill from history/,
      );
    });
    expect((screen.getByTestId("book-miles-practical") as HTMLInputElement).value).toBe("");
    expect(getLaneMileage).not.toHaveBeenCalled();
  });
});
