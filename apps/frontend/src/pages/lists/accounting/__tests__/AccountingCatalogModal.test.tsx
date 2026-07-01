import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { AccountingCatalogModal } from "../AccountingCatalogModal";
import type { AccountingCatalogRow } from "../../../../api/catalogs-accounting";

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function makeClient() {
  return {
    create: vi.fn().mockResolvedValue({ id: "new-1" }),
    update: vi.fn().mockResolvedValue({ id: "row-1" }),
    deactivate: vi.fn().mockResolvedValue({ ok: true as const }),
  };
}

const baseRow = {
  id: "row-1",
  code: "FUEL",
  display_name: "Fuel",
  description: "Diesel",
  metadata: {},
  is_active: true,
  sort_order: 5,
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
} as AccountingCatalogRow;

const OPCO = "11111111-1111-4111-8111-111111111111";

describe("AccountingCatalogModal — shared creator upgrades (Block 2)", () => {
  it("disables submit until code + name valid, then Create posts code/name/active + next sort order", async () => {
    const client = makeClient();
    renderWithClient(
      <AccountingCatalogModal
        open
        operatingCompanyId={OPCO}
        displayName="Expense Categories"
        client={client}
        mode="create"
        row={null}
        nextSortOrder={7}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    const submit = screen.getByTestId("catalog-submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(true); // disabled-until-valid

    fireEvent.change(screen.getByTestId("catalog-code-input"), { target: { value: "fuel" } });
    fireEvent.change(screen.getByTestId("catalog-name-input"), { target: { value: "Fuel" } });
    expect(submit.disabled).toBe(false);

    fireEvent.click(submit);
    expect(client.create).toHaveBeenCalledWith(
      OPCO,
      expect.objectContaining({ code: "FUEL", display_name: "Fuel", is_active: true, sort_order: 7 }),
    );
  });

  it("makes Code immutable in edit mode (feature works, not string presence)", () => {
    const client = makeClient();
    renderWithClient(
      <AccountingCatalogModal
        open
        operatingCompanyId={OPCO}
        displayName="Expense Categories"
        client={client}
        mode="edit"
        row={baseRow}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect((screen.getByTestId("catalog-code-input") as HTMLInputElement).disabled).toBe(true);
  });

  it("Deactivate calls deactivate (void-not-delete), never a hard delete", () => {
    const client = makeClient();
    expect("delete" in client).toBe(false); // no delete method exists on the catalog client
    renderWithClient(
      <AccountingCatalogModal
        open
        operatingCompanyId={OPCO}
        displayName="Expense Categories"
        client={client}
        mode="edit"
        row={baseRow}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Deactivate"));
    expect(client.deactivate).toHaveBeenCalledWith("row-1", OPCO);
  });
});
