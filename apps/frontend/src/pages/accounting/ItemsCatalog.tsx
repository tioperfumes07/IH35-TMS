import { useState } from "react";
import { useCompanyContext } from "../../contexts/CompanyContext";

async function postItemsAction(path: string, operatingCompanyId: string) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operating_company_id: operatingCompanyId }),
  });
  if (!res.ok) throw new Error(`Items sync failed (${res.status})`);
  return res.json();
}

export function ItemsCatalog() {
  const { selectedCompanyId } = useCompanyContext();
  const [status, setStatus] = useState<string>("");
  const operatingCompanyId = selectedCompanyId ?? "";

  if (!operatingCompanyId) {
    return <p className="text-sm text-muted-foreground">Select an operating company to manage items sync.</p>;
  }

  return (
    <div className="flex flex-col gap-3 rounded border border-border p-4">
      <h2 className="text-lg font-semibold">Products &amp; Services (QBO Items)</h2>
      <p className="text-sm text-muted-foreground">Pull and reconcile QBO items into catalogs.items for WO auto-post.</p>
      <div className="flex gap-2">
        <button
          type="button"
          className="rounded bg-primary px-3 py-1 text-primary-foreground"
          onClick={async () => {
            const result = await postItemsAction("/api/v1/qbo-sync/items/pull-now", operatingCompanyId);
            setStatus(`Pulled ${result.rowsUpserted ?? 0} items`);
          }}
        >
          Sync now
        </button>
        <button
          type="button"
          className="rounded border px-3 py-1"
          onClick={async () => {
            const result = await postItemsAction("/api/v1/qbo-sync/items/reconcile-now", operatingCompanyId);
            setStatus(`Reconciled · healed ${result.healed ?? 0} · drift ${result.driftDetected ?? 0}`);
          }}
        >
          Reconcile
        </button>
      </div>
      {status ? <p className="text-sm">{status}</p> : null}
    </div>
  );
}

export default ItemsCatalog;
