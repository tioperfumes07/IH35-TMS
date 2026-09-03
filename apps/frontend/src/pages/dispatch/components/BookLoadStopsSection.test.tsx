import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { BookLoadStopsSection } from "./BookLoadStopsSection";
import { ToastProvider } from "../../../components/Toast";

// AddressGeocodeInput debounce-fetches our geocoding proxy; mock it so the typing test never hits the
// network and no geocode result auto-resolves (we test the TYPED-but-not-selected path for FIX-2).
// GO-24: the geocode-enabled probe also calls this — resolving `[]` (no `.enabled`) means the probe
// reads as falsy/disabled, so these tests exercise the plain-input fallback branch, same as before.
vi.mock("../../../api/geocoding", () => ({ geocodeSearch: vi.fn(async () => []) }));
// GO-24: LocationPicker calls listLocations — mock it empty so the picker mounts with no network call.
vi.mock("../../../api/mdata", () => ({ listLocations: vi.fn(async () => ({ locations: [] })), createLocation: vi.fn() }));

// GUARD render-truth §C: each stop is a TWO-ROW card (locrow / siterow) + a collapsible Customer
// instructions — NOT a vertical field stack. This test mounts one stop and asserts the exact design
// labels are in the DOM, in the right row container, with no expand interaction.

// GO-24: BookLoadStopsSection now calls useQuery (geocode-enabled probe + LocationPicker) — every
// harness needs a QueryClientProvider in the tree or react-query throws "No QueryClient set".
function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>
  );
}

function Harness() {
  const form = useForm({
    defaultValues: {
      stops: [
        {
          stop_type: "pickup",
          location_id: "",
          address_full: "",
          address_line1: "",
          city: "",
          state: "",
          country: "USA",
          postal_code: "",
          scheduled_arrival_at: "",
          site_contact_name: "",
          site_contact_phone: "",
          gate_dock_text: "",
          free_time_summary: "",
          lumper_amount_cents: 0,
          stop_notes: "",
        },
      ],
    },
  });
  return wrap(
    <BookLoadStopsSection operatingCompanyId="" control={form.control as never} register={form.register as never} setValue={form.setValue as never} />
  );
}

describe("BookLoadStopsSection — owner stop row order 2026-09-03", () => {
  it("renders locrow + siterow + timewindow with the owner labels", () => {
    render(<Harness />);

    expect(screen.getByTestId("stop-card-0")).toBeInTheDocument();
    expect(screen.getByText("PICKUP")).toBeInTheDocument();

    // Row 1: Location · Address · City · State · Zip
    const locrow = screen.getByTestId("stop-locrow-0");
    for (const label of ["Location", "Address", "City", "State", "Zip"]) {
      expect(
        within(locrow).getByText((_, el) => el?.tagName === "LABEL" && el.textContent === label),
      ).toBeInTheDocument();
    }
    expect(within(locrow).queryByText("Date")).not.toBeInTheDocument();
    expect(within(locrow).queryByText("Appointment date")).not.toBeInTheDocument();

    // Row 2: Appointment date/time · Site contact · Site phone · Dock
    const siterow = screen.getByTestId("stop-siterow-0");
    for (const label of ["Appointment date", "Time", "Site contact", "Site phone", "Dock"]) {
      expect(within(siterow).getByText(label)).toBeInTheDocument();
    }

    // Row 3: Time window (+ free time / lumper)
    const timeWindowRow = screen.getByTestId("stop-timewindow-0");
    expect(within(timeWindowRow).getByText("Time window")).toBeInTheDocument();
    expect(within(timeWindowRow).getByText("Free time / lumper")).toBeInTheDocument();
    expect(within(timeWindowRow).getByText("Lumper amount ($)")).toBeInTheDocument();

    for (const extra of ["Customer instructions", "Appointment start", "Appointment end", "Lumper paid by", "Lumper required", "Tarp stop", "Tarp count", "Instructions / directions"]) {
      expect(screen.queryByText(extra)).not.toBeInTheDocument();
    }
  });

  it("offers Create pickup / Create delivery / multi-leg buttons", () => {
    render(<Harness />);
    expect(screen.getByText("+ Create pickup")).toBeInTheDocument();
    expect(screen.getByText("+ Create delivery")).toBeInTheDocument();
    expect(screen.getByText(/Create stop/)).toBeInTheDocument();
  });
});

// FIX-2 (address binding): GUARD live-verified that typing "100 Main St" displayed in the field but the
// booking payload sent address_line1: "". The typed text lived only in address_full; address_line1 was
// set only by the geocode onResolve. This guard locks that a typed address — with NO match selected —
// commits to the serialized key.
describe("BookLoadStopsSection — address binding (FIX-2 guard)", () => {
  let getValues: (() => Record<string, unknown>) | null = null;
  function BindingHarness() {
    const form = useForm({
      defaultValues: {
        stops: [
          { stop_type: "pickup", location_id: "", address_full: "", address_line1: "", city: "", state: "", country: "USA", postal_code: "", scheduled_arrival_at: "", site_contact_name: "", site_contact_phone: "", gate_dock_text: "", free_time_summary: "", lumper_amount_cents: 0, stop_notes: "" },
        ],
      },
    });
    getValues = () => form.getValues() as Record<string, unknown>;
    return wrap(
      <BookLoadStopsSection operatingCompanyId="" control={form.control as never} register={form.register as never} setValue={form.setValue as never} />
    );
  }

  it("commits a typed address to stops[0].address_line1 even with NO geocode match selected", async () => {
    const user = userEvent.setup();
    render(<BindingHarness />);
    await user.type(screen.getByPlaceholderText("123 Main St"), "100 Main St");

    const stops = (getValues!().stops ?? []) as Array<Record<string, unknown>>;
    expect(stops[0]!.address_line1).toBe("100 Main St"); // was "" before the fix
    expect(stops[0]!.address_full).toBe("100 Main St");
  });
});
