import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { PerfumeLoansPanel } from "../PerfumeLoansPanel";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

// ROUND L.31 M13: ScentsX loans and notes payable on the one related-party loan engine; the button picks the liability account.
const seen: string[] = [];
const facility = { id: "f1", operating_company_id: "sx1", account_id: "a2400", account_number: "2400", account_name: "Loans from Owner", counterparty_name: "Jorge", relationship: "owner",
  status: "open", principal_advanced_cents: 500000, principal_repaid_cents: 100000, open_balance_cents: 400000, accrued_interest_cents: 1200, advance_count: 1, repayment_count: 1, created_at: "2026-11-27T10:00:00Z" };
beforeEach(() => {
  seen.length = 0;
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string) => {
    seen.push(path);
    if (path === "/api/v1/scentsx/company") return { company: { id: "sx1", code: "SCENTSX", legal_name: "ScentsX LLC" } };
    if (path.startsWith("/api/v1/accounting/related-party-loan-facilities")) return { facilities: [facility] };
    if (path.includes("accounts")) return { accounts: [
      { id: "a1000", account_number: "1000", account_name: "Operating Bank", account_type: "Bank", account_subtype: null },
      { id: "a2400", account_number: "2400", account_name: "Loans from Owner", account_type: "Liability", account_subtype: null },
      { id: "a2500", account_number: "2500", account_name: "Notes Payable", account_type: "Liability", account_subtype: null }] };
    return {};
  });
});
const mount = () => render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider><PerfumeLoansPanel /></ToastProvider></QueryClientProvider></MemoryRouter>);
const toReview = async () => {
  for (let i = 0; i < 2; i++) fireEvent.click(screen.getByRole("button", { name: "Next" }));
  const p = await screen.findByLabelText("Principal in USD"); fireEvent.change(p, { target: { value: "25000.00" } }); fireEvent.blur(p);
  for (let i = 0; i < 2; i++) fireEvent.click(screen.getByRole("button", { name: "Next" }));
};

describe("ScentsX loans & notes payable", () => {
  it("lists the running loan with what is owed, for ScentsX only", async () => {
    mount();
    expect(await screen.findByText("Jorge")).toBeTruthy();
    expect(screen.getAllByText("$4,000.00").length).toBeGreaterThan(0);
    expect(seen.some((p) => p.includes("related-party-loan-facilities?operating_company_id=sx1"))).toBe(true);
  });
  it("Note payable opens the loan engine on 2500 Notes Payable, lender 'other', 4%", async () => {
    mount();
    await screen.findByText("Jorge");
    fireEvent.click(screen.getByTestId("scentsx-ln-note"));
    await screen.findByTestId("loan-wizard-title");
    await toReview();
    await waitFor(() => { const t = document.querySelector("pre")?.textContent ?? ""; expect(t).toContain('"account_id": "a2500"'); expect(t).toContain('"relationship": "other"'); expect(t).toContain('"principal_cents": 2500000'); });
  });
  it("Loan from owner opens on 2400 Loans from Owner", async () => {
    mount();
    await screen.findByText("Jorge");
    fireEvent.click(screen.getByTestId("scentsx-ln-owner"));
    await screen.findByTestId("loan-wizard-title");
    await toReview();
    await waitFor(() => { const t = document.querySelector("pre")?.textContent ?? ""; expect(t).toContain('"account_id": "a2400"'); expect(t).toContain('"relationship": "owner"'); });
  });
});
