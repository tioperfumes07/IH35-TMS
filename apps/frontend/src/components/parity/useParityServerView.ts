import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "../../api/client";

/**
 * LEAD 443.181 (owner law: no capability lost) — ParityTable's optional SERVER-saved view.
 *
 * A table that passes `serverViewKey` stores its gear state (column order / visibility / widths /
 * page size / density) in the user's preferences on the server, so the view follows the user to
 * every device. localStorage (`storageKey`) still serves the first paint; the server copy wins once
 * it arrives. The table id keeps the retired ListView's `listview:<key>` shape so the same key
 * addresses the same saved view.
 *
 * RESIZABLE-TABLE-COLUMN-WIDTHS-FETCH-LOOP: the fetch effect depends on the table id ONLY — never on
 * a value the caller rebuilds per render.
 */
export type ParityServerView = {
  columnOrder?: string[];
  columnWidths?: Record<string, number>;
  visibleColumns?: Record<string, boolean>;
  pageSize?: number;
  density?: "regular" | "compact" | "ultra";
};

const DEBOUNCE_MS = 600;

export function parityServerViewTableId(serverViewKey: string | undefined): string | null {
  return serverViewKey ? `listview:${serverViewKey}` : null;
}

export function useParityServerView(serverViewKey: string | undefined) {
  const tableId = parityServerViewTableId(serverViewKey);
  const [view, setView] = useState<ParityServerView | null>(null);
  const [persistError, setPersistError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDraftRef = useRef<ParityServerView | null>(null);

  useEffect(() => {
    if (!tableId) return;
    let cancelled = false;
    void (async () => {
      try {
        const resp = await apiRequest<{ saved_view?: ParityServerView | null }>(
          `/api/v1/users/me/table-preferences?table_id=${encodeURIComponent(tableId)}`
        );
        if (!cancelled && resp.saved_view) setView(resp.saved_view);
      } catch {
        // Offline / unauthenticated — the local view stands.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tableId]);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    []
  );

  const send = useCallback(
    async (data: ParityServerView) => {
      if (!tableId) return;
      try {
        await apiRequest("/api/v1/users/me/table-preferences", {
          method: "PATCH",
          body: { table_id: tableId, saved_view: data },
        });
        setPersistError(null);
      } catch {
        setPersistError("Table settings could not be saved. Your current view is temporary.");
      }
    },
    [tableId]
  );

  const persist = useCallback(
    (data: ParityServerView) => {
      if (!tableId) return;
      lastDraftRef.current = data;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void send(data);
      }, DEBOUNCE_MS);
    },
    [send, tableId]
  );

  const retryPersist = useCallback(() => {
    if (lastDraftRef.current) void send(lastDraftRef.current);
  }, [send]);

  return { enabled: tableId != null, view, persist, persistError, retryPersist };
}

/** Pure: an Excel workbook (first sheet) from a header row and body rows of plain cell values. */
export async function downloadXlsx(filename: string, header: string[], body: Array<Array<string | number>>) {
  // exceljs ^4.4.0 (MIT) — the same library the retired ListView export used (replaces xlsx, CVE-2023-30533).
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Export");
  sheet.addRow(header);
  for (const row of body) sheet.addRow(row);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
