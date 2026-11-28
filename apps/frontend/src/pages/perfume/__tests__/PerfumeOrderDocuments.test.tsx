/** M22: the order's documents — print the packing slip / the invoice, e-mail either as a PDF to the customer. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import * as printDoc from "../../../lib/openPrintableDocument";
import { ToastProvider } from "../../../components/Toast";
import { PerfumeOrderDocuments } from "../PerfumeOrderDocuments";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));
vi.mock("../../../lib/openPrintableDocument", () => ({ openPrintableDocument: vi.fn() }));

describe("PerfumeOrderDocuments", () => {
  it("prints the slip and the invoice, and e-mails the invoice to the customer", async () => {
    const api = vi.mocked(clientApi.apiRequest);
    api.mockImplementation(async (url: string) => (url.endsWith("/invoices")
      ? { invoices: [{ id: "inv1", display_id: "INV-000101", status: "draft", total_cents: "10000", issue_date: "2026-11-27" }], operating_company_id: "sx" }
      : { ok: true, batch_id: "b1", recipients: 1, file: "Invoice INV-000101 SO-000001.pdf" }) as never);
    render(<ToastProvider><QueryClientProvider client={new QueryClient()}><PerfumeOrderDocuments orderId="o1" number="SO-000001" customerEmail="buyer@zz.com" /></QueryClientProvider></ToastProvider>);
    fireEvent.click(screen.getByTestId("perfume-order-print-slip"));
    expect(printDoc.openPrintableDocument).toHaveBeenCalledWith("/api/v1/perfume/orders/o1/packing-slip.html");
    await waitFor(() => expect(screen.getByTestId("perfume-order-print-invoice-inv1")).toBeTruthy());
    fireEvent.click(screen.getByTestId("perfume-order-print-invoice-inv1"));
    expect(printDoc.openPrintableDocument).toHaveBeenCalledWith("/api/v1/accounting/invoices/inv1.html?operating_company_id=sx");
    fireEvent.change(screen.getByTestId("perfume-order-email-doc"), { target: { value: "invoice" } });
    expect((screen.getByTestId("perfume-order-email-to") as HTMLInputElement).value).toBe("buyer@zz.com");
    fireEvent.click(screen.getByTestId("perfume-order-email-send"));
    await waitFor(() => expect(api).toHaveBeenCalledWith("/api/v1/perfume/orders/o1/email-document", { method: "POST", body: { doc: "invoice", to: "buyer@zz.com" } }));
  });
});
