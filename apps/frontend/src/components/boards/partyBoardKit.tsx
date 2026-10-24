/**
 * ROUND 443.280 — shared pieces of the V3 Customers / Vendors home boards
 * (10-22-2026-LEAD-MOD-DESIGN-V3-Customers / -Vendors .dc.html). Colours and sizes come only from
 * design/v3-tokens; the table is the shared ParityTable (board appearance) so headers stay centred + sortable.
 */
import { useMemo, useState, type CSSProperties, type MutableRefObject, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";
import { V3, V3_TABLE } from "../../design/v3-tokens";
import { formatDateUS } from "../../lib/formatDate";
import { formatNumberTable, formatUsdCentsTable } from "../../lib/money";

export const usd = (cents: number | null | undefined) => formatUsdCentsTable(cents);
export const int = (n: number | null | undefined) => formatNumberTable(n);
export const day = (d: string | null) => (d ? formatDateUS(d) : "—");

export type PartyCol<R> = {
  key: string;
  label: string;
  num?: boolean;
  width?: number;
  /** false for a bar / graphic column that has no value to order by. */
  sortable?: boolean;
  sort: (r: R) => string | number;
  cell: (r: R) => ReactNode;
};

export function downloadCsv(filename: string, header: string[], rows: Array<Array<string | number>>) {
  const esc = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const blob = new Blob([[header, ...rows].map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

const button: CSSProperties = {
  height: 28, padding: "0 12px", display: "inline-flex", alignItems: "center", borderRadius: 2,
  fontSize: 12, fontWeight: 600, fontFamily: V3.font, cursor: "pointer",
};
export const outlineButton: CSSProperties = { ...button, background: V3.surface, color: V3.ink, border: `1px solid ${V3.border}` };
export const primaryButton: CSSProperties = { ...button, background: V3.shell, color: V3.onShell, border: `1px solid ${V3.shell}` };

export function PartyHomeHeader(props: { crumb: string; title: string; subtitle: string; createLabel: string; onBack: () => void; onCreate: () => void }) {
  return (
    <>
      <div style={{ fontSize: 11, color: V3.muted }}>{props.crumb}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 12, gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <button type="button" onClick={props.onBack} style={{ fontSize: 11, color: V3.muted, background: "transparent", border: "none", padding: 0, cursor: "pointer", fontFamily: V3.font }}>{"← Back"}</button>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: V3.ink }}>{props.title}</h1>
          <span style={{ fontSize: 11, color: V3.muted }}>{props.subtitle}</span>
        </div>
        <button type="button" style={primaryButton} onClick={props.onCreate}>{props.createLabel}</button>
      </div>
    </>
  );
}

/** The board's "Measured" bar — amber left rule; the sentence is always computed live by the caller. */
export function MeasuredNote({ children, testId }: { children: ReactNode; testId: string }) {
  return (
    <div data-testid={testId} style={{
      display: "flex", gap: 8, alignItems: "flex-start", background: V3.surface, border: `1px solid ${V3.border}`,
      borderLeft: `3px solid ${V3.amber}`, borderRadius: 2, padding: "8px 12px", fontSize: 12, color: V3.ink,
    }}>
      <b style={{ color: V3.amber, whiteSpace: "nowrap" }}>{"Measured"}</b>
      <span>{children}</span>
    </div>
  );
}

/** A figure that drills to the records behind it (filtered list / profile). */
export function NumLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link to={to} onClick={(e) => e.stopPropagation()} style={{ color: V3.ink, textDecoration: "none", fontVariantNumeric: "tabular-nums" }}>{children}</Link>;
}

export function Dot({ color }: { color: string }) {
  return <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />;
}

export function DotLabel({ color, children }: { color: string; children: ReactNode }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: V3_TABLE.fontPx, fontWeight: 500, color: V3.ink, whiteSpace: "nowrap" }}><Dot color={color} />{children}</span>;
}

/** Thin horizontal bar (track + fill), used by the vendors spend column and the category panel. */
export function SpendBar({ pct, width }: { pct: number; width: number | string }) {
  return (
    <div style={{ width, height: 6, background: V3.chartGrid, borderRadius: 3 }}>
      <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: 6, background: V3.data, borderRadius: 3 }} />
    </div>
  );
}

export function PartyTable<R extends { id: string }>(props: {
  storageKey: string; cols: Array<PartyCol<R>>; rows: R[]; exportName: string; exportRef: MutableRefObject<() => void>;
  testId: string; emptyText: string; renderFirst: (r: R) => ReactNode;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const sorted = useMemo(() => {
    if (!sort) return props.rows;
    const col = props.cols.find((c) => c.key === sort.key);
    if (!col) return props.rows;
    return [...props.rows].sort((a, b) => {
      const x = col.sort(a), y = col.sort(b);
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * sort.dir;
    });
  }, [props.rows, props.cols, sort]);
  props.exportRef.current = () =>
    downloadCsv(props.exportName, props.cols.filter((c) => c.sortable !== false).map((c) => c.label),
      sorted.map((r) => props.cols.filter((c) => c.sortable !== false).map((c) => { const v = c.sort(r); return typeof v === "number" && c.num ? v : String(v ?? ""); })));
  return (
    <ParityTable<R>
      appearance="board"
      storageKey={props.storageKey}
      tableTestId={props.testId}
      columns={props.cols.map((c, i): ParityColumn<R> => ({
        key: c.key,
        label: c.label,
        kind: c.num ? "number" : undefined,
        minWidth: c.width,
        sortable: c.sortable === false ? false : true,
        sortValue: c.sort,
        exportValue: c.sort,
        render: (r) => (i === 0 ? props.renderFirst(r) : c.cell(r)),
      }))}
      rows={sorted}
      rowKey={(r) => r.id}
      emptyText={props.emptyText}
      sortKey={sort?.key}
      sortDirection={sort ? (sort.dir === 1 ? "asc" : "desc") : undefined}
      onSortChange={(key, direction) => setSort({ key, dir: direction === "asc" ? 1 : -1 })}
      sortMode="external"
      suppressToolbarSearch
      suppressToolbarRange
      initialPageSize={100}
      pageSizeOptions={[100, 300]}
      allowAllPageSize
    />
  );
}
