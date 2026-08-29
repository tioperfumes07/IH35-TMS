import { useCallback, useState } from "react";

/**
 * GO-0032-CASH-FLOW-STATEMENT-EXPORT-SILENT-DEAD-CLICK — shared "export report to PDF/XLSX"
 * action state. A bare `onClick={() => exportXReport(...)}` never awaits or catches the
 * rejection `downloadBinaryExport()` throws on any non-2xx response (a role-gated 403, a rate
 * limit, a genuine 500) — the click becomes a silent dead control with zero operator feedback,
 * a bare unhandled promise rejection nothing in this app surfaces. This is the same defect
 * class already fixed once per-file for FLEET-F6114 / COMP-F6342; this hook is the shared,
 * reusable form so every export button in the app uses the identical awaited+caught pattern
 * instead of re-inventing local pending/error state each time.
 */
export function useExportAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (action: () => Promise<unknown>, fallbackMessage: string) => {
    setError(null);
    setPending(true);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : fallbackMessage);
    } finally {
      setPending(false);
    }
  }, []);

  return { pending, error, run };
}
