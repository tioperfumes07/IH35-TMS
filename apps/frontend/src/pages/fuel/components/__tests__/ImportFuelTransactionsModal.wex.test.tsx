// LEAD 443.202 — Fuel → Import, "England WEX statement": the first click previews (dry run, nothing written) and shows the
// plan per outcome; only the second click posts the same file.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const importWexStatement = vi.fn();
vi.mock("../../../../api/fuelPlanner", () => ({
  importFuelTransactions: vi.fn(),
  importWexStatement: (...args: unknown[]) => importWexStatement(...args),
}));
vi.mock("../../../../components/Toast", () => ({ useToast: () => ({ pushToast: vi.fn() }) }));

import { ImportFuelTransactionsModal } from "../ImportFuelTransactionsModal";

const outcome = (lines: number, cents: number) => ({ lines, cents });
const plan = (dry: boolean) => ({
  dry_run: dry,
  file: "TransactionReport-261021102759.csv",
  lines: 3,
  fills: 2,
  by_outcome: {
    pre_cutoff: outcome(0, 0), already_imported: outcome(0, 0), adopted: outcome(1, 18033), cross_rail: outcome(0, 0),
    amount_mismatch: outcome(0, 0), imported: outcome(1, 49044), scale_adopted: outcome(0, 0), scale_imported: outcome(0, 0),
    held_no_load: outcome(1, 1969), unresolved: outcome(0, 0),
  },
  difference_posted_cents: 0,
  fees_not_posted_cents: 0,
  dead_letters: [],
  results: [{ line_number: 4, efs_invoice: "05661", item: "DEFD", local_date: "2026-10-11", net_cents: 1969, outcome: "held_no_load", reason: "no load covers truck 175" }],
});

describe("ImportFuelTransactionsModal — England WEX statement (443.202)", () => {
  it("previews first (dry run) and posts only on the second click", async () => {
    importWexStatement.mockResolvedValueOnce(plan(true)).mockResolvedValueOnce(plan(false));
    const onImported = vi.fn();
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <ImportFuelTransactionsModal open operatingCompanyId="co-1" onClose={vi.fn()} onImported={onImported} />
      </QueryClientProvider>
    );
    fireEvent.change(screen.getByTestId("fuel-import-kind"), { target: { value: "wex" } });
    const file = new File(["Card #,Tran Date"], "TransactionReport-261021102759.csv", { type: "text/csv" });
    fireEvent.change(container.ownerDocument.querySelector('input[type="file"]')!, { target: { files: [file] } });

    fireEvent.click(screen.getByRole("button", { name: /Preview WEX statement/ }));
    await waitFor(() => expect(screen.getByTestId("wex-statement-plan")).toBeTruthy());
    expect(importWexStatement).toHaveBeenLastCalledWith("co-1", file, true);
    expect(screen.getByText(/Already on a settlement — adopted, no second row/)).toBeTruthy();
    expect(screen.getByText(/Invoice 05661 DEFD 2026-10-11: no load covers truck 175/)).toBeTruthy();
    expect(onImported).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Post WEX statement/ }));
    await waitFor(() => expect(onImported).toHaveBeenCalled());
    expect(importWexStatement).toHaveBeenLastCalledWith("co-1", file, false);
  });
});
