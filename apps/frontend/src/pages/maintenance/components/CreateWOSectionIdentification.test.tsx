import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../../components/Toast";
import { CreateWOSectionIdentification } from "./CreateWOSectionIdentification";
import type { CreateWOFormValues } from "./CreateWorkOrderModal";

const listMaintenanceVehicles = vi.fn();
const listUnits = vi.fn();
const getUnit = vi.fn();
const getDriver = vi.fn();
const listDrivers = vi.fn();
const listVendors = vi.fn();
const listCustomers = vi.fn();

vi.mock("../../../api/maintenance", () => ({
  listMaintenanceVehicles: (...args: unknown[]) => listMaintenanceVehicles(...args),
}));

// The unit picker is `EntityPicker kind="unit"`, whose registry entry calls `listUnits` from api/mdata
// (components/parity/entityPickerRegistry.ts) — NOT the api/maintenance `listMaintenanceVehicles` this
// test was written against before the migration. Because this factory replaces the whole module, an
// omitted `listUnits` is not a passthrough: the registry's call blows up and the picker renders zero
// options, surfacing as `Unable to find role="option" and name "T169"` — which reads as missing DATA.
vi.mock("../../../api/mdata", () => ({
  listUnits: (...args: unknown[]) => listUnits(...args),
  // The Class auto-derive ({UNIT}-{LASTNAME}, §7) reads the SELECTED row via getUnit/getDriver, not the
  // list call — omitting them left the derive falling back to the literal "UNIT-DRIVER".
  getUnit: (...args: unknown[]) => getUnit(...args),
  getDriver: (...args: unknown[]) => getDriver(...args),
  listVendors: (...args: unknown[]) => listVendors(...args),
  listCustomers: (...args: unknown[]) => listCustomers(...args),
  listDrivers: (...args: unknown[]) => listDrivers(...args),
}));

vi.mock("../../../components/drivers/CreateDriverModal", () => ({
  CreateDriverModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="create-driver-modal-stub">CreateDriverModal</div> : null,
}));

// 2026-08-20 (CC-3): both vendor and customer migrated off ReferenceSelect onto the real
// EntityPicker (kind="vendor" / kind="customer", server-search, CLS-SILENT-CAP) — this mock is
// dead now (nothing in CreateWOSectionIdentification.tsx imports ReferenceSelect any more). The
// vendor test below now drives the real Combobox the same way the unit/driver tests above it
// already do (focus the placeholder input, click the option).

function TestHarness() {
  const form = useForm<CreateWOFormValues>({
    defaultValues: {
      wo_type: "repair",
      source_type: "IS",
      bucket: "in_house",
      service_date: "2026-05-27",
      unit_id: "",
      driver_id: "",
      class_hint: "",
      repair_location: "in_house",
      vendor_id: "",
      vendor_qbo_id: "",
      vendor_display_name: "",
      customer_id: "",
      customer_qbo_id: "",
      customer_display_name: "",
      shop_name: "",
      shop_address: "",
      shop_phone: "",
      vendor_invoice_number: "",
      external_vendor_id: "",
      external_vendor_wo_number: "",
      external_vendor_invoice_number: "",
      load_id: "",
      load_exemption_reason: "",
      description: "test",
      payment_timing: "in_house",
      bill_terms: "net_30",
      bill_date: "2026-05-27",
      due_date: "",
      roadside_callout_at: "",
      roadside_arrived_at: "",
      roadside_provider_vendor_id: "",
      roadside_location: "",
      roadside_breakdown_load_id: "",
      line_items: [],
    },
  });

  return (
    <CreateWOSectionIdentification
      register={form.register}
      watch={form.watch}
      setValue={form.setValue}
      getValues={form.getValues}
      operatingCompanyId="opco-1"
    />
  );
}

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    // ToastProvider: this section now calls useToast (a child gained it after this harness was written),
    // so every render threw "useToast must be used inside ToastProvider" before any assertion ran. The app
    // always renders it inside the provider — the harness was the unrealistic part.
    <QueryClientProvider client={client}>
      <ToastProvider>
        <TestHarness />
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("CreateWOSectionIdentification", () => {
  beforeEach(() => {
    listMaintenanceVehicles.mockResolvedValue({
      rows: [{ id: "unit-1", unit_display_id: "T169" }],
    });
    // Registry shape: { units: [{ id, unit_number }] } — see entityPickerRegistry.ts unit.list().
    listUnits.mockResolvedValue({ units: [{ id: "unit-1", unit_number: "T169" }] });
    getUnit.mockResolvedValue({ id: "unit-1", unit_number: "T169" });
    getDriver.mockResolvedValue({ id: "driver-1", first_name: "Alex", last_name: "Driver" });
    listDrivers.mockResolvedValue({
      drivers: [{ id: "driver-1", first_name: "Alex", last_name: "Driver" }],
    });
    listVendors.mockResolvedValue({
      vendors: [{ id: "vendor-1", name: "Vendor One", deactivated_at: null }],
    });
    listCustomers.mockResolvedValue({
      customers: [{ id: "customer-1", name: "Customer One" }],
    });
  });

  it("selects unit and driver from master-data pickers", async () => {
    renderSection();

    const unitPicker = await screen.findByPlaceholderText("Select unit");
    fireEvent.focus(unitPicker);
    fireEvent.click(await screen.findByRole("option", { name: "T169" }));

    const driverPicker = await screen.findByPlaceholderText("Select driver");
    fireEvent.focus(driverPicker);
    fireEvent.click(await screen.findByRole("option", { name: "Alex Driver" }));

    await waitFor(() => {
      expect((document.querySelector('input[name="unit_id"]') as HTMLInputElement).value).toBe("unit-1");
      expect((document.querySelector('input[name="driver_id"]') as HTMLInputElement).value).toBe("driver-1");
    });
  });

  it("AUDIT-611: Class (auto) shows T169-DRIVER not raw UUIDs", async () => {
    renderSection();

    const unitPicker = await screen.findByPlaceholderText("Select unit");
    fireEvent.focus(unitPicker);
    fireEvent.click(await screen.findByRole("option", { name: "T169" }));

    const driverPicker = await screen.findByPlaceholderText("Select driver");
    fireEvent.focus(driverPicker);
    fireEvent.click(await screen.findByRole("option", { name: "Alex Driver" }));

    await waitFor(() => {
      const classInput = screen.getByTestId("wo-class-auto-derive") as HTMLInputElement;
      expect(classInput.value).toBe("T169-DRIVER");
      expect(classInput.value).not.toMatch(/unit-1|driver-1|[0-9a-f]{8}-[0-9a-f]{4}/i);
    });
  });

  it("mirrors canonical vendor into external vendor id", async () => {
    renderSection();

    const vendorPicker = await screen.findByPlaceholderText("Search vendors…");
    fireEvent.focus(vendorPicker);
    fireEvent.click(await screen.findByRole("option", { name: /Vendor One/ }));

    await waitFor(() => {
      expect((document.querySelector('input[name="vendor_id"]') as HTMLInputElement).value).toBe("vendor-1");
      expect((document.querySelector('input[name="external_vendor_id"]') as HTMLInputElement).value).toBe("vendor-1");
    });
  });
});
