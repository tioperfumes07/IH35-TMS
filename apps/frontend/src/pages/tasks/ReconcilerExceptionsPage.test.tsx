import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReconcilerRun } from "../../api/reconciler";
import { ReconcilerExceptionsPage, recordHref, repairHint } from "./ReconcilerExceptionsPage";

const COMPANY = "5c854333-6ea5-4faa-af31-67cb272fef80";
const fetchReconcilerExceptions = vi.fn();

vi.mock("../../api/reconciler", async (orig) => {
  const actual = await orig<typeof import("../../api/reconciler")>();
  return { ...actual, fetchReconcilerExceptions: (...args: unknown[]) => fetchReconcilerExceptions(...args) };
});
vi.mock("../../contexts/CompanyContext", () => ({ useCompanyContext: () => ({ selectedCompanyId: COMPANY }) }));
vi.mock("./TasksModuleTabs", () => ({ TasksModuleTabs: () => null }));

const LOAD = "0a20a60d-c652-433b-9cfd-4d4e017c05cc";

function run(overrides: Partial<ReconcilerRun> = {}): ReconcilerRun {
  return {
    operating_company_id: COMPANY,
    ran_at: "2026-09-23T04:00:00.000Z",
    exception_count: 2,
    errored_invariants: [],
    results: [
      {
        invariant: "I2",
        title: "A delivered load has an issued invoice",
        status: "ok",
        exceptions: [
          {
            key: `I2/load/${LOAD}/invoice`,
            invariant: "I2",
            entity_type: "load",
            entity_id: LOAD,
            entity_label: "13615",
            field: "invoice",
            reason: "Faro bought invoice 13615 for $3,200.00 on this load, but our books have no issued invoice for it.",
            since: "2026-09-12T23:24:21Z",
            since_source: "factor.faro_invoice_lines.created_at",
            owner_seat: "CC-2",
            repair_engine: "POST /api/v1/accounting/invoices/from-load",
            amount_cents: 320000,
          },
        ],
      },
      {
        invariant: "I8",
        title: "A dispatched load has a truck, a trailer, a driver and a customer reference",
        status: "ok",
        exceptions: [
          {
            key: `I8/load/${LOAD}/unit`,
            invariant: "I8",
            entity_type: "load",
            entity_id: LOAD,
            entity_label: "13615",
            field: "unit",
            reason: "No truck is assigned to this load.",
            since: "2026-09-20T10:00:00Z",
            since_source: "mdata.loads.created_at",
            owner_seat: "CC-3",
            repair_engine: null,
          },
        ],
      },
    ],
    ...overrides,
  };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ReconcilerExceptionsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Tasks > Exceptions (reconciler queue)", () => {
  beforeEach(() => fetchReconcilerExceptions.mockReset());

  it("lists every exception in plain words, links the load, and totals the money at stake", async () => {
    fetchReconcilerExceptions.mockResolvedValue(run());
    renderPage();
    expect(await screen.findByText(/Faro bought invoice 13615/)).toBeTruthy();
    expect(screen.getByText("No truck is assigned to this load.")).toBeTruthy();
    const links = screen.getAllByRole("link", { name: "13615" });
    expect(links[0].getAttribute("href")).toBe(`/dispatch/loads/${LOAD}`);
    expect(screen.getByText("Create the invoice from this load")).toBeTruthy();
    expect(screen.getByText("Complete the missing item on the load")).toBeTruthy();
    expect(screen.getAllByText("$3,200.00").length).toBeGreaterThan(0);
    expect(fetchReconcilerExceptions).toHaveBeenCalledWith(COMPANY, expect.anything());
    expect(screen.queryByText(/I2|I8|CC-2|CC-3|repair_engine|from-load/)).toBeNull();
  });

  it("says plainly when a rule could not be checked, instead of showing it as clean", async () => {
    fetchReconcilerExceptions.mockResolvedValue(
      run({
        results: [{ invariant: "I-DEDUCT", title: "A driver recovery still ties to the customer short-pay it recovers", status: "error", error: "boom", exceptions: [] }],
        errored_invariants: ["I-DEDUCT"],
        exception_count: 0,
      }),
    );
    renderPage();
    const banner = await screen.findByTestId("reconciler-errored");
    expect(within(banner).getByText(/could not be checked this time/)).toBeTruthy();
  });

  it("an empty queue reads as every rule holding", async () => {
    fetchReconcilerExceptions.mockResolvedValue(run({ results: [], exception_count: 0 }));
    renderPage();
    expect(await screen.findByText(/every rule the reconciler checks holds right now/)).toBeTruthy();
  });

  it("repair hints and record links follow the engine each exception names", () => {
    const base = run().results[0].exceptions[0];
    expect(repairHint({ ...base, repair_engine: "POST /api/v1/accounting/invoices/:id/send" })).toBe("Send the draft invoice already on this load");
    expect(repairHint({ ...base, entity_type: "recovery_link", repair_engine: null })).toBe("Review the driver recovery");
    expect(recordHref({ ...base, entity_type: "invoice_dispute" })).toBeNull();
  });
});
