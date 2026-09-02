import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { useForm } from "react-hook-form";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { BookLoadCustomerSection, type BookLoadFormValues } from "./BookLoadCustomerSection";

const searchCustomersAutocompleteMock = vi.fn();

vi.mock("../../../api/mdata", () => ({
  searchCustomersAutocomplete: (...args: unknown[]) => searchCustomersAutocompleteMock(...args),
}));

let getValues: (() => BookLoadFormValues) | null = null;

function TestHarness({ operatingCompanyId = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }: { operatingCompanyId?: string }) {
  const form = useForm<BookLoadFormValues>({
    defaultValues: {
      customer_id: "",
      customer_qbo_id: "",
      customer_name: "",
      customer_wo_number: "",
      customer_po_number: "",
      commodity: "",
      weight_lbs: 0,
      hazmat: false,
      driver_instructions_text: "",
      notes: "",
      linehaul_cents: 0,
      fuel_surcharge_cents: 0,
      accessorial_cents: 0,
    },
  });
  getValues = () => form.getValues();
  return (
    <BookLoadCustomerSection
      register={form.register}
      watch={form.watch}
      operatingCompanyId={operatingCompanyId}
      setValue={form.setValue}
      getValues={form.getValues}
      customerIdError={form.formState.errors.customer_id?.message}
    />
  );
}

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
    </MemoryRouter>
  );
}

describe("BookLoadCustomerSection", () => {
  it("picking a customer saves customer_id and customer_name to form state", async () => {
    const user = userEvent.setup();
    searchCustomersAutocompleteMock.mockResolvedValue([
      {
        id: "61111111-1111-4111-8111-111111111111",
        qbo_id: "",
        display_name: "LIVE TEST CUSTOMER LLC",
        primary_email: "ar@example.com",
        primary_phone: "555-0100",
        mc_number: null,
        active: true,
      },
    ]);

    wrap(<TestHarness />);
    expect(getValues).not.toBeNull();

    const inputs = screen.getAllByPlaceholderText(/Search customers…/i);
    const primary = inputs[0];
    await user.click(primary);

    await waitFor(() => expect(searchCustomersAutocompleteMock).toHaveBeenCalled(), { timeout: 4000 });

    const option = await screen.findByRole("option", { name: /LIVE TEST CUSTOMER LLC/i });
    await user.click(option);

    await waitFor(() => {
      const v = getValues!();
      expect(v.customer_id).toBe("61111111-1111-4111-8111-111111111111");
      expect(v.customer_name).toBe("LIVE TEST CUSTOMER LLC");
    });
  });

  it("the customer reference lookup appends to Special notes without changing customer_id", async () => {
    const user = userEvent.setup();
    searchCustomersAutocompleteMock.mockResolvedValue([
      {
        id: "61111111-1111-4111-8111-111111111111",
        qbo_id: "",
        display_name: "LIVE TEST CUSTOMER LLC",
        primary_email: "ar@example.com",
        primary_phone: "555-0100",
        mc_number: null,
        active: true,
      },
    ]);

    wrap(<TestHarness />);
    expect(getValues).not.toBeNull();

    const referenceInput = screen.getByPlaceholderText(/Search customers to add a reference/i);
    await user.click(referenceInput);

    await waitFor(() => expect(searchCustomersAutocompleteMock).toHaveBeenCalled(), { timeout: 4000 });

    const option = await screen.findByRole("option", { name: /LIVE TEST CUSTOMER LLC/i });
    await user.click(option);

    await waitFor(() => {
      const v = getValues!();
      expect(v.customer_id).toBe("");
      expect(v.notes).toContain("LIVE TEST CUSTOMER LLC");
    });
  });
});
