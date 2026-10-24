// LEAD 443.290 — after a fleet import the first open assignment question opens (443.243). Closing that question must
// return to the import with its REJECTED rows still on screen; only a CLEAN import closes once its question is done.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const importFuelTransactions = vi.fn();
vi.mock("../../../../api/fuelPlanner", () => ({
  importFuelTransactions: (...args: unknown[]) => importFuelTransactions(...args),
  importWexStatement: vi.fn(),
}));
vi.mock("../../../../components/Toast", () => ({ useToast: () => ({ pushToast: vi.fn() }) }));
vi.mock("../../../../api/fuelAssignmentQuestions", () => ({
  listFuelAssignmentQuestions: vi.fn(async () => ({ rows: [{ id: "q-1" }] })),
}));
vi.mock("../FuelAssignmentPopup", () => ({
  FuelAssignmentPopup: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? <button type="button" onClick={onClose}>Close assignment question</button> : null,
}));

import { ImportFuelTransactionsModal } from "../ImportFuelTransactionsModal";

const result = (deadLetters: number) => ({
  rows_inserted: 3, rows_duplicate: 0, rows_skipped: 0, dead_letters: deadLetters,
  dead_letter_details: Array.from({ length: deadLetters }, (_, i) => ({ row_number: i + 2, reason: `bad card on row ${i + 2}` })),
});

function mount(onClose = vi.fn()) {
  const view = render(
    <QueryClientProvider client={new QueryClient()}>
      <ImportFuelTransactionsModal open operatingCompanyId="co-1" onClose={onClose} onImported={vi.fn()} />
    </QueryClientProvider>
  );
  const file = new File(["Card #,Tran Date"], "fleet.csv", { type: "text/csv" });
  fireEvent.change(view.container.ownerDocument.querySelector('input[type="file"]')!, { target: { files: [file] } });
  return { onClose };
}

describe("ImportFuelTransactionsModal — assignment question after import (443.290)", () => {
  beforeEach(() => importFuelTransactions.mockReset());

  it("an import with rejected rows returns to those rows when its question is closed (never closes the import)", async () => {
    importFuelTransactions.mockResolvedValueOnce(result(2));
    const { onClose } = mount();
    fireEvent.click(screen.getByRole("button", { name: "+ Import Fuel Transactions" }));
    const closeQuestion = await screen.findByRole("button", { name: "Close assignment question" });
    fireEvent.click(closeQuestion);
    await waitFor(() => expect(screen.getByTestId("fuel-import-rejected-rows")).toBeTruthy());
    expect(screen.getByText(/2 rows rejected/)).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("a clean import closes once its question is done", async () => {
    importFuelTransactions.mockResolvedValueOnce(result(0));
    const { onClose } = mount();
    fireEvent.click(screen.getByRole("button", { name: "+ Import Fuel Transactions" }));
    fireEvent.click(await screen.findByRole("button", { name: "Close assignment question" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
