// LEAD 443.301 · register row 59 — Maintenance › In Shop rebuilt to the approved V3 board
// (docs/design/v3/Maintenance-InShop): one card per shop BAY (count from Maintenance Settings), each showing the truck,
// status and work; open bays take a truck dragged in from the yard lane (active work orders holding no bay).
// Data: GET /api/v1/maintenance/shop-bays (migration 202616261700). Nothing sampled — empty bays say so.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { assignWorkOrderBay, getShopBays, releaseWorkOrderBay, type ShopBaysPayload } from "../../../api/shopBays";
import { ListErrorState } from "../../../components/ListErrorState";
import { EntityLink } from "../../../components/shared/EntityLink";
import { useToast } from "../../../components/Toast";
import { userFacingApiError } from "../../../lib/api-error-message";
import { SelectCombobox } from "../../../components/Combobox";
import { formatDateUS } from "../../../lib/formatDate";
import { currentOriginHref, withReturnContext } from "../../../lib/returnContext";
import { ShopBayFloorSvg } from "./ShopBayFloorSvg";

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

/** ROUND 8.20 board23 — occupied-bay progress from WO status only (never invents % for empty bays). */
export function bayProgressPct(status: string | null | undefined): number | null {
  if (!status) return null;
  switch (status) {
    case "open":
      return 15;
    case "waiting_parts":
    case "awaiting_parts":
      return 40;
    case "in_progress":
      return 65;
    case "complete":
    case "completed":
      return 100;
    default:
      return 25;
  }
}

const DRAG_TYPE = "application/x-ih35-work-order";

/** ShopBays.dc.html chip + bar colors per bay state (chipBg / chipFg / bar). */
export function bayChip(status: string | null): { bg: string; fg: string; bar: string } {
  switch (status) {
    case "in_progress": return { bg: "#D7E4F5", fg: "#14213D", bar: "#2456C7" };
    case "waiting_parts":
    case "awaiting_parts": return { bg: "#FDE7C2", fg: "#854F0B", bar: "#D98E04" };
    case "complete":
    case "completed": return { bg: "#D9F2E3", fg: "#1F6B3A", bar: "#2E9E5B" };
    case "open": return { bg: "#E3E8EF", fg: "#33415A", bar: "#8A97A8" };
    case null: return { bg: "#465770", fg: "#C9D3DF", bar: "#8A97A8" };
    default: return { bg: "#E3E8EF", fg: "#33415A", bar: "#8A97A8" };
  }
}


export function InShopBoard({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const location = useLocation();
  const originHref = currentOriginHref(location.pathname, location.search);
  const shopHref = (target: string) => withReturnContext(target, originHref);
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

  // ShopBays.dc.html (Board 45) — the shop from above: dark floor (#2C3A4E), one bay tile (#3B4A5E) per bay with
  // its BAY n + status chip, the 300×330 top-down graphic, and a white job ticket (job · who · progress · release);
  // then the white YARD LANE card. Live shop-bays only — empty bays render OPEN BAY, never a sample truck.
  return <section className="min-w-0 space-y-4" aria-label="Shop floor plan" data-testid="in-shop-bay-board">
    <header className="flex flex-wrap items-end justify-between gap-4" data-testid="in-shop-floor-chrome">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="text-section-header font-bold tracking-[.16em] text-[#4A5A70]">MAINTENANCE · SHOP FLOOR</div>
        <h1 className="m-0 text-page-title font-extrabold leading-none text-[#14213D]">
          The shop, from above — {bay_count} bay{bay_count === 1 ? "" : "s"}{bay_count === 4 ? ", 60 × 30 ft" : ""}
        </h1>
        <p className="m-0 text-xs text-[#4A5A70]">Each bay holds the truck that is in it, nose to the door, with its job ticket. Drag a truck from the yard lane into an open bay.</p>
      </div>
      <Link
        to={shopHref("/maintenance/arriving-soon")}
        className="inline-flex h-11 items-center rounded-[10px] bg-[#14213D] px-5 text-xs font-semibold text-white hover:opacity-95"
        data-testid="in-shop-check-truck-in"
      >
        Check a truck in
      </Link>
    </header>

    <div className="grid min-w-0 gap-3 rounded-[18px] bg-[#2C3A4E] p-4 [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))]" data-testid="in-shop-bays">
      {bays.map(({ bay_number, work_order: wo }) => {
        const st = wo ? bayStatusLabel(wo.status) : null;
        const chip = bayChip(wo?.status ?? null);
        const unitLabel = wo?.unit_number ?? (wo ? "Truck" : "");
        const pct = wo ? bayProgressPct(wo.status) : null;
        const overdue = Boolean(wo?.expected_release_at && new Date(wo.expected_release_at).getTime() < Date.now() && wo.status !== "complete" && wo.status !== "completed");
        return <article
          key={bay_number}
          data-testid={`in-shop-bay-${bay_number}`}
          aria-label={`Bay ${bay_number}${wo ? ` · ${wo.unit_number ?? "truck"}` : " · open"}`}
          onDragOver={(e) => { if (!wo && e.dataTransfer.types.includes(DRAG_TYPE)) { e.preventDefault(); setDragOver(bay_number); } }}
          onDragLeave={() => setDragOver((v) => (v === bay_number ? null : v))}
          onDrop={(e) => { e.preventDefault(); setDragOver(null); const id = e.dataTransfer.getData(DRAG_TYPE); if (id && !wo) assign.mutate({ woId: id, bay: bay_number }); }}
          className={`flex min-w-0 flex-col gap-2.5 rounded-xl bg-[#3B4A5E] p-3 ${dragOver === bay_number ? "ring-2 ring-[#F2C230]" : ""}`}
        >
          <header className="flex items-center justify-between gap-2">
            <span className="text-xs font-extrabold tracking-[.06em] text-white">
              BAY {bay_number}{wo?.unit_id ? <> · <EntityLink kind="unit" id={wo.unit_id} label={wo.unit_number ?? "Truck"} className="text-white underline underline-offset-2" /></> : null}
            </span>
            <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: chip.bg, color: chip.fg }}>{st ? st.label : "OPEN BAY"}</span>
          </header>
          <ShopBayFloorSvg bayNumber={bay_number} occupied={Boolean(wo)} unitLabel={unitLabel} status={wo?.status ?? null} />
          <div className="flex min-w-0 flex-col gap-1.5 rounded-[10px] bg-white px-3 py-2.5">
            {wo ? <>
              <div className="break-words text-xs font-bold text-[#14213D]">{wo.title || "Work not described"}</div>
              <div className="flex flex-wrap items-center gap-x-2 text-xs text-[#4A5A70]">
                <EntityLink kind="work_order" id={wo.work_order_id} label={wo.display_id || "Work order"} />
                <span>· in shop since {wo.in_shop_at ? formatDateUS(wo.in_shop_at) : "—"}</span>
              </div>
              {pct != null ? <div data-testid={`in-shop-bay-${bay_number}-progress`} className="flex flex-col gap-1.5">
                <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Bay ${bay_number} progress ${pct}%`} className="h-2 overflow-hidden rounded bg-[#E3E8EF]">
                  <div className="h-2" style={{ width: `${pct}%`, background: chip.bar }} />
                </div>
                <div className="flex justify-between gap-2 text-xs text-[#33415A]">
                  <span>{st?.label} · {pct}%</span>
                  <span className="font-bold" style={{ color: overdue ? "#B42318" : "#33415A" }}>
                    {wo.expected_release_at ? `${overdue ? "Overdue · " : "Release "}${formatDateUS(wo.expected_release_at)}` : "No release date"}
                  </span>
                </div>
              </div> : null}
              <button type="button" disabled={busy} onClick={() => release.mutate(wo.work_order_id)}
                className="self-start rounded-md border border-[#D5DCE5] bg-[#F6F8FB] px-2 py-1 text-xs text-[#14213D] hover:bg-white disabled:opacity-50"
                data-testid={`in-shop-bay-${bay_number}-release`}>Release bay</button>
            </> : <>
              <div className="text-xs font-bold text-[#14213D]">Open bay</div>
              <div className="text-xs text-[#4A5A70]">Drag a truck in from the yard lane.</div>
            </>}
          </div>
        </article>;
      })}
    </div>

    <section aria-label="Yard lane" className="flex min-w-0 flex-col gap-2.5 rounded-[14px] bg-white px-4 py-3.5 shadow-[0_1px_0_#D5DCE5]" data-testid="in-shop-yard-lane">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-section-header font-bold tracking-[.12em] text-[#5B6B7E]">YARD LANE · NEXT IN, BY PM URGENCY ({yard.length})</h2>
        <Link className="text-xs" to={shopHref("/maintenance/active-wos")}>View all work orders →</Link>
      </div>
      {yard.length === 0 ? <p className="m-0 text-xs text-[#4A5A70]">No active work orders are waiting for a bay.</p> :
        <div className="flex min-w-0 flex-wrap gap-2.5">
          {yard.map((wo) => {
            const st = bayStatusLabel(wo.status);
            const chip = bayChip(wo.status);
            return <article key={wo.work_order_id} draggable={!busy}
              onDragStart={(e) => { e.dataTransfer.setData(DRAG_TYPE, wo.work_order_id); e.dataTransfer.effectAllowed = "move"; }}
              className="flex min-h-11 min-w-0 cursor-grab flex-wrap items-center gap-2.5 rounded-[10px] border border-[#D5DCE5] bg-[#F6F8FB] px-3.5 py-1.5"
              data-testid={`in-shop-yard-${wo.work_order_id}`}>
              <span aria-hidden="true" className="h-[26px] w-2.5 rounded-[3px]" style={{ background: chip.bar }} />
              <span className="text-xs font-extrabold text-[#14213D]">{wo.unit_id ? <EntityLink kind="unit" id={wo.unit_id} label={wo.unit_number ?? "Truck"} /> : (wo.unit_number ?? "No truck")}</span>
              <span className="min-w-0 text-xs text-[#4A5A70]">{st.label} · {wo.title || "Work not described"} · <EntityLink kind="work_order" id={wo.work_order_id} label={wo.display_id || "Work order"} /></span>
              <label className="flex items-center gap-1.5 text-xs text-[#4A5A70]">
                Move to bay
                <SelectCombobox
                  aria-label={`Move ${wo.unit_number ?? "truck"} to a bay`}
                  disabled={busy || openBays.length === 0}
                  value=""
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (n) assign.mutate({ woId: wo.work_order_id, bay: n });
                  }}
                  className="h-7 text-xs"
                >
                  <option value="">{openBays.length ? "Choose…" : "No open bay"}</option>
                  {openBays.map((n) => (
                    <option key={n} value={String(n)}>Bay {n}</option>
                  ))}
                </SelectCombobox>
              </label>
            </article>;
          })}
        </div>}
    </section>
  </section>;
}
