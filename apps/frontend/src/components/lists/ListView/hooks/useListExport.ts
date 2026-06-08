import { useCallback } from "react";
import type { ListViewColumn } from "../types";

function toCsvRow(values: string[]): string {
  return values
    .map((v) => {
      const s = v.replace(/"/g, '""');
      return /[",\n\r]/.test(s) ? `"${s}"` : s;
    })
    .join(",");
}

function getCellText<T>(row: T, col: ListViewColumn<T>): string {
  return String((row as Record<string, unknown>)[col.id] ?? "");
}

export interface ExportHookResult {
  exportCsv: <T>(rows: T[], cols: ListViewColumn<T>[], filename?: string) => void;
  exportXlsx: <T>(rows: T[], cols: ListViewColumn<T>[], filename?: string) => Promise<void>;
}

export function useListExport(): ExportHookResult {
  const exportCsv = useCallback(
    <T>(rows: T[], cols: ListViewColumn<T>[], filename = "export.csv") => {
      const header = toCsvRow(cols.map((c) => c.label));
      const body = rows.map((row) =>
        toCsvRow(cols.map((col) => getCellText(row, col)))
      );
      const csv = [header, ...body].join("\r\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    },
    []
  );

  // exceljs ^4.4.0 (MIT, actively maintained — replaces xlsx which has CVE-2023-30533)
  const exportXlsx = useCallback(
    async <T>(rows: T[], cols: ListViewColumn<T>[], filename = "export.xlsx") => {
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Export");
      sheet.addRow(cols.map((c) => c.label));
      for (const row of rows) {
        sheet.addRow(cols.map((col) => getCellText(row, col)));
      }
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    },
    []
  );

  return { exportCsv, exportXlsx };
}
