import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../../components/Toast";
import { BookLoadEquipmentSection } from "./BookLoadEquipmentSection";

vi.mock("../../../components/drivers/DriverPickerWithCreate", () => ({
  DriverPickerWithCreate: ({ placeholder }: { placeholder?: string }) => (
    <div data-testid="driver-picker-stub">{placeholder ?? "driver"}</div>
  ),
}));

// GUARD render-guard (render-v6 §B): the reefer/flatbed detail panels are CONDITIONAL on trailer type.
// Token-in-source is insufficient (the panels can exist but never reveal). These tests mount the section
// with the triggering trailer type and assert the design fields actually reach the DOM.

function Harness({ trailer }: { trailer: string }) {
  const form = useForm({ defaultValues: { trailer_type: trailer, requires_tarps: true } as Record<string, unknown> });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    // ToastProvider: this section (or a child it gained) calls useToast, so all three cases threw
    // "useToast must be used inside ToastProvider" at render — the reefer/flatbed/HOS panel assertions never
    // ran. The app always renders Book Load inside the provider; the harness was the unrealistic part.
    <QueryClientProvider client={client}>
      <ToastProvider>
      <BookLoadEquipmentSection
        register={form.register as never}
        watch={form.watch as never}
        setValue={form.setValue as never}
        operatingCompanyId={undefined}
      />
      </ToastProvider>
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
