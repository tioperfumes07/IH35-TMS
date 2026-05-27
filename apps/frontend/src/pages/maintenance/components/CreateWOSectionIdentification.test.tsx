import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreateWOSectionIdentification } from "./CreateWOSectionIdentification";
import type { CreateWOFormValues } from "./CreateWorkOrderModal";

const listMaintenanceVehicles = vi.fn();
const listMaintenanceDrivers = vi.fn();

vi.mock("../../../api/maintenance", () => ({
  listMaintenanceVehicles: (...args: unknown[]) => listMaintenanceVehicles(...args),
  listMaintenanceDrivers: (...args: unknown[]) => listMaintenanceDrivers(...args),
}));

vi.mock("../../../components/Toast", () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

vi.mock("../../../components/forms/QboCombobox", () => ({
  QboCombobox: (props: {
    entityType?: "vendor" | "customer";
    onPick?: (row: { id: string; qbo_id: string; display_name: string; company_name: string; primary_phone: string }) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        props.onPick?.({
          id: "vendor-1",
          qbo_id: "qbo-vendor-1",
          display_name: "Vendor One",
          company_name: "Vendor One",
          primary_phone: "555-1111",
        })
      }
    >
      {props.entityType === "customer" ? "mock-pick-customer" : "mock-pick-vendor"}
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
      operatingCompanyId="company-1"
      setValue={form.setValue}
      getValues={form.getValues}
    />
  );
}

function renderSection() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <TestHarness />
    </QueryClientProvider>
  );
}

describe("CreateWOSectionIdentification", () => {
  beforeEach(() => {
    listMaintenanceVehicles.mockReset();
    listMaintenanceDrivers.mockReset();
    listMaintenanceVehicles.mockResolvedValue({
      rows: [{ id: "unit-1", unit_display_id: "TRK-100" }],
    });
    listMaintenanceDrivers.mockResolvedValue({
      rows: [{ id: "driver-1", first_name: "Alex", last_name: "Driver" }],
    });
  });

  it("shows all seven source type options", async () => {
    renderSection();

    fireEvent.focus(screen.getByDisplayValue("IS - Internal shop"));

    for (const label of [
      "IS - Internal shop",
      "ES - External shop",
      "AC - Accident",
      "ET - External tires",
      "RT - Road call",
      "IT - Internal tires",
      "RS - Roadside service",
    ]) {
      expect(await screen.findByRole("option", { name: label })).toBeTruthy();
    }
  });

  it("uses catalog pickers for unit and driver", async () => {
    renderSection();

    const unitPicker = await screen.findByPlaceholderText("Select unit");
    fireEvent.focus(unitPicker);
    fireEvent.mouseDown(await screen.findByRole("option", { name: "TRK-100" }));

    const driverPicker = await screen.findByPlaceholderText("Select driver");
    fireEvent.focus(driverPicker);
    fireEvent.mouseDown(await screen.findByRole("option", { name: "Alex Driver" }));

    await waitFor(() => {
      expect((document.querySelector('input[name="unit_id"]') as HTMLInputElement).value).toBe("unit-1");
      expect((document.querySelector('input[name="driver_id"]') as HTMLInputElement).value).toBe("driver-1");
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
