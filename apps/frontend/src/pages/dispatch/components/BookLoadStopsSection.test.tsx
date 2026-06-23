import { render, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { BookLoadStopsSection } from "./BookLoadStopsSection";

// GUARD render-guard upgrade (2026-06-23): the #1355 stop cards existed in source (parity guard passed) but
// rendered FLAT because every address field was gated behind a collapse toggle that defaulted to collapsed.
// This test mounts the section with one stop and asserts the v6 card fields are in the DOM WITHOUT any
// expand interaction — i.e. visible by default, as the design requires.

function Harness() {
  const form = useForm({
    defaultValues: {
      stops: [{ stop_type: "pickup", address_line1: "", city: "", state: "", country: "", free_time_summary: "" }],
    },
  });
  return (
    <BookLoadStopsSection control={form.control as never} register={form.register as never} setValue={form.setValue as never} />
  );
}

describe("BookLoadStopsSection — v6 stop card renders fields inline by default", () => {
  it("renders the stop card and its address/appointment fields without expanding", () => {
    render(<Harness />);

    // The vertical card itself.
    expect(screen.getByTestId("stop-card-0")).toBeInTheDocument();
    expect(screen.getByText("PICKUP")).toBeInTheDocument();
    // v6 fields that were previously hidden behind the collapsed toggle — must be visible by default now.
    for (const label of ["Address", "City", "Zip Code", "Site contact", "Site phone", "Gate / dock"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    // The toggle defaults to "Collapse" (i.e. currently expanded), proving fields are shown by default.
    expect(screen.getByText("Collapse")).toBeInTheDocument();
  });
});
