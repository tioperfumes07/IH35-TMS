// @vitest-environment jsdom
import * as jestDomMatchers from "@testing-library/jest-dom/matchers";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

expect.extend(jestDomMatchers);

const modalProps = vi.hoisted(() => ({ last: null as null | Record<string, unknown> }));

vi.mock("../../../api/receipts", () => ({
  getReceipts: vi.fn(async () => ({ items: [], total: 0 })),
  getReceiptDetail: vi.fn(),
}));
vi.mock("../../../contexts/CompanyContext", () => ({ useCompanyContext: () => ({ selectedCompanyId: "co-1" }) }));
vi.mock("../AccountingSubNavWrapper", () => ({
  AccountingSubNavWrapper: ({ children, actions }: { children: ReactNode; actions?: ReactNode }) => (
    <div>
      {actions}
      {children}
    </div>
  ),
}));
vi.mock("../../../components/expenses/RecordExpenseModal", () => ({
  RecordExpenseModal: (props: Record<string, unknown>) => {
    modalProps.last = props;
    return props.open ? <div data-testid="expense-creator">{String(props.title)}</div> : null;
  },
}));

import { ReceiptsPage } from "../ReceiptsPage";

afterEach(() => {
  cleanup();
  modalProps.last = null;
});

describe("U5 Receipts — the receipt creator IS the expense creator", () => {
  it("New receipt opens the expense creator with the file filed as a receipt", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <ReceiptsPage />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(screen.queryByTestId("expense-creator")).toBeNull();
    fireEvent.click(screen.getByTestId("receipts-new"));
    expect(await screen.findByTestId("expense-creator")).toHaveTextContent("New receipt");
    expect(modalProps.last).toMatchObject({ open: true, operatingCompanyId: "co-1", attachmentCategory: "receipt" });
  });
});
