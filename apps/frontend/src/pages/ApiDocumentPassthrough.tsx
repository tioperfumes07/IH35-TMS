import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { resolveApiUrl } from "../api/client";

/**
 * COMPLICATED-PRINT-F09 — auditors open `/api/v1/...html` on the SPA origin.
 * The catch-all `Navigate to="/"` turned invoice/bill letters and WO PDFs into Home.
 * Send those paths to the API host instead.
 */
export function ApiDocumentPassthrough() {
  const loc = useLocation();
  useEffect(() => {
    window.location.replace(resolveApiUrl(`${loc.pathname}${loc.search}`));
  }, [loc.pathname, loc.search]);
  return <p className="p-4 text-sm text-slate-600">Opening document…</p>;
}
