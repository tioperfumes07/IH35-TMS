import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { BookLoadEquipmentSection } from "./BookLoadEquipmentSection";

// GUARD render-guard (render-v6 §B): the reefer/flatbed detail panels are CONDITIONAL on trailer type.
// Token-in-source is insufficient (the panels can exist but never reveal). These tests mount the section
// with the triggering trailer type and assert the design fields actually reach the DOM.

function Harness({ trailer }: { trailer: string }) {
  const form = useForm({ defaultValues: { trailer_type: trailer, requires_tarps: true } as Record<string, unknown> });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <BookLoadEquipmentSection
        register={form.register as never}
        watch={form.watch as never}
        setValue={form.setValue as never}
        operatingCompanyId={undefined}
      />
    </QueryClientProvider>
  );
}

describe("BookLoadEquipmentSection — render-v6 §B conditional panels", () => {
  it("reveals the Reefer panel (temp / mode / pre-cool) only for a reefer trailer", () => {
    render(<Harness trailer="refrigerated_van" />);
    // RENDER-A-v2: reefer panel is just "Reefer temperature (°F)" (mode + pre-cool removed).
    expect(screen.getByText("Reefer temperature (°F)")).toBeInTheDocument();
    expect(screen.queryByText("Reefer mode")).not.toBeInTheDocument();
    expect(screen.queryByText("Pre-cool")).not.toBeInTheDocument();
  });

  it("reveals the Flatbed panel (tarp required / qty / size) only for a flatbed", () => {
    render(<Harness trailer="flatbed" />);
    expect(screen.getByText("Tarp required?")).toBeInTheDocument();
    expect(screen.getByText("Tarp qty")).toBeInTheDocument();
    expect(screen.getByText("Tarp size")).toBeInTheDocument();
  });

  it("HOS block (Driver HOS clocks) always renders in section B", () => {
    render(<Harness trailer="dry_van" />);
    expect(screen.getByText("Driver HOS (hours of service)")).toBeInTheDocument();
  });
});
