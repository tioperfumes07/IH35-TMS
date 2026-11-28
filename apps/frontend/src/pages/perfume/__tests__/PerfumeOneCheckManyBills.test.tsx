import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { PayMultipleBills } from "../PerfumePayablesPanel";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

// ROUND L.31 M4 (CC2, fixed by LEAD): ONE check pays several bills = ONE request to the check engine, every bill applied, the number once.
const calls: Array<[string, unknown]> = [];
beforeEach(() => {
  calls.length = 0;
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
    calls.push([path, opts?.body]);
    return { payment_batch_id: "pb1", bill_payment_ids: ["bp1", "bp2"] };
  });
});
const bill = (id: string, cents: number) => ({ id, display_id: id.toUpperCase(), bill_number: null, vendor_id: "v1", bill_date: "2026-11-01", due_date: "2026-11-30",
  past_due: 0, amount_cents: cents, settled_cents: 0, open_cents: cents, bucket: "current" as const, purchase_order_id: null, po_number: null });

describe("one check pays several bills", () => {
  it("one POST /api/v1/checks/pay-bills with both bills; never one payment per bill", async () => {
    const done = vi.fn(async () => undefined);
    render(<MemoryRouter><ToastProvider><PayMultipleBills bills={[bill("b1", 10000), bill("b2", 25000)]} vendorId="v1" companyId="sx1"
      banks={[{ id: "bank-1000", name: "Operating Checking", account_type: "checking", account_number: "1000" }]} onClose={() => undefined} onDone={done} /></ToastProvider></MemoryRouter>);
    fireEvent.change(screen.getByTestId("perfume-ap-multi-check"), { target: { value: "1043" } });
    fireEvent.click(screen.getByTestId("perfume-ap-multi-pay-save"));
    await waitFor(() => expect(done).toHaveBeenCalled());
    expect(calls).toEqual([["/api/v1/checks/pay-bills", expect.objectContaining({ operating_company_id: "sx1", payee_kind: "vendor", payee_id: "v1", bank_account_id: "bank-1000",
      check_number: "1043", applications: [{ bill_id: "b1", amount_cents: 10000 }, { bill_id: "b2", amount_cents: 25000 }] })]]);
  });
});
