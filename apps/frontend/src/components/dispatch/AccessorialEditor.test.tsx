// @vitest-environment jsdom
import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccessorialEditor } from "./AccessorialEditor";
import {
  buildBookLoadChargeLines,
  computeBookLoadSectionTotalCents,
  computeDetentionAccrualCents,
  seedAccessorialRow,
  sumAccessorialCents,
} from "./accessorial-editor-lib";

afterEach(() => cleanup());

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
