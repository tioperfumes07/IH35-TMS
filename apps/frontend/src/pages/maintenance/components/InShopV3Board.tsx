/**
 * Board 23 — Maintenance › In Shop, ported verbatim from docs/design/v3/Maintenance-InShop.dc.html (owner 11-14 16:41 CT:
 * "100% IDENTICAL"). One card per shop bay (count from Maintenance Settings): "BAY n · unit" + state, the truck from
 * above, the job, the progress bar; an open bay says so. Data: GET /api/v1/maintenance/shop-bays — real work orders
 * holding a bay; nothing sampled. The full floor plan with the yard lane (Board 45) is one click away.
 */
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import { getShopBays, type BayWorkOrder } from "../../../api/shopBays";
import { ListErrorState } from "../../../components/ListErrorState";
import { EntityLink } from "../../../components/shared/EntityLink";
import { currentOriginHref, withReturnContext } from "../../../lib/returnContext";
import { InShopTruck, inShopTruckShape } from "./InShopTruck";

const FONT = "Inter, ui-sans-serif, system-ui, sans-serif";

/** The board's state words and dot colours. A finished work order still holding its bay is "Ready". */
export function inShopState(status: string): { label: string; dot: string; cab: string; pct: number } {
  switch (status) {
    case "in_progress": return { label: "Working", dot: "#1D4ED8", cab: "#1E3A5F", pct: 60 };
    case "waiting_parts":
    case "awaiting_parts": return { label: "Waiting parts", dot: "#B45309", cab: "#A15C0B", pct: 40 };
    case "complete":
    case "completed": return { label: "Ready", dot: "#15803D", cab: "#1E3A5F", pct: 100 };
    case "open": return { label: "Checked in", dot: "#94A3B8", cab: "#1E3A5F", pct: 15 };
    default: return { label: status.replaceAll("_", " "), dot: "#94A3B8", cab: "#1E3A5F", pct: 25 };
  }
}

function Dot({ color }: { color: string }) {
  return <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, display: "inline-block" }} />;
}

function BayCard({ bay, wo, floorHref }: { bay: number; wo: BayWorkOrder | null; floorHref: string }) {
  const st = wo ? inShopState(wo.status) : null;
  return (
    <article data-testid={`in-shop-v3-bay-${bay}`} aria-label={`Bay ${bay}${wo ? ` · ${wo.unit_number ?? "truck"}` : " · open"}`}
      style={{ background: "#fff", border: "1px solid #DDE1E7", borderRadius: 6, padding: 10, display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", font: `700 12px ${FONT}` }}>
        <span>BAY {bay}{wo ? <> · {wo.unit_id ? <EntityLink kind="unit" id={wo.unit_id} label={wo.unit_number ?? "Truck"} /> : (wo.unit_number ?? "Truck")}</> : " "}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, font: `500 12px ${FONT}`, color: "#111827", whiteSpace: "nowrap" }}>
          <Dot color={st ? st.dot : "#94A3B8"} />{st ? st.label : "Open"}
        </span>
      </div>
      <div style={{ background: "#F1F3F6", borderRadius: 4, padding: 6, height: 170, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {wo ? <InShopTruck shape={inShopTruckShape(wo.unit_make, wo.unit_model)} color={st!.cab} />
          : <div style={{ height: 150, display: "flex", alignItems: "center", justifyContent: "center", color: "#8B94A3", fontSize: 12, border: "1px dashed #DDE1E7", borderRadius: 4, width: "100%" }}>Open bay</div>}
      </div>
      {wo ? <>
        <div style={{ fontSize: 12 }}>
          <EntityLink kind="work_order" id={wo.work_order_id} label={wo.title || wo.display_id || "Work order"} />
        </div>
        <div role="progressbar" aria-valuenow={st!.pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Bay ${bay} ${st!.label} ${st!.pct}%`}
          style={{ width: 200, height: 6, background: "#EEF0F3", borderRadius: 3 }}>
          <div style={{ width: `${st!.pct}%`, height: 6, background: "#1E3A5F", borderRadius: 3 }} />
        </div>
      </> : <div style={{ fontSize: 12 }}><Link to={floorHref} style={{ color: "inherit", textDecoration: "none" }}>Drag a truck in from the yard lane</Link></div>}
    </article>
  );
}

export function InShopV3Board({ companyId }: { companyId: string }) {
  const { pathname, search } = useLocation();
  const origin = currentOriginHref(pathname, search);
  const floorHref = withReturnContext("/maintenance/fleet-table?status=in-shop&view=floor", origin);
  const q = useQuery({ queryKey: ["maintenance", "shop-bays", companyId], queryFn: () => getShopBays(companyId), enabled: Boolean(companyId), staleTime: 15_000 });
  if (!companyId) return <p style={{ fontSize: 12 }}>Select a company to view the shop bays.</p>;
  if (q.isError) return <ListErrorState title="Couldn't load the shop bays" status={0} message={q.error instanceof Error ? q.error.message : undefined} onRetry={() => void q.refetch()} />;
  if (q.isPending) return <p role="status" style={{ fontSize: 12 }}>Loading shop bays…</p>;
  const { bays, yard } = q.data;
  const inBays = bays.filter((b) => b.work_order).length;
  return (
    <div data-v3-board="Maintenance-InShop" data-testid="in-shop-v3-board" style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12, fontFamily: FONT, lineHeight: "normal", color: "#111827" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
        {bays.map((b) => <BayCard key={b.bay_number} bay={b.bay_number} wo={b.work_order} floorHref={floorHref} />)}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "#fff", border: "1px solid #DDE1E7", borderLeft: "3px solid #B45309", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "#111827" }}>
        <b style={{ color: "#B45309", whiteSpace: "nowrap" }}>Measured</b>
        <span>{inBays} of {bays.length} bays hold a work order · {yard.length} active work order{yard.length === 1 ? "" : "s"} waiting in the yard lane. Bays fill from real work orders (bay field on the WO) — <Link to={floorHref}>open the floor plan</Link>.</span>
      </div>
    </div>
  );
}
