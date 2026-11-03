// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ParityTable, cellClassFromHeaderClass, type ParityColumn } from "./ParityTable";

// Row 247 (live 11-03): Banking passed its header typography as the column className with no cellClass, and the
// body cell fell back to it — "Suggested: Loves Truck Care (5500)…" rendered ALL CAPS via text-transform:uppercase.
type Row = { id: string; description: string };
const HEADER = "text-section-header font-semibold normal-case uppercase tracking-wide";

describe("ParityTable — header-only typography never reaches a data cell (row 247)", () => {
  afterEach(() => cleanup());

  it("strips uppercase / tracking / section-header tokens, keeps alignment", () => {
    expect(cellClassFromHeaderClass(`${HEADER} text-right`)).toBe("font-semibold text-right");
    expect(cellClassFromHeaderClass(undefined)).toBe("");
  });

  it("a column with only a header className renders its data cell without uppercase", () => {
    const columns: Array<ParityColumn<Row>> = [
      { key: "description", label: "Full bank description", className: HEADER, render: (r) => <span data-testid="desc">{r.description}</span> },
    ];
    render(<ParityTable<Row> columns={columns} rows={[{ id: "1", description: "Suggested: Loves Truck Care (5500)" }]} rowKey={(r) => r.id} />);
    const td = screen.getByTestId("desc").closest("td");
    expect(td).not.toBeNull();
    const cls = (td as HTMLElement).className.split(/\s+/);
    expect(cls).not.toContain("uppercase");
    expect(cls.some((c) => c.startsWith("tracking-"))).toBe(false);
  });
});
