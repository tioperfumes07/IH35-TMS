import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useTableController } from "./useTableController";
import type { TableColumn } from "./ColumnChooser";

type Row = { id: string; name: string; n: number };
const rows: Row[] = [
  { id: "a", name: "Charlie", n: 3 },
  { id: "b", name: "alice", n: 1 },
  { id: "c", name: "Bob", n: 2 },
];
const columns: TableColumn[] = [
  { key: "name", label: "Name" },
  { key: "n", label: "N" },
];
const searchText = (r: Row) => `${r.name}`;
const sortValue = (r: Row, key: string) => (key === "n" ? r.n : r.name);

describe("useTableController", () => {
  it("CLIENT-SIDE: sorts the loaded rows when sortValue is provided (asc -> desc -> off)", () => {
    const { result } = renderHook(() =>
      useTableController<Row>({ rows, columns, tableKey: "t-client", searchText, sortValue })
    );
    // default: unsorted (original order)
    expect(result.current.paged.map((r) => r.id)).toEqual(["a", "b", "c"]);
    act(() => result.current.toggleSort("name")); // asc — numeric/base, case-insensitive: alice, Bob, Charlie
    expect(result.current.paged.map((r) => r.name)).toEqual(["alice", "Bob", "Charlie"]);
    act(() => result.current.toggleSort("name")); // desc
    expect(result.current.paged.map((r) => r.name)).toEqual(["Charlie", "Bob", "alice"]);
    act(() => result.current.toggleSort("name")); // off
    expect(result.current.paged.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("SERVER-SIDE: fires onSortChange with the new key/dir each click and does NOT sort in-memory", () => {
    const onSortChange = vi.fn();
    // server-side consumer omits sortValue (server returns pre-sorted rows) but wants the sort UX + callback
    const { result } = renderHook(() =>
      useTableController<Row>({ rows, columns, tableKey: "t-server", searchText, onSortChange })
    );
    act(() => result.current.toggleSort("n"));
    expect(onSortChange).toHaveBeenLastCalledWith("n", "asc");
    act(() => result.current.toggleSort("n"));
    expect(onSortChange).toHaveBeenLastCalledWith("n", "desc");
    act(() => result.current.toggleSort("n"));
    expect(onSortChange).toHaveBeenLastCalledWith(null, "asc");
    // rows are returned in the server's order (no in-memory re-sort without sortValue)
    expect(result.current.paged.map((r) => r.id)).toEqual(["a", "b", "c"]);
    // header state still tracked for aria-sort/chevron
    expect(result.current.sortKey).toBeNull();
  });
});
