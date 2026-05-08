import type { RunnerColumn } from "./runner-config";

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatForCsv(value: unknown, column: RunnerColumn): string {
  if (value == null) return "";
  if (column.format === "currency") return (Number(value) / 100).toFixed(2);
  if (column.format === "percent") return String(Number(value) / 100);
  if (column.format === "date") {
    const d = new Date(String(value));
    return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
  }
  return String(value);
}

export function downloadCSV(filename: string, columns: RunnerColumn[], rows: Record<string, unknown>[]): void {
  const header = columns.map((column) => csvEscape(column.label)).join(",");
  const body = rows.map((row) => columns.map((column) => csvEscape(formatForCsv(row[column.key], column))).join(",")).join("\n");
  const csv = `${header}\n${body}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
