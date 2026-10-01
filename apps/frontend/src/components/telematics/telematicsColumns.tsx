/** Shared column helpers for the telematics reverse-link panels (no component exports — fast refresh). */
import type { ReactNode } from "react";
import { formatDateTimeUS } from "../../lib/formatDate";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
import type { ParityColumn } from "../parity/ParityTable";

export type Row = Record<string, unknown> & { id?: string };

export const txt = (v: unknown) => (v == null || v === "" ? "—" : String(v));
export const when = (v: unknown) => (v ? `${formatDateTimeUS(String(v))} CT` : "—");
export const num = (digits: number) => (v: unknown) => (v == null || !Number.isFinite(Number(v)) ? "—" : Number(v).toFixed(digits));
export const yes = (v: unknown) => (v == null ? "—" : v ? "Yes" : "No");

export function col(key: string, label: string, fmt: (v: unknown) => ReactNode = txt): ParityColumn<Row> {
  return { key, label, sortable: true, render: (row) => fmt(row[key]), sortValue: (row) => (row[key] as string | number | null) ?? "" } as ParityColumn<Row>;
}
export function link(kind: "load" | "unit" | "driver", idKey: string, nameKey: string, label: string, noun: string): ParityColumn<Row> {
  return {
    key: nameKey,
    label,
    sortable: true,
    sortValue: (row) => String(row[nameKey] ?? ""),
    render: (row) => <EntityLinkOrTombstone kind={kind} id={row[idKey] as string | null} name={row[nameKey]} noun={noun} />,
  } as ParityColumn<Row>;
}
export const LOAD = link("load", "load_id", "load_number", "Load", "Load");
export const UNIT = link("unit", "unit_id", "unit_number", "Unit", "Unit");
export const DRIVER = link("driver", "driver_id", "driver_label", "Driver", "Driver");

export type Section = { key: string; title: string; note: string; columns: ParityColumn<Row>[]; empty: string };

