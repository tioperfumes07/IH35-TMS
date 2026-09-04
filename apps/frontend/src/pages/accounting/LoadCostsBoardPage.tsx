import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { listBills, listExpenses, type ExpenseListRow, type VendorBill } from "../../api/accounting";
import { apiRequest } from "../../api/client";
import { ListErrorState } from "../../components/ListErrorState";
import { DrillKpiCard } from "../../components/layout/DrillKpiCard";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatDateUS } from "../../lib/formatDate";

type FilterPill = "in_motion" | "delivered_open" | "all_open" | "this_week";
type SortKey = "load" | "status" | "pickup_date" | "projected_delivery" | "delivered" | "route_crew" | "revenue" | "costs" | "repairs_maintenance" | "driver" | "margin";
type BoardRow = { load_id:string; load_number:string; status:string; customer_name:string|null; driver_name:string|null; unit_number:string|null; trailer_number:string|null; pickup_city:string|null; delivery_city:string|null; pickup_date:string|null; scheduled_delivery_at:string|null; actual_delivery_at:string|null; created_at:string; revenue_cents:string; expense_cents:string; bill_cents:string; repairs_maintenance_cents:string; driver_pay_cents:string; expense_count:number; bill_count:number };
const money = new Intl.NumberFormat("en-US", { style:"currency", currency:"USD" });
const fmt = (c:number) => money.format(c / 100);
const CLOSED = ["cancelled","abandoned","closed","paid","driver_walkoff","driver_no_show"];
const MOTION = ["draft","booked","planned","unassigned","assigned","assigned_not_dispatched","dispatched","at_pickup","in_transit","at_delivery"];
const DELIVERED = ["delivered","delivered_pending_docs","completed_docs_received","invoiced"];
export const LOAD_COSTS_ELEMENT_MANIFEST = [
  "load-costs-shell", "load-costs-back", "load-costs-title", "load-costs-topbar",
  "load-costs-pill-in_motion", "load-costs-pill-delivered_open", "load-costs-pill-all_open", "load-costs-pill-this_week",
  "kpi-loads-in-motion", "kpi-revenue-booked", "kpi-costs-recorded", "kpi-driver-pay", "kpi-approx-margin", "kpi-bank-unmatched",
  "col-load", "col-status", "col-pickup-date", "col-projected-delivery", "col-delivered", "col-route-crew",
  "col-revenue", "col-costs", "col-repairs-maintenance", "col-driver", "col-margin", "load-costs-expand", "panel-costs-on-load",
  "panel-approx-settlement", "btn-add-cost", "btn-receipt-photo", "btn-fuel-advance",
] as const;
const rowCosts = (r:BoardRow) => Number(r.expense_cents) + Number(r.bill_cents);
const rowPay = (r:BoardRow) => Number(r.driver_pay_cents);
const rowMargin = (r:BoardRow) => Number(r.revenue_cents) - rowCosts(r) - rowPay(r);
function matches(r:BoardRow, f:FilterPill) { if (f === "in_motion") return MOTION.includes(r.status); if (f === "delivered_open") return DELIVERED.includes(r.status); if (f === "this_week") return !CLOSED.includes(r.status) && Date.parse(r.created_at) >= Date.now()-604800000; return !CLOSED.includes(r.status); }
function chip(status:string) { if (status === "in_transit") return { backgroundColor:"#E3ECE8", color:"#2B5F52" }; if (DELIVERED.includes(status)) return { backgroundColor:"#F5EEDA", color:"#8A6410" }; if (["draft","booked","at_pickup"].includes(status)) return { backgroundColor:"#F4E7E0", color:"#8A4020" }; return { backgroundColor:"#F3F4F6", color:"#4B5563" }; }

const PAGE_LIMIT=200;
async function fetchAllExpenses(companyId:string,loadId:string){
  const all:ExpenseListRow[]=[]; let offset=0;
  while(true){ const res=await listExpenses(companyId,{load_id:loadId,limit:PAGE_LIMIT,offset}); const rows=res.rows??[]; all.push(...rows); if(rows.length<PAGE_LIMIT)break; offset+=PAGE_LIMIT; }
  return all;
}
async function fetchAllBills(companyId:string,loadId:string){
  const all:VendorBill[]=[]; let offset=0;
  while(true){ const res=await listBills(companyId,{load_id:loadId,limit:PAGE_LIMIT,offset}); const rows=res.rows??[]; all.push(...rows); if(rows.length<PAGE_LIMIT)break; offset+=PAGE_LIMIT; }
  return all;
}

function ExpandPanel({ row, companyId }:{ row:BoardRow; companyId:string }) {
  const expenses = useQuery({ queryKey:["load-costs-board","expenses",companyId,row.load_id], queryFn:()=>fetchAllExpenses(companyId,row.load_id) });
  const bills = useQuery({ queryKey:["load-costs-board","bills",companyId,row.load_id], queryFn:()=>fetchAllBills(companyId,row.load_id) });
  const entries = [
    ...(expenses.data ?? []).filter(x=>x.status!=="void").map(x=>({id:x.id,number:x.expense_number??row.load_number,label:x.vendor_name??"Vendor not set",detail:x.line_description??x.memo??"Expense · paid now",amount:Number(x.total_amount_cents),owed:false})),
    ...(bills.data ?? []).filter(x=>x.status!=="voided").map(x=>({id:x.id,number:x.display_id??row.load_number,label:x.vendor_name??"Vendor not set",detail:x.bill_number?`Vendor invoice ${x.bill_number}`:"Bill · owed",amount:Number(x.amount_cents),owed:x.status!=="paid"})),
  ];
  const params = new URLSearchParams({load_id:row.load_id,load_number:row.load_number}).toString();
  return <div className="grid gap-3 bg-[#F7F8FA] p-3 md:grid-cols-[1.55fr_1fr]" data-testid="load-costs-expand">
    <section className="overflow-hidden rounded border border-[#E5E7EB] bg-white" data-testid="panel-costs-on-load"><header className="flex justify-between border-b px-3 py-[7px] font-bold uppercase text-[#4B5563]"><span>Costs on this load</span><span>{entries.length} entries</span></header>{entries.length===0?<p className="p-3 text-xs text-[#6B7280]">No costs on this load yet.</p>:entries.map(e=><div key={e.id} className="grid grid-cols-[76px_1fr_80px_96px] gap-2 border-b px-3 py-2 text-xs"><b>{e.number}</b><span>{e.label}<small className="block text-[#6B7280]">{e.detail}</small></span><b className="text-center uppercase">{e.owed?"Owed":"Paid"}</b><b className="text-right">{fmt(e.amount)}</b></div>)}<div className="flex flex-wrap gap-2 p-3"><Link data-testid="btn-add-cost" className="rounded bg-[#16A34A] px-2.5 py-1.5 text-xs font-semibold text-white" to={`/accounting/expenses/new?${params}`}>+ Add a cost</Link><Link data-testid="btn-receipt-photo" className="rounded border border-[#16A34A] px-2.5 py-1.5 text-xs font-semibold text-[#16A34A]" to={`/accounting/receipts?${params}`}>+ From a receipt photo</Link><Link data-testid="btn-fuel-advance" className="rounded border border-[#16A34A] px-2.5 py-1.5 text-xs font-semibold text-[#16A34A]" to={`/cash-advances?${params}`}>+ Fuel advance</Link></div></section>
    <section className="overflow-hidden rounded border border-[#E5E7EB] bg-white" data-testid="panel-approx-settlement"><header className="flex justify-between border-b px-3 py-[7px] font-bold uppercase text-[#4B5563]"><span>Approximate settlement</span><span>not final</span></header>{[["Line haul revenue",Number(row.revenue_cents)],["Costs on the load",-rowCosts(row)],["Driver pay accruing",-rowPay(row)]].map(([l,v])=><div key={String(l)} className="flex justify-between border-b px-3 py-[7px] text-xs"><span>{l}</span><span>{fmt(Number(v))}</span></div>)}<div className="flex justify-between bg-[#DCFCE7] px-3 py-[7px] text-xs font-bold text-[#16A34A]"><span>Approximate margin</span><span>{fmt(rowMargin(row))}</span></div></section>
  </div>;
}

export function LoadCostsBoardPage() {
  const navigate=useNavigate(); const {selectedCompanyId}=useCompanyContext(); const companyId=selectedCompanyId??"";
  const [filter,setFilter]=useState<FilterPill>("in_motion"); const [sortKey,setSortKey]=useState<SortKey>("load"); const [sortDirection,setSortDirection]=useState<"asc"|"desc">("desc");
  const query=useQuery({queryKey:["accounting","load-costs-board",companyId,sortKey,sortDirection],queryFn:()=>apiRequest<{rows:BoardRow[];unmatched_bank_count:number}>(`/api/v1/accounting/load-costs-board?operating_company_id=${encodeURIComponent(companyId)}&load_costs_sort=${sortKey}&sort_direction=${sortDirection}`),enabled:Boolean(companyId),retry:false});
  const rows=query.data?.rows??[]; const visible=useMemo(()=>rows.filter(r=>matches(r,filter)),[rows,filter]); const revenue=visible.reduce((n,r)=>n+Number(r.revenue_cents),0); const costs=visible.reduce((n,r)=>n+rowCosts(r),0); const driver=visible.reduce((n,r)=>n+rowPay(r),0); const margin=revenue-costs-driver;
  const columns:Array<ParityColumn<BoardRow>>=[
    {key:"load",label:"Load",testId:"col-load",sortable:true,render:r=><Link className="font-semibold text-slate-700 underline" to={`/dispatch/loads/${r.load_id}?tab=Costs`}>{r.load_number}</Link>},
    {key:"status",label:"Status",testId:"col-status",sortable:true,render:r=><span className="rounded-sm px-1.5 py-0.5 font-bold uppercase" style={chip(r.status)}>{r.status.replaceAll("_"," ")}</span>},
    {key:"pickup_date",label:"Pickup date",testId:"col-pickup-date",sortable:true,render:r=>r.pickup_date?formatDateUS(r.pickup_date):"—"},
    {key:"projected_delivery",label:"Projected delivery",testId:"col-projected-delivery",sortable:true,render:r=>r.scheduled_delivery_at?formatDateUS(r.scheduled_delivery_at):"—"},
    {key:"delivered",label:"Delivered",testId:"col-delivered",sortable:true,render:r=>r.actual_delivery_at?formatDateUS(r.actual_delivery_at):"—"},
    {key:"route_crew",label:"Route and crew",testId:"col-route-crew",sortable:true,render:r=><span>{r.pickup_city&&r.delivery_city?`${r.pickup_city} → ${r.delivery_city}`:r.pickup_city??r.delivery_city??"Route not set"}<small className="block text-[#6B7280]">{r.customer_name??"Customer not set"} · {r.driver_name??"Not assigned"} · {r.unit_number??"Not assigned"} · {r.trailer_number??"No trailer"}</small></span>},
    {key:"revenue",label:"Revenue",testId:"col-revenue",sortable:true,className:"text-right",render:r=>fmt(Number(r.revenue_cents))},
    {key:"costs",label:"Costs",testId:"col-costs",sortable:true,className:"text-right",render:r=>fmt(rowCosts(r))},
    {key:"repairs_maintenance",label:"R&M EXP",testId:"col-repairs-maintenance",sortable:true,className:"text-right",render:r=>fmt(Number(r.repairs_maintenance_cents))},
    {key:"driver",label:"Driver",testId:"col-driver",sortable:true,className:"text-right",render:r=>fmt(rowPay(r))},
    {key:"margin",label:"Margin",testId:"col-margin",sortable:true,className:"text-right",render:r=>Number(r.revenue_cents)?`${(rowMargin(r)/Number(r.revenue_cents)*100).toFixed(1)}%`:"—"},
  ];
  return <main className="space-y-4 bg-[#F7F8FA]" data-testid="load-costs-shell"><button type="button" data-testid="load-costs-back" className="text-xs font-semibold text-slate-700" onClick={()=>navigate(-1)}>← Back</button><header data-testid="load-costs-title"><h1 className="font-semibold text-[#0F1219]" style={{fontSize:22}}>Load costs</h1><p className="text-xs text-[#6B7280]">Live loads, recorded costs, and approximate margin. This board reads; it never posts.</p></header>{query.isError?<ListErrorState title="Could not load the costs board." status={(query.error as {status?:number})?.status??0} onRetry={()=>void query.refetch()}/>:null}<section className="overflow-hidden rounded border border-[#E5E7EB] bg-white"><div data-testid="load-costs-topbar" className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"><h2 className="font-semibold" style={{fontSize:22}}>Costs</h2><div className="flex gap-1">{(["in_motion","delivered_open","all_open","this_week"] as const).map(id=><button key={id} data-testid={`load-costs-pill-${id}`} type="button" onClick={()=>setFilter(id)} className={`rounded-full border px-3 py-1 text-xs ${filter===id?"border-[#14314F] bg-[#14314F] text-white":"border-[#E5E7EB] text-[#6B7280]"}`}>{id.replaceAll("_"," ")}</button>)}</div></div><div className="grid grid-cols-2 gap-2 p-2 sm:grid-cols-3 lg:grid-cols-6" data-note="KPI-TILE-SIZE LAW 2026-09-04: gap-2 + padding replaces border-b, matching Safety's own KPI-row grid (was over the 101px ceiling with no gap)"><DrillKpiCard testId="kpi-loads-in-motion" label="Loads in motion" value={rows.filter(r=>MOTION.includes(r.status)).length} hint={`${visible.length} rows`} onClick={()=>setFilter("in_motion")}/><DrillKpiCard testId="kpi-revenue-booked" label="Revenue booked" value={fmt(revenue)} hint={`${visible.length} loads`} onClick={()=>setFilter(filter)}/><DrillKpiCard testId="kpi-costs-recorded" label="Costs recorded" value={fmt(costs)} hint={`${visible.reduce((n,r)=>n+r.expense_count+r.bill_count,0)} entries`} onClick={()=>setFilter(filter)}/><DrillKpiCard testId="kpi-driver-pay" label="Driver pay accruing" value={fmt(driver)} hint={`${visible.length} loads`} onClick={()=>setFilter(filter)}/><DrillKpiCard testId="kpi-approx-margin" label="Approximate margin" value={revenue?`${(margin/revenue*100).toFixed(1)}%`:"—"} hint={fmt(margin)} onClick={()=>setFilter(filter)}/><DrillKpiCard testId="kpi-bank-unmatched" label="Bank items unmatched" value={query.data?.unmatched_bank_count??0} hint="Open bank items" to="/banking/transactions"/></div><div style={{backgroundColor:"#14314F",color:"#FFFFFF"}}><ParityTable columns={columns} rows={visible} rowKey={r=>r.load_id} loading={query.isLoading} emptyText="No loads found for this company." storageKey="load-costs-board-v2" enableColumnReorder sortKey={sortKey} sortDirection={sortDirection} sortMode="external" onSortChange={(key,direction)=>{setSortKey(key as SortKey);setSortDirection(direction);}} renderExpanded={r=><ExpandPanel row={r} companyId={companyId}/>} expandMode="single" suppressToolbarRange exportFilename="load-costs" tableTestId="accounting-load-costs-board"/></div></section></main>;
}
