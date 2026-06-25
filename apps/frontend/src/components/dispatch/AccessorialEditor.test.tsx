// @vitest-environment jsdom
import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// W2 — assert the wizard actually queries the additional-charges catalog (GUARD network-captured
// ZERO requests live). Mock the client so the test can prove the request fires + is company-scoped.
vi.mock("../../api/catalogs-dispatch", () => ({
  additionalChargesCatalogClient: {
    list: vi.fn(async () => ({
      rows: [
        { id: "1", code: "FSC", display_name: "Fuel Surcharge", description: "Fuel surcharge", is_active: true, sort_order: 10 },
        { id: "2", code: "DETENTION", display_name: "Detention", description: "Detention", is_active: true, sort_order: 20 },
      ],
      total: 2,
    })),
  },
}));

import { additionalChargesCatalogClient } from "../../api/catalogs-dispatch";
import { AccessorialEditor } from "./AccessorialEditor";
import {
  buildBookLoadChargeLines,
  computeBookLoadSectionTotalCents,
  computeDetentionAccrualCents,
  seedAccessorialRow,
  sumAccessorialCents,
} from "./accessorial-editor-lib";

afterEach(() => cleanup());
beforeEach(() => vi.clearAllMocks());

describe("accessorial-editor-lib (B21-D3)", () => {
  it("sums accessorial row cents", () => {
    const rows = [
      seedAccessorialRow("detention", { amount_cents: 5000 }),
      seedAccessorialRow("lumper", { amount_cents: 2500 }),
    ];
    expect(sumAccessorialCents(rows)).toBe(7500);
  });

  it("rolls section total with linehaul and fuel", () => {
    const rows = [seedAccessorialRow("layover", { amount_cents: 1000 })];
    expect(computeBookLoadSectionTotalCents(10000, 2000, rows)).toBe(13000);
  });

  it("builds charge lines for book load payload", () => {
    const lines = buildBookLoadChargeLines({
      linehaul_cents: 50000,
      fuel_surcharge_cents: 5000,
      accessorial_rows: [seedAccessorialRow("detention", { amount_cents: 3000 })],
    });
    expect(lines).toEqual([
      { code: "linehaul", amount_cents: 50000 },
      { code: "fuel_surcharge", amount_cents: 5000 },
      { code: "detention", amount_cents: 3000 },
    ]);
  });

  it("computes detention accrual from hours and rate", () => {
    expect(computeDetentionAccrualCents(2, 5000)).toBe(10000);
    expect(computeDetentionAccrualCents(0, 5000)).toBe(0);
  });
});

function renderEditor(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("AccessorialEditor (B21-D3)", () => {
  it("+ Create charge adds an editable row", () => {
    const onRowsChange = vi.fn();
    renderEditor(
      <AccessorialEditor operatingCompanyId="00000000-0000-4000-8000-000000000001" rows={[]} onRowsChange={onRowsChange} />
    );
    fireEvent.click(screen.getByRole("button", { name: /\+ Create charge/i }));
    expect(onRowsChange).toHaveBeenCalledTimes(1);
    const next = onRowsChange.mock.calls[0][0] as { code: string }[];
    expect(next).toHaveLength(1);
    expect(next[0].code).toBe("");
  });

  it("detention seed invokes detention hook", () => {
    const onDetentionSeed = vi.fn();
    const onRowsChange = vi.fn();
    renderEditor(
      <AccessorialEditor
        operatingCompanyId="00000000-0000-4000-8000-000000000001"
        rows={[]}
        onRowsChange={onRowsChange}
        onDetentionSeed={onDetentionSeed}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /^detention$/i }));
    expect(onRowsChange).toHaveBeenCalled();
    expect(onDetentionSeed).toHaveBeenCalledWith({ detention_expected_y_n: true });
    const next = onRowsChange.mock.calls[0][0] as { code: string }[];
    expect(next[0].code).toBe("DETENTION");
  });
});

describe("AccessorialEditor — W2 catalog wiring (GUARD: 0 calls live)", () => {
  it("fires the additional-charges catalog request on mount, scoped by the active company", async () => {
    renderEditor(
      <AccessorialEditor operatingCompanyId="00000000-0000-4000-8000-000000000002" rows={[]} onRowsChange={vi.fn()} />
    );
    await waitFor(() => expect(additionalChargesCatalogClient.list).toHaveBeenCalled());
    const firstArg = (additionalChargesCatalogClient.list as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0];
    expect(firstArg).toMatchObject({ operating_company_id: "00000000-0000-4000-8000-000000000002", is_active: "true" });
  });

  it("does NOT query the catalog when no company is selected (guards the disabled state)", () => {
    renderEditor(<AccessorialEditor operatingCompanyId="" rows={[]} onRowsChange={vi.fn()} />);
    expect(additionalChargesCatalogClient.list).not.toHaveBeenCalled();
  });

  it("amount header reads dollars ($), not cents (¢)", () => {
    renderEditor(
      <AccessorialEditor
        operatingCompanyId="00000000-0000-4000-8000-000000000001"
        rows={[seedAccessorialRow("lumper", { amount_cents: 100 })]}
        onRowsChange={vi.fn()}
      />
    );
    expect(screen.getByText("Amount ($)")).toBeTruthy();
    expect(screen.queryByText("Amount (¢)")).toBeNull();
  });
});
