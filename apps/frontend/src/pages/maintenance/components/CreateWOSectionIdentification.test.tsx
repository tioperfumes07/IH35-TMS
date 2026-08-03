import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreateWOSectionIdentification } from "./CreateWOSectionIdentification";
import type { CreateWOFormValues } from "./CreateWorkOrderModal";

const listMaintenanceVehicles = vi.fn();
const listDrivers = vi.fn();
const listVendors = vi.fn();
const listCustomers = vi.fn();

vi.mock("../../../api/maintenance", () => ({
  listMaintenanceVehicles: (...args: unknown[]) => listMaintenanceVehicles(...args),
}));

vi.mock("../../../api/mdata", () => ({
  listVendors: (...args: unknown[]) => listVendors(...args),
  listCustomers: (...args: unknown[]) => listCustomers(...args),
  listDrivers: (...args: unknown[]) => listDrivers(...args),
}));

vi.mock("../../../components/drivers/CreateDriverModal", () => ({
  CreateDriverModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="create-driver-modal-stub">CreateDriverModal</div> : null,
}));

vi.mock("../../../components/parity/ReferenceSelect", () => ({
  ReferenceSelect: (props: {
    createKind?: string;
    options?: Array<{ value: string; label: string }>;
    onChange?: (value: string | null) => void;
    onOptionCreated?: (opt: { value: string; label: string }) => void;
  }) => (
    <button
      type="button"
      onClick={() => {
        const fallback =
          props.createKind === "customer"
            ? { value: "customer-1", label: "Customer One" }
            : { value: "vendor-1", label: "Vendor One" };
        const picked = props.options?.[0] ?? fallback;
        props.onChange?.(picked.value);
        props.onOptionCreated?.(picked);
      }}
    >
      {props.createKind === "customer" ? "mock-pick-customer" : "mock-pick-vendor"}
    </button>
  ),
}));

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
    <QueryClientProvider client={client}>
      <TestHarness />
    </QueryClientProvider>
  );
}

describe("CreateWOSectionIdentification", () => {
  beforeEach(() => {
    listMaintenanceVehicles.mockResolvedValue({
      rows: [{ id: "unit-1", unit_display_id: "T169" }],
    });
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

    fireEvent.click(await screen.findByRole("button", { name: "mock-pick-vendor" }));

    await waitFor(() => {
      expect((document.querySelector('input[name="vendor_id"]') as HTMLInputElement).value).toBe("vendor-1");
      expect((document.querySelector('input[name="external_vendor_id"]') as HTMLInputElement).value).toBe("vendor-1");
    });
  });
});
