// LEAD 443.301 · register row 59 — Maintenance › In Shop rebuilt to the approved V3 board
// (docs/design/v3/Maintenance-InShop): one card per shop BAY (count from Maintenance Settings), each showing the truck,
// status and work; open bays take a truck dragged in from the yard lane (active work orders holding no bay).
// Data: GET /api/v1/maintenance/shop-bays (migration 202616261700). Nothing sampled — empty bays say so.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { assignWorkOrderBay, getShopBays, releaseWorkOrderBay, type BayWorkOrder, type ShopBaysPayload } from "../../../api/shopBays";
import { ListErrorState } from "../../../components/ListErrorState";
import { EntityLink } from "../../../components/shared/EntityLink";
import { useToast } from "../../../components/Toast";
import { userFacingApiError } from "../../../lib/api-error-message";
import { formatDateUS } from "../../../lib/formatDate";

/** Bay status words on the board (§7 palette: navy / §7 amber #854F0B / slate — no new amber/emerald classes). A finished work order still holding its bay is "Ready" (truck not rolled out). */
export function bayStatusLabel(status: string): { label: string; dot: string } {
  switch (status) {
    case "in_progress": return { label: "Working", dot: "bg-[#14314F]" };
    case "waiting_parts":
    case "awaiting_parts": return { label: "Waiting parts", dot: "bg-[#854F0B]" };
    case "complete":
    case "completed": return { label: "Ready", dot: "bg-slate-700" };
    case "open": return { label: "Checked in", dot: "bg-slate-400" };
    default: return { label: status.replaceAll("_", " "), dot: "bg-slate-500" };
  }
}

const DRAG_TYPE = "application/x-ih35-work-order";

function WoLine({ wo }: { wo: BayWorkOrder }) {
  return <div className="min-w-0 space-y-1 text-xs">
    <p className="break-words text-slate-700">{wo.title || "Work not described"}</p>
    <EntityLink kind="work_order" id={wo.work_order_id} label={wo.display_id || "Work order"} />
  </div>;
}

export function InShopBoard({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const [dragOver, setDragOver] = useState<number | null>(null);
  const key = ["maintenance", "shop-bays", companyId];
  const query = useQuery({ queryKey: key, queryFn: () => getShopBays(companyId), enabled: Boolean(companyId), staleTime: 15_000 });
  const onDone = (data: ShopBaysPayload) => { qc.setQueryData(key, data); void qc.invalidateQueries({ queryKey: ["maintenance"] }); };
  const assign = useMutation({
    mutationFn: (v: { woId: string; bay: number }) => assignWorkOrderBay(companyId, v.woId, v.bay),
    onSuccess: (data, v) => { onDone(data); pushToast(`Moved into bay ${v.bay}.`, "success"); },
    onError: (e) => pushToast(userFacingApiError(e, "Could not move the truck into that bay."), "error"),
  });
  const release = useMutation({
    mutationFn: (woId: string) => releaseWorkOrderBay(companyId, woId),
    onSuccess: (data) => { onDone(data); pushToast("Bay released.", "success"); },
    onError: (e) => pushToast(userFacingApiError(e, "Could not release the bay."), "error"),
  });

  if (!companyId) return <p className="text-xs text-slate-600">Select a company to view the shop bays.</p>;
  if (query.isError) return <ListErrorState title="Couldn't load the shop bays" status={0} message={query.error instanceof Error ? query.error.message : undefined} onRetry={() => void query.refetch()} />;
  if (query.isPending) return <p role="status" className="text-xs text-slate-600">Loading shop bays…</p>;
  const { bays, yard, bay_count } = query.data;
  const openBays = bays.filter((b) => !b.work_order).map((b) => b.bay_number);
  const busy = assign.isPending || release.isPending;

  return <section className="min-w-0 space-y-3" aria-label="Shop bays" data-testid="in-shop-bay-board">
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="in-shop-bays">
      {bays.map(({ bay_number, work_order: wo }) => {
        const st = wo ? bayStatusLabel(wo.status) : null;
        return <article
          key={bay_number}
          data-testid={`in-shop-bay-${bay_number}`}
          aria-label={`Bay ${bay_number}${wo ? ` · ${wo.unit_number ?? "truck"}` : " · open"}`}
          onDragOver={(e) => { if (!wo && e.dataTransfer.types.includes(DRAG_TYPE)) { e.preventDefault(); setDragOver(bay_number); } }}
          onDragLeave={() => setDragOver((v) => (v === bay_number ? null : v))}
          onDrop={(e) => { e.preventDefault(); setDragOver(null); const id = e.dataTransfer.getData(DRAG_TYPE); if (id && !wo) assign.mutate({ woId: id, bay: bay_number }); }}
          className={`flex min-h-[148px] min-w-0 flex-col gap-2 rounded-sm border bg-white p-3 ${wo ? "border-slate-200" : "border-dashed border-slate-300"} ${dragOver === bay_number ? "ring-2 ring-[#14314F]" : ""}`}
        >
          <header className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-bold uppercase tracking-wide text-slate-700">
              Bay {bay_number}{wo ? <> · {wo.unit_id ? <EntityLink kind="unit" id={wo.unit_id} label={wo.unit_number ?? "Truck"} /> : (wo.unit_number ?? "No truck")}</> : null}
            </span>
            {st ? <span className="inline-flex items-center gap-1"><span aria-hidden="true" className={`h-2 w-2 rounded-full ${st.dot}`} />{st.label}</span> : <span className="text-slate-500">Open</span>}
          </header>
          {wo ? <>
            <WoLine wo={wo} />
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs text-slate-600">
              <dt>In shop</dt><dd>{wo.in_shop_at ? formatDateUS(wo.in_shop_at) : "Not recorded"}</dd>
              <dt>Expected release</dt><dd>{wo.expected_release_at ? formatDateUS(wo.expected_release_at) : "Not recorded"}</dd>
            </dl>
            <button type="button" disabled={busy} onClick={() => release.mutate(wo.work_order_id)}
              className="mt-auto self-start rounded-sm border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
              data-testid={`in-shop-bay-${bay_number}-release`}>Release bay</button>
          </> : <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center text-xs text-slate-500">
            <span className="font-semibold">Open bay</span>
            <span>Drag a truck in from the yard lane</span>
          </div>}
        </article>;
      })}
    </div>

    <section aria-label="Yard lane" className="min-w-0 space-y-2" data-testid="in-shop-yard-lane">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase text-slate-700">Yard lane · waiting for a bay ({yard.length})</h2>
        <Link className="text-xs" to="/maintenance/active-wos">View all work orders →</Link>
      </div>
      {yard.length === 0 ? <p className="rounded-sm border border-slate-200 bg-white p-3 text-xs text-slate-600">No active work orders are waiting for a bay.</p> :
        <div className="flex min-w-0 flex-wrap gap-2">
          {yard.map((wo) => {
            const st = bayStatusLabel(wo.status);
            return <article key={wo.work_order_id} draggable={!busy}
              onDragStart={(e) => { e.dataTransfer.setData(DRAG_TYPE, wo.work_order_id); e.dataTransfer.effectAllowed = "move"; }}
              className="flex w-64 min-w-0 cursor-grab flex-col gap-2 rounded-sm border border-slate-200 bg-white p-2"
              data-testid={`in-shop-yard-${wo.work_order_id}`}>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold">{wo.unit_id ? <EntityLink kind="unit" id={wo.unit_id} label={wo.unit_number ?? "Truck"} /> : (wo.unit_number ?? "No truck")}</span>
                <span className="inline-flex items-center gap-1"><span aria-hidden="true" className={`h-2 w-2 rounded-full ${st.dot}`} />{st.label}</span>
              </div>
              <WoLine wo={wo} />
              <label className="text-xs text-slate-600">Move to bay{" "}
                <select disabled={busy || openBays.length === 0} value="" aria-label={`Move ${wo.unit_number ?? "truck"} to a bay`}
                  onChange={(e) => { const n = Number(e.target.value); if (n) assign.mutate({ woId: wo.work_order_id, bay: n }); }}
                  className="ml-1 h-7 rounded-sm border border-slate-300 bg-white px-1 text-xs">
                  <option value="">{openBays.length ? "Choose…" : "No open bay"}</option>
                  {openBays.map((n) => <option key={n} value={n}>Bay {n}</option>)}
                </select>
              </label>
            </article>;
          })}
        </div>}
    </section>
    <p className="text-xs text-slate-500">{bay_count} bays (Maintenance › Settings). A finished truck stays "Ready" in its bay until the bay is released.</p>
  </section>;
}
