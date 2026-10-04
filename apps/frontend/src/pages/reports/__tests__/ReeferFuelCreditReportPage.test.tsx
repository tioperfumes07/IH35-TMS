// @vitest-environment jsdom
import * as jestDomMatchers from "@testing-library/jest-dom/matchers";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

expect.extend(jestDomMatchers);

const mocks = vi.hoisted(() => ({ get: vi.fn(), record: vi.fn() }));
vi.mock("../../../api/reports", () => ({ getReeferFuelCreditReport: mocks.get, recordReeferFuelGallons: mocks.record }));
vi.mock("../../../contexts/CompanyContext", () => ({ useCompanyContext: () => ({ selectedCompanyId: "co-1" }) }));
vi.mock("../ReportsSubNav", () => ({ ReportsSubNav: () => null }));
vi.mock("../../../components/layout/PageHeader", () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock("../../../components/EntityPicker", () => ({ EntityPicker: () => null }));
vi.mock("../../../components/shared/EntityLink", () => ({ EntityLink: ({ label }: { label: string }) => <span>{label}</span> }));
vi.mock("../../../components/parity/ParityTable", () => ({
  ParityTable: ({ rows, columns }: { rows: Array<Record<string, unknown>>; columns: Array<{ key: string; render?: (r: unknown) => ReactNode }> }) => (
    <table>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {columns.map((c) => (
              <td key={c.key}>{c.render ? c.render(r) : String(r[c.key] ?? "")}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  ),
}));

import { ReeferFuelCreditReportPage } from "../ReeferFuelCreditReportPage";

const report = {
  rows: [
    { source: "fuel_card", source_id: "ft1", expense_id: "e1", expense_line_id: "l1", document_number: "13508-1", date: "2026-08-02", vendor_name: "LOVES", location: "Laredo, TX", unit_id: null, unit_number: null, trailer_id: null, trailer_number: null, load_id: null, load_number: null, gallons: 93.463, cost_cents: 50367, price_per_gallon_cents: 538.9 },
    { source: "expense", source_id: "l2", expense_id: "e2", expense_line_id: "l2", document_number: "13517-17", date: "2026-08-07", vendor_name: "Fuel America", location: null, unit_id: null, unit_number: null, trailer_id: null, trailer_number: null, load_id: null, load_number: "13517", gallons: null, cost_cents: 4547, price_per_gallon_cents: null },
  ],
  totals: { fills: 2, fills_missing_gallons: 1, fills_missing_trailer: 2, gallons: 93.463, cost_cents: 54914, cost_cents_with_gallons: 50367, credit_rate_cents_per_gallon: 24.3, estimated_credit_cents: 2271 },
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ReeferFuelCreditReportPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("U25 Reefer fuel credit — gallons per quarter for Form 4136", () => {
  it("totals gallons, cost and the credit estimate, and flags fills with no gallons", async () => {
    mocks.get.mockResolvedValue(report);
    renderPage();
    const totals = await screen.findByTestId("reefer-totals");
    expect(totals).toHaveTextContent("93.463");
    expect(totals).toHaveTextContent("$549.14");
    expect(totals).toHaveTextContent("$22.71");
    expect(screen.getByTestId("reefer-missing-banner")).toHaveTextContent("1 reefer fill has no gallons");
    expect(mocks.get).toHaveBeenCalledWith("co-1", expect.stringMatching(/^\d{4}-\d{2}-01$/), expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
  });

  it("records the gallons of a fill from its receipt", async () => {
    mocks.get.mockResolvedValue(report);
    mocks.record.mockResolvedValue({ expense_line_id: "l2", gallons: 21.5, rate_cents: 211.49 });
    renderPage();
    const input = await screen.findByTestId("reefer-gallons-input");
    fireEvent.change(input, { target: { value: "21.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Record" }));
    await waitFor(() => expect(mocks.record).toHaveBeenCalledWith("co-1", "l2", { gallons: 21.5, trailer_id: null }));
  });
});
