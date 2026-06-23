import { render, screen, within } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { BookLoadStopsSection } from "./BookLoadStopsSection";

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

    // Collapsible Customer instructions.
    expect(screen.getByText(/Customer instructions/)).toBeInTheDocument();
  });

  it("offers Add pickup / Add delivery / multi-leg buttons", () => {
    render(<Harness />);
    expect(screen.getByText("+ Add pickup")).toBeInTheDocument();
    expect(screen.getByText("+ Add delivery")).toBeInTheDocument();
    expect(screen.getByText(/Add stop/)).toBeInTheDocument();
  });
});
