import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReceiptsPage } from "../ReceiptsPage";
import { useQuery } from "@tanstack/react-query";

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  Link: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  useSearchParams: () => [new URLSearchParams()],
}));

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "company-1" }),
}));

vi.mock("../AccountingSubNavWrapper", () => ({
  AccountingSubNavWrapper: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("../../../components/parity/ParityTable", () => ({
  ParityTable: () => <div data-testid="parity-table" />,
}));

vi.mock("../../../api/receipts", () => ({
  getReceipts: vi.fn(),
  getReceiptDetail: vi.fn(),
}));

type QueryResult = {
  data?: unknown;
  isError?: boolean;
  isPending?: boolean;
  isFetching?: boolean;
  isLoading?: boolean;
  refetch: ReturnType<typeof vi.fn>;
};

function okList(): QueryResult {
  return {
    data: { total: 0, items: [] },
    isError: false,
    isPending: false,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
  };
}

describe("ReceiptsPage query error UX", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReset();
  });

  it("shows ListErrorBanner with retry and hides ParityTable on listQuery.isError", () => {
    const refetch = vi.fn();
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isError: true,
      isPending: false,
      isFetching: false,
      isLoading: false,
      refetch,
    } as never);

    render(<ReceiptsPage />);

    expect(screen.getByText("Failed to load receipts.")).toBeInTheDocument();
    expect(screen.queryByTestId("parity-table")).not.toBeInTheDocument();
    expect(screen.queryByText("No receipts found.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("renders ParityTable when listQuery succeeds", () => {
    vi.mocked(useQuery).mockReturnValue(okList() as never);
    render(<ReceiptsPage />);
    expect(screen.queryByText("Failed to load receipts.")).not.toBeInTheDocument();
    expect(screen.getByTestId("parity-table")).toBeInTheDocument();
  });
});
