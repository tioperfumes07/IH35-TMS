import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../../api/client";
import { ToastProvider } from "../../../../components/Toast";
import { QBOBulkLinkPage } from "../QBOBulkLinkPage";

// TRANSP: the only company the QBO archive review renders for.
vi.mock("../../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({
    selectedCompanyId: "11111111-1111-4111-8111-111111111111",
    selectedCompany: { id: "11111111-1111-4111-8111-111111111111", code: "TRANSP" },
  }),
}));

vi.mock("../../../../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../api/client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const UNLINKED = {
  entities: [
    {
      entity_kind: "driver",
      id: "d-1",
      name: "Driver One",
      suggested_qbo_vendor_id: "QBO-V-77",
      suggested_qbo_class_id: "QBO-C-12",
      match_confidence: 0.9,
    },
    {
      entity_kind: "unit",
      id: "u-1",
      name: "Unit 501",
      suggested_qbo_vendor_id: null,
      suggested_qbo_class_id: null,
      match_confidence: 0,
    },
  ],
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter>
          <QBOBulkLinkPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("QBOBulkLinkPage — read-only QBO archive review (443.137 9e)", () => {
  beforeEach(() => {
    vi.mocked(clientApi.apiRequest).mockReset();
    vi.mocked(clientApi.apiRequest).mockResolvedValue(UNLINKED);
  });

  it("shows the archive's suggestions with no QBO picker, no accept checkbox and no write action", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Continue — load unlinked/ }));

    const table = await screen.findByTestId("qbo-bulk-link-table");
    expect(await within(table).findByText("Driver One")).toBeInTheDocument();
    // The suggestion is displayed, read-only.
    expect(within(table).getByText("QBO-V-77")).toBeInTheDocument();
    expect(within(table).getByText("QBO-C-12")).toBeInTheDocument();

    // No QBO-mirror search box and no accept checkbox in any row.
    expect(within(table).queryByPlaceholderText(/search QuickBooks/i)).not.toBeInTheDocument();
    // (ParityTable's own toolbar may carry a search box; the rows themselves carry no control at all.)
    expect(table.querySelectorAll("tbody input")).toHaveLength(0);
    expect(table.querySelectorAll('[aria-autocomplete="list"]')).toHaveLength(0);

    // No path to a write: no confirm step, no apply button, no accept toggle.
    expect(screen.queryByRole("button", { name: /Continue — confirm/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Apply bulk link/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Toggle all accept/ })).not.toBeInTheDocument();
    expect(screen.getByTestId("qbo-bulk-link-read-only")).toHaveTextContent(/read-only archive/i);

    // The only request the page makes is the GET review; it never POSTs a bulk link.
    for (const call of vi.mocked(clientApi.apiRequest).mock.calls) {
      expect(String(call[0])).not.toContain("/api/v1/qbo/bulk-link");
      expect((call[1] as { method?: string } | undefined)?.method ?? "GET").toBe("GET");
    }
  });
});
