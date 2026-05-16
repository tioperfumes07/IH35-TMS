import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as qboMdata from "../../api/qbo-mdata";
import { QboCombobox } from "./QboCombobox";

vi.mock("../../api/qbo-mdata", () => ({
  searchQboMasterData: vi.fn(),
}));

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe("QboCombobox", () => {
  beforeEach(() => {
    vi.mocked(qboMdata.searchQboMasterData).mockResolvedValue({ results: [] });
  });

  it("keeps hint visible until minimum search length", async () => {
    const user = userEvent.setup({ delay: null });
    const onChange = vi.fn();
    render(
      wrap(
        <QboCombobox
          entityType="vendor"
          value={null}
          displayValue=""
          onChange={onChange}
          operatingCompanyId="00000000-0000-4000-8000-000000000001"
        />
      )
    );

    await user.click(screen.getByPlaceholderText(/Type to search QuickBooks/));
    expect(screen.getByText(/Keep typing to search/)).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/Type to search QuickBooks/), "a");
    expect(screen.getByText(/Keep typing to search/)).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/Type to search QuickBooks/), "b");
    await waitFor(() => {
      expect(screen.queryByText(/Keep typing to search/)).not.toBeInTheDocument();
    });
  });
});
