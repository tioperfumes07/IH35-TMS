import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MoneyProofTrailPanel } from "./MoneyProofTrailPanel";

const getMoneyProofTrail = vi.fn();
vi.mock("../../api/accounting", () => ({ getMoneyProofTrail: (...args: unknown[]) => getMoneyProofTrail(...args) }));

function renderPanel(documentType: "expense" | "driver_bill" = "expense") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter><QueryClientProvider client={client}>
      <MoneyProofTrailPanel operatingCompanyId="company" documentType={documentType} documentId={documentType} />
    </QueryClientProvider></MemoryRouter>,
  );
}

describe("MoneyProofTrailPanel", () => {
  beforeEach(() => getMoneyProofTrail.mockReset());

  it("shows the immutable trace and clicks through to the journal entry", async () => {
    getMoneyProofTrail.mockResolvedValue({
      document_type: "expense", document_id: "expense", display_id: "EXP-1", trace_no: "7", trace_key: "EX-000007",
      postings: [{ posting_id: "post", journal_entry_id: "je-1", memo: "Expense EXP-1", entry_date: "2026-09-03", status: "posted", account_id: "acct", account_number: "5000", account_name: "Fuel", debit_or_credit: "debit", amount_cents: 1234, description: null, linked_object_type: "load", linked_object_id: "load-1", relationship_role: "expense_for" }],
    });
    renderPanel();
    expect(await screen.findByText("EX-000007")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Expense EXP-1" }).getAttribute("href")).toBe("/accounting/journal-entries/je-1");
    expect(screen.getByText("5000 — Fuel")).toBeTruthy();
    expect(screen.getByRole("link", { name: "expense_for" }).getAttribute("href")).toBe("/dispatch/loads/load-1");
  });

  it("does not imply a posting when the ledger has no rows", async () => {
    getMoneyProofTrail.mockResolvedValue({ document_type: "expense", document_id: "expense", display_id: "EXP-1", trace_no: "7", trace_key: "EX-000007", postings: [] });
    renderPanel();
    expect(await screen.findByText("No ledger posting exists for this document.")).toBeTruthy();
  });

  // LOAD-COSTS-COMPLETE item (4) -- an open driver bill has no posting BY DESIGN (driver pay posts
  // at settlement); the generic "no posting" text reads as a defect, so this must say why instead.
  it("tells the driver why an open tour's proof trail has no posting yet, instead of reading as a gap", async () => {
    getMoneyProofTrail.mockResolvedValue({ document_type: "driver_bill", document_id: "driver_bill", display_id: "DB-1", status: "open", trace_no: "7", trace_key: "DB-000007", postings: [] });
    renderPanel("driver_bill");
    expect(await screen.findByText("Not yet posted — this tour is open. The entry is written at settlement.")).toBeTruthy();
    expect(screen.queryByText("No ledger posting exists for this document.")).toBeNull();
  });
});
