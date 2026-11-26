/**
 * PERFUME-MAIL-XLS — owner 2026-11-26: "I want the daily engine list update working and gathering from all mails".
 * PCA and MOD mail only old binary .xls files. The server never parses .xls (no SheetJS in the backend — #2686,
 * scripts/verify-xlsx-upload-magic-bytes.mjs), so the engine holds them. Whenever the desk is open (desktop or phone),
 * this reads each held .xls in the browser with the desk's own reader and hands the cells back; the engine then runs the
 * same column choice, half-size and to-the-cent checks as for any mailed list. Each file is tried once per page load.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchPerfumeMailFileBytes, getPerfumeMail, sendPerfumeMailXlsCells, type PerfumeMailFile } from "../../api/perfume";
import { readSpreadsheet } from "./perfumeFileReaders";

type Cell = string | number | null;
const MAX_COLS = 200;
const MAX_TEXT = 2000;

/** Cells as the server accepts them: text, finite number or empty; at most 200 columns, text cut at 2,000 characters. */
export function cellsForServer(cells: unknown[][]): Cell[][] {
  return cells.map((r) => r.slice(0, MAX_COLS).map((v): Cell => {
    if (v == null || v === "") return null;
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return String(v).slice(0, MAX_TEXT);
  }));
}

/** A held file this browser should read: an old .xls the engine held for its format, with a vendor known. */
export function isHeldOldXls(f: Pick<PerfumeMailFile, "status" | "file_name" | "reason" | "vendor_id">): boolean {
  return f.status === "held" && !!f.vendor_id && /\.xls$/i.test(f.file_name) && /old excel/i.test(f.reason ?? "");
}

export type HeldXlsProgress = { total: number; done: number; imported: number; held: number; failed: number; running: boolean };

export async function readHeldXlsFile(f: PerfumeMailFile) {
  const blob = await fetchPerfumeMailFileBytes(f.id);
  const read = await readSpreadsheet(new File([blob], f.file_name));
  return sendPerfumeMailXlsCells(f.id, read.sheets.map((s) => ({ name: s.name.slice(0, 200), cells: cellsForServer(s.cells) })));
}

export function usePerfumeHeldXls(enabled: boolean): HeldXlsProgress | null {
  const qc = useQueryClient();
  const mail = useQuery({ queryKey: ["perfume", "mail"], queryFn: getPerfumeMail, enabled, staleTime: 60_000 });
  const tried = useRef(new Set<string>());
  const busy = useRef(false);
  const [progress, setProgress] = useState<HeldXlsProgress | null>(null);
  useEffect(() => {
    if (!enabled || busy.current) return;
    const todo = (mail.data?.files ?? []).filter((f) => isHeldOldXls(f) && !tried.current.has(f.id));
    if (!todo.length) return;
    for (const f of todo) tried.current.add(f.id);
    busy.current = true;
    void (async () => {
      const p: HeldXlsProgress = { total: todo.length, done: 0, imported: 0, held: 0, failed: 0, running: true };
      setProgress({ ...p });
      // One at a time: each file is a mailbox fetch + a save inside the owner's transaction.
      for (const f of todo) {
        try {
          const r = await readHeldXlsFile(f);
          if (r.status === "imported") p.imported++; else p.held++;
        } catch { p.failed++; }
        p.done++;
        setProgress({ ...p });
      }
      p.running = false;
      setProgress({ ...p });
      busy.current = false;
      await qc.invalidateQueries({ queryKey: ["perfume"] });
    })();
  }, [enabled, mail.data, qc]);
  return progress;
}
