import { useState } from "react";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { resolveApiUrl } from "../../api/client";

// SAF-F06 class: bare fetch(path) resolves against the SPA origin, which returns
// index.html with HTTP 200 — res.ok stays true and res.json() throws on HTML, so the
// call fails silently and renders as empty. resolveApiUrl() applies VITE_API_BASE_URL.
async function postItemsAction(path: string, operatingCompanyId: string) {
  const res = await fetch(resolveApiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operating_company_id: operatingCompanyId }),
  });
  if (!res.ok) throw new Error(`Items sync failed (${res.status})`);
  return res.json();
}

type Props = {
  /** Called after a pull-now/reconcile-now action succeeds, so a mounting list page can
   *  invalidate/refetch its own items query. Optional — no-op standalone behavior unchanged. */
  onSynced?: () => void;
};

export function ItemsCatalog({ onSynced }: Props = {}) {
  const { selectedCompanyId } = useCompanyContext();
  const [status, setStatus] = useState<string>("");
  const operatingCompanyId = selectedCompanyId ?? "";

  if (!operatingCompanyId) {
    return <p className="text-xs text-muted-foreground">Select an operating company to manage items sync.</p>;
  }

  return (
    <div className="flex flex-col gap-3 rounded-sm border border-border p-4">
      <h2 className="text-page-title font-semibold">Products &amp; Services (QBO Items)</h2>
      <p className="text-xs text-muted-foreground">Pull and reconcile QBO items into the items catalog for WO auto-post.</p>
      <div className="flex gap-2">
        <button
          type="button"
          className="rounded-sm bg-primary px-3 py-1 text-primary-foreground"
          onClick={async () => {
            const result = await postItemsAction("/api/v1/qbo-sync/items/pull-now", operatingCompanyId);
            setStatus(`Pulled ${result.rowsUpserted ?? 0} items`);
            onSynced?.();
          }}
        >
          Sync now
        </button>
        <button
          type="button"
          className="rounded-sm border px-3 py-1"
          onClick={async () => {
            const result = await postItemsAction("/api/v1/qbo-sync/items/reconcile-now", operatingCompanyId);
            setStatus(`Reconciled · healed ${result.healed ?? 0} · drift ${result.driftDetected ?? 0}`);
            onSynced?.();
          }}
        >
          Reconcile
        </button>
      </div>
      {status ? <p className="text-xs">{status}</p> : null}
    </div>
  );
}

export default ItemsCatalog;
