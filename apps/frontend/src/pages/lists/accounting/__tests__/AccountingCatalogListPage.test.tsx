import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AccountingCatalogRow } from "../../../../api/catalogs-accounting";
import { AccountingCatalogListPage } from "../AccountingCatalogListPage";

vi.mock("../../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "11111111-1111-4111-8111-111111111111" }),
}));

const row: AccountingCatalogRow = {
  id: "row-1",
  code: "FUEL",
  display_name: "Fuel",
  description: "Diesel and fuel-card purchases",
  metadata: {
    account_type: "Expense",
    reimbursable: false,
    thresholds: { warning: 250 },
  },
  is_active: true,
  sort_order: 5,
  created_at: "2026-07-01T12:00:00.000Z",
  updated_at: "2026-07-02T13:30:00.000Z",
};

function makeClient(catalogRow: AccountingCatalogRow = row) {
  return {
    list: vi.fn().mockResolvedValue({ rows: [catalogRow], total: 1 }),
    create: vi.fn().mockResolvedValue({ id: "new-1" }),
    update: vi.fn().mockResolvedValue({ id: catalogRow.id }),
    deactivate: vi.fn().mockResolvedValue({ ok: true as const }),
  };
}

function renderPage({
  readOnly = false,
  catalogRow = row,
}: {
  readOnly?: boolean;
  catalogRow?: AccountingCatalogRow;
} = {}) {
  const client = makeClient(catalogRow);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AccountingCatalogListPage
          client={client}
          displayName="Expense Categories"
          breadcrumbPath="Lists · Accounting · Expense Categories"
          readOnly={readOnly}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

async function openProfile() {
  await waitFor(() => expect(screen.getByText("Fuel")).toBeInTheDocument());
  fireEvent.click(screen.getByText("Fuel"));
  return screen.getByRole("dialog", { name: "Expense Categories profile" });
}

describe("AccountingCatalogListPage catalog profiles", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens a read-only profile from a row instead of the edit modal", async () => {
    const client = renderPage();
    const profile = await openProfile();

    expect(within(profile).getByText("Diesel and fuel-card purchases")).toBeInTheDocument();
    expect(screen.queryByTestId("catalog-code-input")).not.toBeInTheDocument();
    expect(client.update).not.toHaveBeenCalled();
  });

  it("moves from a writable profile to the existing edit modal only through Edit", async () => {
    renderPage();
    const profile = await openProfile();
    fireEvent.click(within(profile).getByRole("button", { name: "Edit" }));

    expect(screen.queryByRole("dialog", { name: "Expense Categories profile" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Edit Expense Categories" })).toBeInTheDocument();
    expect(screen.getByTestId("catalog-code-input")).toHaveValue("FUEL");
  });

  it("keeps read-only catalogs profile-only with no Edit or Create action", async () => {
    renderPage({ readOnly: true });
    const profile = await openProfile();

    expect(within(profile).queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Create" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("catalog-code-input")).not.toBeInTheDocument();
  });

  it("keeps + Create wired to the existing creator for writable catalogs", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Fuel")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "+ Create" }));

    expect(screen.getByRole("heading", { name: "New Expense Categories" })).toBeInTheDocument();
    expect(screen.getByTestId("catalog-code-input")).toHaveValue("");
  });

  it("renders profile metadata and malformed optional fields safely", async () => {
    renderPage({
      catalogRow: {
        ...row,
        description: null,
        created_at: "not-a-date",
        metadata: { nested_value: { enabled: true }, empty_value: null },
      },
    });
    const profile = await openProfile();

    expect(within(profile).getByText("Nested Value")).toBeInTheDocument();
    expect(within(profile).getByText('{"enabled":true}')).toBeInTheDocument();
    expect(within(profile).getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });
});
