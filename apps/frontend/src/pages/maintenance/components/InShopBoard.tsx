import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listDispatchInShopUnits } from "../../../api/dispatch";
import { ListErrorState } from "../../../components/ListErrorState";
import { EntityLink } from "../../../components/shared/EntityLink";
import { formatDateUS } from "../../../lib/formatDate";
import { FleetTruck } from "./FleetHealthLine";

const statusLabels: Record<string, string> = { open: "Open", in_progress: "Working", awaiting_parts: "Waiting parts", waiting_parts: "Waiting parts", scheduled: "Scheduled", approved: "Approved" };

export function InShopBoard({ companyId }: { companyId: string }) {
  const query = useQuery({
    queryKey: ["maintenance", "in-shop-board", companyId],
    queryFn: async () => {
      const result = await listDispatchInShopUnits(companyId);
      if (!Array.isArray(result.rows) || result.rows.some((row) => !row.unit_id || !row.work_order_id)) throw new Error("In-shop work-order linkage is incomplete.");
      return result.rows;
    },
    enabled: Boolean(companyId),
    staleTime: 30_000,
  });
  if (!companyId) return <p className="text-xs text-slate-600">Select a company to view in-shop work orders.</p>;
  if (query.isError) return <ListErrorState title="Couldn't load in-shop work orders" status={0} message={query.error instanceof Error ? query.error.message : undefined} onRetry={() => void query.refetch()} />;
  if (query.isPending) return <p role="status" className="text-xs text-slate-600">Loading in-shop work orders…</p>;
  return <section className="min-w-0 space-y-3" aria-label="In-shop work orders">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-xs font-bold uppercase text-slate-700">In-shop work orders</h2>
      <Link className="text-xs" to="/maintenance/active-wos">View all work orders →</Link>
    </div>
    {query.data.length === 0 ? <div className="rounded-sm border border-slate-200 bg-white p-3 text-xs">No open in-shop work orders for this company.</div> :
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {query.data.map((row) => {
          const waiting = ["awaiting_parts", "waiting_parts"].includes(row.status);
          return <article key={row.work_order_id} className="flex min-w-0 flex-col gap-2 rounded-sm border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <EntityLink kind="unit" id={row.unit_id} label={row.unit_number} />
              <span className="inline-flex items-center gap-1"><span aria-hidden="true" className={`h-2 w-2 rounded-full ${waiting ? "bg-slate-500" : "bg-blue-700"}`} />{statusLabels[row.status] ?? row.status.replaceAll("_", " ")}</span>
            </div>
            <div className="h-44 rounded-sm bg-slate-100 p-2"><FleetTruck vertical row={{ state: waiting ? "soon" : "ok" }} /></div>
            <EntityLink kind="work_order" id={row.work_order_id} label={row.work_order_display_id || "Open work order"} />
            <p className="break-words text-xs text-slate-600">{row.shop_or_vendor || "Shop not recorded"}</p>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs">
              <dt>Opened</dt><dd>{row.opened_at ? formatDateUS(row.opened_at) : "Not recorded"}</dd>
              <dt>Expected ready</dt><dd>{row.expected_ready_at ? formatDateUS(row.expected_ready_at) : "Not recorded"}</dd>
            </dl>
            <p className="text-xs text-slate-500">Bay assignment and completion progress unavailable.</p>
          </article>;
        })}
      </div>}
    <p className="rounded-sm border border-slate-200 border-l-2 border-l-slate-600 bg-white px-3 py-2 text-xs text-slate-600">This view uses the live in-shop work-order source. Bay capacity, assignment and progress are not exposed by that source; no sample bays or completion percentages are shown.</p>
  </section>;
}
