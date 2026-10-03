// @vitest-environment jsdom
import * as jestDomMatchers from "@testing-library/jest-dom/matchers";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

expect.extend(jestDomMatchers);

const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  assign: vi.fn(),
}));

vi.mock("../../../../api/checks", () => ({
  assignCheckPrintBatch: mocks.assign,
  confirmCheckPrintBatch: vi.fn(),
  getCheckStockSettings: vi.fn(async () => ({ settings: { next_check_number: "1001", check_type: "voucher" } })),
  listCheckPrintQueue: vi.fn(async () => ({
    rows: [
      { id: "c1", print_on_check_name: "Alpha Tires", transaction_date: "2026-10-01", total_amount_cents: 1000, memo: null },
      { id: "c2", print_on_check_name: "Bravo Parts", transaction_date: "2026-10-01", total_amount_cents: 2000, memo: null },
      { id: "c3", print_on_check_name: "Charlie Fuel", transaction_date: "2026-10-02", total_amount_cents: 3000, memo: null },
    ],
  })),
  previewCheckPrintBatch: mocks.preview,
  putCheckStockSettings: vi.fn(),
}));
vi.mock("../../../../api/banking", () => ({
  getCashGlMapping: vi.fn(async () => ({
    bank_accounts: [{ id: "bank-1", account_name: "BOA Checking", ledger_account_id: "gl-1", account_class: "depository" }],
  })),
}));
vi.mock("../../../../contexts/CompanyContext", () => ({ useCompanyContext: () => ({ selectedCompanyId: "co-1" }) }));
vi.mock("../../AccountingSubNavWrapper", () => ({
  AccountingSubNavWrapper: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("../../../../components/Toast", () => ({ useToast: () => ({ pushToast: vi.fn() }) }));

import { CheckPrintPage } from "../CheckPrintPage";

/** Server-shaped preview: row i = typed[i] ?? previous + 1, gaps above the stock's 1001. */
function fakePreview(input: { ids: string[]; numbers?: Array<string | null> }) {
  const nums: number[] = [];
  input.ids.forEach((_, i) => nums.push(input.numbers?.[i] ? Number(input.numbers[i]) : i === 0 ? 1001 : nums[i - 1] + 1));
  const used = new Set(nums);
  const gaps: Array<{ from: string; to: string; count: number }> = [];
  for (let n = 1001; n < Math.max(...nums); n += 1) if (!used.has(n)) gaps.push({ from: String(n), to: String(n), count: 1 });
  return {
    next_on_file: "1001",
    assignments: input.ids.map((id, i) => ({ check_id: id, check_number: String(nums[i]) })),
    duplicates: nums.includes(900) ? [{ check_number: "900", held_by: "a check to Delta Repair" }] : [],
    gaps,
    gap_count: gaps.length,
    next_after: String(Math.max(...nums) + 1),
  };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CheckPrintPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

async function selectAllThree() {
  renderPage();
  const bank = await screen.findByRole("combobox", { name: /bank account/i });
  await waitFor(() => expect(screen.getByRole("option", { name: "BOA Checking" })).toBeInTheDocument());
  fireEvent.change(bank, { target: { value: "bank-1" } });
  await screen.findByText("Alpha Tires");
  fireEvent.click(screen.getByLabelText(/select all/i));
  await waitFor(() => expect(screen.getAllByTestId("print-check-number").map((i) => (i as HTMLInputElement).value)).toEqual(["1001", "1002", "1003"]));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("U9 Print checks — proposed, editable, continues from what is typed", () => {
  it("shows the proposed number per check, and the checks below an edit continue from it", async () => {
    mocks.preview.mockImplementation(async (input) => fakePreview(input));
    await selectAllThree();
    fireEvent.change(screen.getAllByTestId("print-check-number")[1], { target: { value: "1010" } });
    await waitFor(() =>
      expect(screen.getAllByTestId("print-check-number").map((i) => (i as HTMLInputElement).value)).toEqual(["1001", "1010", "1011"])
    );
    expect(mocks.preview).toHaveBeenLastCalledWith(expect.objectContaining({ ids: ["c1", "c2", "c3"], numbers: [null, "1010", null] }));
  });

  it("lists skipped numbers and keeps Assign disabled until a reason is given; the reason is sent", async () => {
    mocks.preview.mockImplementation(async (input) => fakePreview(input));
    mocks.assign.mockResolvedValue({ print_batch_id: "b1", assignments: [], skipped: [] });
    await selectAllThree();
    fireEvent.change(screen.getAllByTestId("print-check-number")[0], { target: { value: "1003" } });
    const panel = await screen.findByTestId("print-gap-panel");
    expect(panel).toHaveTextContent("#1001");
    expect(panel).toHaveTextContent("#1002");
    const assign = screen.getByRole("button", { name: /assign numbers/i });
    expect(assign).toBeDisabled();
    fireEvent.change(screen.getByTestId("print-gap-reason"), { target: { value: "torn in printer" } });
    await waitFor(() => expect(assign).toBeEnabled());
    fireEvent.click(assign);
    await waitFor(() =>
      expect(mocks.assign).toHaveBeenCalledWith(expect.objectContaining({ numbers: ["1003", null, null], gap_reason: "torn in printer" }))
    );
  });

  it("warns on a number already used and refuses to assign it", async () => {
    mocks.preview.mockImplementation(async (input) => fakePreview(input));
    await selectAllThree();
    fireEvent.change(screen.getAllByTestId("print-check-number")[2], { target: { value: "900" } });
    expect(await screen.findByTestId("print-check-duplicate")).toHaveTextContent("Already used — a check to Delta Repair");
    expect(screen.getByRole("button", { name: /assign numbers/i })).toBeDisabled();
  });
});
