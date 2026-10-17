import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// LEAD 443.181 (owner law: no capability lost) — fail-old: on main ParityTable had CSV export only
// and a localStorage-only view, so moving the Chart of Accounts off ListView lost its Excel export
// and its server-saved (every-device) view.
const apiRequest = vi.fn();
vi.mock("../../api/client", () => ({ apiRequest: (...args: unknown[]) => apiRequest(...args) }));

import { ParityTable, type ParityColumn } from "./ParityTable";

type Row = { id: string; name: string; number: string };
const columns: Array<ParityColumn<Row>> = [
  { key: "name", label: "Name", testId: "name" },
  { key: "number", label: "Number", testId: "number" },
];
const rows: Row[] = [{ id: "1", name: "Cash", number: "1000" }];

afterEach(() => apiRequest.mockReset());

describe("ParityTable Excel export + server-saved view", () => {
  it("offers Excel beside CSV when exportExcel is set", () => {
    render(<ParityTable<Row> columns={columns} rows={rows} rowKey={(r) => r.id} exportFilename="coa" exportExcel />);
    expect(screen.getByTestId("parity-table-export")).toBeTruthy();
    expect(screen.getByTestId("parity-table-export-xlsx")).toBeTruthy();
  });

  it("CSV only unless asked", () => {
    render(<ParityTable<Row> columns={columns} rows={rows} rowKey={(r) => r.id} exportFilename="coa" />);
    expect(screen.queryByTestId("parity-table-export-xlsx")).toBeNull();
  });

  it("loads the server-saved view by its key and applies it (hidden column)", async () => {
    apiRequest.mockResolvedValue({ saved_view: { visibleColumns: { name: true, number: false } } });
    render(<ParityTable<Row> columns={columns} rows={rows} rowKey={(r) => r.id} serverViewKey="coa-list-v2" />);
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/users/me/table-preferences?table_id=listview%3Acoa-list-v2");
    await waitFor(() => expect(document.querySelector('thead th[data-testid="number"]')).toBeNull());
    expect(document.querySelector('thead th[data-testid="name"]')).toBeTruthy();
  });

  it("no server call without serverViewKey", () => {
    render(<ParityTable<Row> columns={columns} rows={rows} rowKey={(r) => r.id} />);
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
