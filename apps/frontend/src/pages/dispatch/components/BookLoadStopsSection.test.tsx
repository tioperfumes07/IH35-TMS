import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { BookLoadStopsSection } from "./BookLoadStopsSection";

// AddressGeocodeInput debounce-fetches our geocoding proxy; mock it so the typing test never hits the
// network and no geocode result auto-resolves (we test the TYPED-but-not-selected path for FIX-2).
vi.mock("../../../api/geocoding", () => ({ geocodeSearch: vi.fn(async () => []) }));

// GUARD render-truth §C: each stop is a TWO-ROW card (locrow / siterow) + a collapsible Customer
// instructions — NOT a vertical field stack. This test mounts one stop and asserts the exact design
// labels are in the DOM, in the right row container, with no expand interaction.

function Harness() {
  const form = useForm({
    defaultValues: {
      stops: [
        {
          stop_type: "pickup",
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
  return <BookLoadStopsSection control={form.control as never} register={form.register as never} setValue={form.setValue as never} />;
}

describe("BookLoadStopsSection — render-v6 §C two-row stop card", () => {
  it("renders the locrow + siterow with the exact design labels", () => {
    render(<Harness />);

    expect(screen.getByTestId("stop-card-0")).toBeInTheDocument();
    expect(screen.getByText("PICKUP")).toBeInTheDocument();

    // Row 1 (.locrow): Address | City | St | Zip Code | Date | Time
    const locrow = screen.getByTestId("stop-locrow-0");
    for (const label of ["Address", "City", "St", "Zip Code", "Date", "Time"]) {
      expect(within(locrow).getByText(label)).toBeInTheDocument();
    }

    // Row 2 (.siterow): Site contact | Site phone | Dock | Free time / lumper | Lumper amount ($)
    const siterow = screen.getByTestId("stop-siterow-0");
    for (const label of ["Site contact", "Site phone", "Dock", "Free time / lumper", "Lumper amount ($)"]) {
      expect(within(siterow).getByText(label)).toBeInTheDocument();
    }

    // Empty-diff (GUARD): NOTHING extra renders in the stop card — the relocated fields must be absent.
    for (const extra of ["Customer instructions", "Appointment start", "Appointment end", "Lumper paid by", "Lumper required", "Tarp stop", "Tarp count", "Instructions / directions"]) {
      expect(screen.queryByText(extra)).not.toBeInTheDocument();
    }
  });

  it("offers Add pickup / Add delivery / multi-leg buttons", () => {
    render(<Harness />);
    expect(screen.getByText("+ Add pickup")).toBeInTheDocument();
    expect(screen.getByText("+ Add delivery")).toBeInTheDocument();
    expect(screen.getByText(/Add stop/)).toBeInTheDocument();
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
          { stop_type: "pickup", address_full: "", address_line1: "", city: "", state: "", country: "USA", postal_code: "", scheduled_arrival_at: "", site_contact_name: "", site_contact_phone: "", gate_dock_text: "", free_time_summary: "", lumper_amount_cents: 0, stop_notes: "" },
        ],
      },
    });
    getValues = () => form.getValues() as Record<string, unknown>;
    return <BookLoadStopsSection control={form.control as never} register={form.register as never} setValue={form.setValue as never} />;
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
