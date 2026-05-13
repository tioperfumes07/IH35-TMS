import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { BookLoadCustomerSection, type BookLoadFormValues } from "./BookLoadCustomerSection";

const searchMock = vi.fn();

vi.mock("../../../api/qbo-mdata", () => ({
  searchQboMasterData: (...args: unknown[]) => searchMock(...args),
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
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("BookLoadCustomerSection", () => {
  it("onPick saves customer_id, customer_qbo_id, and customer_name to form state", async () => {
    const user = userEvent.setup();
    searchMock.mockResolvedValue({
      results: [
        {
          id: "61111111-1111-4111-8111-111111111111",
          qbo_id: "qb-cust-77",
          display_name: "LIVE TEST CUSTOMER LLC",
          active: true,
          company_name: "LIVE TEST CUSTOMER LLC",
          primary_email: "ar@example.com",
          primary_phone: "555-0100",
        },
      ],
    });

    wrap(<TestHarness />);
    expect(getValues).not.toBeNull();

    const inputs = screen.getAllByPlaceholderText(/Select QBO customer/i);
    const primary = inputs[0];
    await user.click(primary);
    await user.type(primary, "LIVE");

    await waitFor(() => expect(searchMock).toHaveBeenCalled(), { timeout: 4000 });

    const option = await screen.findByRole("button", { name: /LIVE TEST CUSTOMER LLC/i });
    await user.click(option);

    await waitFor(() => {
      const v = getValues!();
      expect(v.customer_id).toBe("61111111-1111-4111-8111-111111111111");
      expect(v.customer_qbo_id).toBe("qb-cust-77");
      expect(v.customer_name).toBe("LIVE TEST CUSTOMER LLC");
    });
  });
});
