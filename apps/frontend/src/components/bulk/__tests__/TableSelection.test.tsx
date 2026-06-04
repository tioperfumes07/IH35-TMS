import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { TableSelection, TableSelectionHeader } from "../TableSelection";

type Row = { id: string; label: string };

function DemoTable({ rows, cap }: { rows: Row[]; cap?: number }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const pageRowIds = rows.map((row) => row.id);
  const onCap = vi.fn();

  return (
    <TableSelection
      rows={rows}
      getId={(row) => row.id}
      selectedIds={selectedIds}
      onSelectionChange={setSelectedIds}
      pageRowIds={pageRowIds}
      cap={cap}
      onCapExceeded={onCap}
    >
      {(ctx) => (
        <table>
          <thead>
            <tr>
              <th>
                <TableSelectionHeader
                  selectedIds={selectedIds}
                  pageRowIds={pageRowIds}
                  onSelectionChange={setSelectedIds}
                  cap={cap}
                  onCapExceeded={onCap}
                />
              </th>
              <th>Label</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Select ${row.label}`}
                    checked={ctx.isSelected(row.id)}
                    onChange={() => ctx.toggle(row.id)}
                  />
                </td>
                <td>{row.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </TableSelection>
  );
}

describe("TableSelection", () => {
  const rows: Row[] = [
    { id: "1", label: "One" },
    { id: "2", label: "Two" },
    { id: "3", label: "Three" },
  ];

  it("select-all checks every visible row", () => {
    render(<DemoTable rows={rows} />);
    fireEvent.click(screen.getByLabelText("Select all rows on this page"));
    const rowChecks = screen.getAllByRole("checkbox").slice(1);
    for (const checkbox of rowChecks) {
      expect((checkbox as HTMLInputElement).checked).toBe(true);
    }
  });

  it("blocks selection above cap", () => {
    render(<DemoTable rows={rows} cap={2} />);
    fireEvent.click(screen.getByLabelText("Select all rows on this page"));
    const checked = screen.getAllByRole("checkbox").filter((el) => (el as HTMLInputElement).checked);
    expect(checked.length).toBeLessThanOrEqual(2);
  });
});
