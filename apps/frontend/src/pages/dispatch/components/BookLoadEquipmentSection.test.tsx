import { render, screen, waitFor } from "@testing-library/react";
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

// EntityPicker (truck/trailer) fires its own catalog fetches once operatingCompanyId is set; stub it
// so the WIZ-32 pay-rate assertions are not coupled to unrelated network in jsdom.
vi.mock("../../../components/EntityPicker", () => ({
  EntityPicker: ({ placeholder }: { placeholder?: string }) => <div data-testid="entity-picker-stub">{placeholder ?? "entity"}</div>,
}));

// WIZ-32 / WIZ-16 — the pay-rate box resolves from the driver's profile rate card. Mock only that one
// read (keep the rest of the api/dispatch module real) so the DOM contract can be asserted with a
// known per-mile rate. 55 cents => "0.55" on screen.
const getDriverPayCardMock = vi.fn(async () => ({
  has_rate: true,
  basis_type: "per_mile_pay",
  rate_per_mile_cents: 55,
  rate_empty_per_mile_cents: 55,
  flat_per_load_cents: null,
}));
vi.mock("../../../api/dispatch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/dispatch")>();
  return { ...actual, getDriverPayCard: (...args: unknown[]) => getDriverPayCardMock(...(args as [])) };
});

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

// WIZ-32 / WIZ-16 — DOM contract for the "Driver pay rate / mi" box. Owner law: 0 is a claim, blank
// is an honest unknown. Reads the rendered input's value/readOnly, not a source string.
function PayRateHarness({ driverId, companyId }: { driverId: string; companyId?: string }) {
  const form = useForm({
    defaultValues: { trailer_type: "dry_van", assigned_primary_driver_id: driverId } as Record<string, unknown>,
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <BookLoadEquipmentSection
          register={form.register as never}
          watch={form.watch as never}
          setValue={form.setValue as never}
          operatingCompanyId={companyId}
        />
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("BookLoadEquipmentSection — ROUND 443.258-B (D024): no driver pay rate in Book Load", () => {
  // Owner ruling D024: the driver's per-mile rate resolves at settlement, not in Book Load. The old
  // WIZ-32 "Driver pay rate / mi" box was removed; these assertions keep it from coming back and keep
  // any hidden 0-valued pay field out of the wizard.
  it("renders no 'Driver pay rate' label or input with no driver", () => {
    render(<PayRateHarness driverId="" companyId={undefined} />);
    expect(screen.queryByText(/driver pay rate/i)).toBeNull();
    expect(screen.queryByLabelText(/driver pay rate/i)).toBeNull();
  });

  it("renders no 'Driver pay rate' and never fetches the driver pay card when a driver is selected", () => {
    render(
      <PayRateHarness driverId="11111111-1111-1111-1111-111111111111" companyId="00000000-0000-0000-0000-000000000000" />,
    );
    expect(screen.queryByText(/driver pay rate/i)).toBeNull();
    expect(getDriverPayCardMock).not.toHaveBeenCalled();
  });
});
