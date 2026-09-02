import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { BillsReverseSection } from "./BillsReverseSection";
import { ToastProvider } from "../Toast";

const listBills = vi.fn().mockResolvedValue({ rows: [] });
vi.mock("../../api/accounting", () => ({
  listBills: (...args: unknown[]) => listBills(...args),
  billVendorDrillId: () => null,
}));

const payBillModalProps = vi.fn();
vi.mock("../../pages/accounting/PayBillModal", () => ({
  PayBillModal: (props: Record<string, unknown>) => {
    payBillModalProps(props);
    return props.open ? <div data-testid="pay-bill-modal-stub" /> : null;
  },
}));

function renderSection(props: Parameters<typeof BillsReverseSection>[0]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ToastProvider>
          <BillsReverseSection {...props} />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("BillsReverseSection", () => {
  it("GO-18 (owner correction 2026-09-02, N1 gap): shows an Add Bill link for a load filter, carrying load_id and load_number", async () => {
    renderSection({
      operatingCompanyId: "usmca",
      filter: { load_id: "load-1" },
      contextLabel: "this load",
      createLoadNumber: "L-20260901-0007",
    });
    const link = await screen.findByTestId("bills-reverse-add-bill");
    expect(link).toHaveAttribute("href", "/accounting/bills/vendor?load_id=load-1&load_number=L-20260901-0007");
  });

  it("never shows Add Bill for a non-load filter (unit/insurance_claim) — load-from-load only", async () => {
    renderSection({ operatingCompanyId: "usmca", filter: { unit_id: "unit-1" }, contextLabel: "this unit" });
    await screen.findByText(/No bills linked to this unit/i);
    expect(screen.queryByTestId("bills-reverse-add-bill")).not.toBeInTheDocument();
  });

  it("still renders Open Bills for both filter kinds (existing behavior unchanged)", async () => {
    renderSection({ operatingCompanyId: "usmca", filter: { load_id: "load-1" }, contextLabel: "this load" });
    expect(await screen.findByRole("link", { name: "Open Bills" })).toHaveAttribute(
      "href",
      "/accounting/bills?load_id=load-1"
    );
  });

  describe("GO-23 N1 remainder (owner direct instruction 2026-09-02) — bill-payment from a load", () => {
    const OPEN_BILL = {
      id: "bill-open-1",
      operating_company_id: "usmca",
      vendor_id: null,
      vendor_uuid: "vendor-1",
      mdata_vendor_id: null,
      vendor_name: "Acme Fuel",
      display_id: "B-0001",
      bill_number: "INV-100",
      bill_date: "2026-09-01",
      due_date: "2026-09-30",
      amount_cents: 50000,
      paid_cents: 0,
      status: "open",
      memo: null,
    };
    const PAID_BILL = { ...OPEN_BILL, id: "bill-paid-1", status: "paid", paid_cents: 50000 };

    it("shows an enabled Pay button for a load filter on a bill with an open balance", async () => {
      listBills.mockResolvedValueOnce({ rows: [OPEN_BILL] });
      renderSection({ operatingCompanyId: "usmca", filter: { load_id: "load-1" }, contextLabel: "this load" });
      const payButton = await screen.findByTestId("bill-reverse-pay-bill-open-1");
      expect(payButton).not.toBeDisabled();
    });

    it("disables Pay when the bill is already paid (no remaining balance)", async () => {
      listBills.mockResolvedValueOnce({ rows: [PAID_BILL] });
      renderSection({ operatingCompanyId: "usmca", filter: { load_id: "load-1" }, contextLabel: "this load" });
      const payButton = await screen.findByTestId("bill-reverse-pay-bill-paid-1");
      expect(payButton).toBeDisabled();
    });

    it("never shows Pay for a non-load filter — load-from-load only, same restriction as Add Bill", async () => {
      listBills.mockResolvedValueOnce({ rows: [OPEN_BILL] });
      renderSection({ operatingCompanyId: "usmca", filter: { unit_id: "unit-1" }, contextLabel: "this unit" });
      await screen.findByTestId("bill-reverse-bill-open-1");
      expect(screen.queryByTestId("bill-reverse-pay-bill-open-1")).not.toBeInTheDocument();
    });

    it("opens PayBillModal with the clicked row's own bill when Pay is clicked", async () => {
      listBills.mockResolvedValueOnce({ rows: [OPEN_BILL] });
      renderSection({ operatingCompanyId: "usmca", filter: { load_id: "load-1" }, contextLabel: "this load" });
      const payButton = await screen.findByTestId("bill-reverse-pay-bill-open-1");
      fireEvent.click(payButton);
      expect(await screen.findByTestId("pay-bill-modal-stub")).toBeInTheDocument();
      expect(payBillModalProps).toHaveBeenCalledWith(
        expect.objectContaining({ open: true, bill: expect.objectContaining({ id: "bill-open-1" }) })
      );
    });
  });
});
