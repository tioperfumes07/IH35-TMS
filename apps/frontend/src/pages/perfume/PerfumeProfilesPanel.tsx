/**
 * PERFUME-PROFILES (owner 2026-11-26 19:12 CT: "i need my complete customer and vendors profile etc as designed but better if
 * possible, and make sure full and total complete linkage"). Three views, each reaching everything that points at it:
 *  - Supplier profile: the price-list vendor + its company in Contacts (people, phone, web), its lists, how many items it
 *    carries, lines waiting, codes and words the desk remembered, its purchase orders and spend.
 *  - Item profile: barcodes, every vendor's own code / words / price for the bottle, the words remembered (so any spelling
 *    links by itself), its quotes, sales orders and purchase orders.
 *  - PerfumeCompanyActivity (exported): a customer's / company's quotes, orders and the POs to it as a vendor — mounted by
 *    the Contacts profile (10-23-2026 agent's lane).
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Button } from "../../components/Button";
import { ParityTable } from "../../components/parity/ParityTable";
import { KpiCard } from "../../components/layout/KpiCard";
import { useToast } from "../../components/Toast";
import { ListErrorState } from "../../components/ListErrorState";
import { userFacingApiError } from "../../lib/api-error-message";
import {
  getPerfumeCompanyActivity, getPerfumeItemProfile, getPerfumeVendorProfile, listPerfumeContacts, listPerfumeVendors, perfumeItemLots, searchPerfumeItems, setPerfumeVendorCompany,
  updatePerfumeItemFile, type PerfumeItemProfile, type PerfumeItemVendorLine, type PerfumeLot, type PerfumeOrderRow, type PerfumePoRow, type PerfumeQuoteRow, type PerfumeVendor, type PerfumeVendorProfile,
} from "../../api/perfume";
import { tr } from "./perfumeI18n";
import { Badge, ctl, DASH, DocLink, ItemFinder, money, useOpenDoc, usDate } from "./perfumeDocParts";
import { PO_STATUS_CLASS, PO_STATUS_TEXT } from "./PerfumeOrdersPanel";
import { ItemCreator, ItemFileEditor } from "./PerfumeItemFilePanel";
import { ItemSitesBlock } from "./PerfumeFamiliesPanel";
import { ScentsxItemAccountLine } from "./ScentsxItemAccounts";
import { VendorLinkReview } from "./PerfumeVendorLinkReview";
import { CompanyNameCheck } from "./PerfumeCompanyNameCheck";
import { ScentsxVendorLink } from "./ScentsxVendorLink";
import { CompanyRoleEditor } from "./PerfumeCompanyRole";

const KIND_TEXT: Record<string, string> = { buy: "Supplier", sell: "Competitor", both: "Supplier + competitor", offer: "My offer list", inventory: "My inventory" };
const METHOD_TEXT: Record<string, string> = { upc: "Barcode", sku: "Their code", alias: "Their words (remembered)", key: "Same name", name: "Same bottle, other spelling",
  new_item: "Made this item", confirmed: "Confirmed by me", loose_key: "Loose" };
const QUOTE_TEXT: Record<string, string> = { draft: "Draft", sent: "Sent", accepted: "Accepted", rejected: "Rejected", expired: "Expired" };
const ORDER_TEXT: Record<string, string> = { open: "Open", shipped: "Shipped", cancelled: "Cancelled" };

/* ------------------------------------------------------------------ the three document tables, shared */

export function QuotesTable({ rows, storageKey }: { rows: PerfumeQuoteRow[]; storageKey: string }) {
  return (
    <ParityTable<PerfumeQuoteRow> selectable cardTitle title={tr("perfume.profiles.quotes", "Quotes")} rows={rows} rowKey={(r) => r.id} storageKey={storageKey} exportFilename="TIO quotes" exportExcel emptyText="No quotes."
      columns={[
        { key: "number", label: "Quote", render: (r) => <DocLink tab="quotes" id={r.id}>{r.number}</DocLink>, exportValue: (r) => r.number },
        { key: "quote_date", label: "Date", cellClass: "text-right tabular-nums", render: (r) => usDate(r.quote_date) },
        { key: "customer_name", label: "Customer", render: (r) => r.customer_name },
        { key: "status", label: "Status", render: (r) => QUOTE_TEXT[r.status] ?? r.status },
        { key: "total_cents", label: "Total", kind: "number", cellClass: "text-right tabular-nums", render: (r) => money(r.total_cents, r.currency), exportValue: (r) => Number(r.total_cents) / 100 },
      ]} />
  );
}
export function OrdersTable({ rows, storageKey }: { rows: PerfumeOrderRow[]; storageKey: string }) {
  return (
    <ParityTable<PerfumeOrderRow> selectable cardTitle title={tr("perfume.profiles.orders", "Sales orders")} rows={rows} rowKey={(r) => r.id} storageKey={storageKey} exportFilename="TIO sales orders" exportExcel emptyText="No sales orders."
      columns={[
        { key: "number", label: "Order", render: (r) => <DocLink tab="orders" id={r.id}>{r.number}</DocLink>, exportValue: (r) => r.number },
        { key: "order_date", label: "Date", cellClass: "text-right tabular-nums", render: (r) => usDate(r.order_date) },
        { key: "customer_name", label: "Customer", render: (r) => r.customer_name },
        { key: "status", label: "Status", render: (r) => ORDER_TEXT[r.status] ?? r.status },
        { key: "units", label: "Units", kind: "number", cellClass: "text-right tabular-nums", render: (r) => r.units.toLocaleString("en-US") },
        { key: "total_cents", label: "Total", kind: "number", cellClass: "text-right tabular-nums", render: (r) => money(r.total_cents, r.currency), exportValue: (r) => Number(r.total_cents) / 100 },
      ]} />
  );
}
export function PosTable({ rows, storageKey }: { rows: PerfumePoRow[]; storageKey: string }) {
  return (
    <ParityTable<PerfumePoRow> selectable cardTitle title={tr("perfume.profiles.pos", "Purchase orders")} rows={rows} rowKey={(r) => r.id} storageKey={storageKey} exportFilename="TIO purchase orders" exportExcel emptyText="No purchase orders."
      columns={[
        { key: "number", label: "PO", render: (r) => <DocLink tab="purchases" id={r.id}>{r.number}</DocLink>, exportValue: (r) => r.number },
        { key: "order_date", label: "Date", cellClass: "text-right tabular-nums", render: (r) => usDate(r.order_date) },
        { key: "vendor_name", label: "Vendor", render: (r) => r.vendor_name },
        { key: "status", label: "Status", render: (r) => <Badge text={PO_STATUS_TEXT[r.status]} color={PO_STATUS_CLASS[r.status]} />, exportValue: (r) => PO_STATUS_TEXT[r.status] },
        { key: "units", label: "Units", kind: "number", cellClass: "text-right tabular-nums", render: (r) => r.units.toLocaleString("en-US") },
        { key: "total_cents", label: "Cost", kind: "number", cellClass: "text-right tabular-nums", render: (r) => money(r.total_cents, r.currency), exportValue: (r) => Number(r.total_cents) / 100 },
      ]} />
  );
}

/* ------------------------------------------------------------------ Supplier profiles */

export function PerfumeSupplierProfilesPanel() {
  const { openId, open } = useOpenDoc();
  const [, setParams] = useSearchParams();
  const vendors = useQuery({ queryKey: ["perfume", "vendors"], queryFn: listPerfumeVendors });
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(openId);
  useEffect(() => { if (openId) setSelected(openId); }, [openId]);
  const rows = useMemo(() => (vendors.data?.vendors ?? []).filter((v) => !q.trim() || `${v.name} ${v.short_name ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name)), [vendors.data, q]);
  if (vendors.isError) return <ListErrorState title={tr("perfume.profiles.vendorsError", "Couldn't load the vendors")} status={0} message={(vendors.error as Error)?.message} onRetry={() => void vendors.refetch()} />;
  // Owner 2026-11-27 17:14 CT: "i click and it does not open the profile". It did open — below the 25-row list, off the
  // screen, with the address nowhere on it. Like QuickBooks' vendor center: the click opens the profile IN PLACE of the
  // list (top of the page, ?open=<id> in the address so Back returns), and "All suppliers" goes back to the list.
  const close = () => { setSelected(null); setParams((p) => { const n = new URLSearchParams(p); n.delete("open"); return n; }); };
  if (selected) return (
    <div className="space-y-3" data-testid="perfume-suppliers-panel">
      <Button type="button" variant="secondary" className="h-[30px] px-3 text-xs" onClick={close} data-testid="perfume-suppliers-back">{tr("perfume.profiles.all_suppliers", "← All suppliers")}</Button>
      <VendorProfile id={selected} onClose={close} />
    </div>
  );
  return (
    <div className="space-y-3" data-testid="perfume-suppliers-panel">
      <VendorLinkReview />
      <CompanyNameCheck />
      <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" aria-label={tr("perfume.profiles.suppliers", "Supplier profiles")}>
        <input type="search" className={`${ctl} w-full max-w-[420px]`} aria-label={tr("perfume.profiles.find_vendor", "Find a vendor")} placeholder={tr("perfume.profiles.find_vendor_ph", "Find a vendor")}
          value={q} onChange={(e) => setQ(e.target.value)} data-testid="perfume-suppliers-search" />
        <ParityTable<PerfumeVendor> selectable rows={rows} rowKey={(v) => v.id} loading={vendors.isLoading} storageKey="perfume-suppliers-v1" exportFilename="TIO vendors" exportExcel
          emptyText="No vendor matches." onRowClick={(v) => { setSelected(v.id); open("suppliers", v.id); window.scrollTo({ top: 0 }); }}
          columns={[
            { key: "name", label: "Vendor", sortable: true, render: (v) => <span className="font-semibold">{v.name}</span> },
            { key: "short_name", label: "Short name", sortable: true, render: (v) => v.short_name ?? DASH },
            { key: "kind", label: "Kind", sortable: true, render: (v) => KIND_TEXT[v.kind] ?? v.kind, exportValue: (v) => KIND_TEXT[v.kind] ?? v.kind },
            { key: "contact", label: "Contact", render: (v) => v.contact ?? DASH },
          ]} />
      </section>
    </div>
  );
}

function VendorProfile({ id, onClose }: { id: string; onClose: () => void }) {
  const { pushToast } = useToast();
  const prof = useQuery({ queryKey: ["perfume", "vendor-profile", id], queryFn: () => getPerfumeVendorProfile(id) });
  const [find, setFind] = useState("");
  const found = useQuery({ queryKey: ["perfume", "contacts", "vendor-link", find], queryFn: () => listPerfumeContacts({ q: find, limit: 20 }), enabled: find.trim().length >= 2 });
  const p: PerfumeVendorProfile | undefined = prof.data;
  if (prof.isError) return <ListErrorState title={tr("perfume.profiles.vendorError", "Couldn't load the vendor")} status={0} message={(prof.error as Error)?.message} onRetry={() => void prof.refetch()} />;
  if (!p) return null;
  const link = async (companyId: string | null) => {
    try { await setPerfumeVendorCompany(id, companyId); setFind(""); await prof.refetch(); pushToast(companyId ? "Linked to the company in Contacts" : "Unlinked", "success"); }
    catch (e) { pushToast(userFacingApiError(e, "Not saved"), "error"); }
  };
  const c = p.company;
  return (
    <section className="space-y-3 rounded-[3px] border border-[#D8E0E8] bg-white p-3" data-testid="perfume-vendor-profile" aria-label={p.vendor.name}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-card-title">{p.vendor.name}{p.vendor.short_name ? ` (${p.vendor.short_name})` : ""} · {KIND_TEXT[p.vendor.kind] ?? p.vendor.kind}</div>
        <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>{tr("perfume.profiles.close", "Close")}</Button>
      </div>
      <div className="text-xs" data-testid="perfume-vendor-company">
        <div className="text-section-header mb-1">{tr("perfume.profiles.company", "Company in Contacts")}</div>
        {c ? (<>
          <div className="flex flex-wrap items-center gap-3">
            <DocLink tab="vendors" id={c.id} testId="perfume-vendor-company-open">{c.name}</DocLink>
            <span className="text-[#64748B]">{[c.city, c.state, c.country].filter(Boolean).join(", ") || DASH}</span>
            {c.phone ? <span>{c.phone}</span> : null}
            {c.email ? <span>{c.email}</span> : null}
            {c.website ? <a className="text-[#14314F] underline" href={c.website.startsWith("http") ? c.website : `https://${c.website}`} target="_blank" rel="noreferrer">{c.website}</a> : null}
            <span>{`${c.people} ${c.people === 1 ? "person" : "people"}`}</span>
            <Button type="button" variant="secondary" className="h-[28px] px-2 text-xs" onClick={() => void link(null)} data-testid="perfume-vendor-unlink">{tr("perfume.profiles.unlink", "Unlink")}</Button>
          </div>
          <div className="mt-2"><CompanyRoleEditor company={c} /></div>
        </>) : (
          <div className="relative space-y-2">
            {(p.suggestions?.length ?? 0) > 0 ? (
              <div className="flex flex-wrap items-center gap-2" data-testid="perfume-vendor-suggestions">
                <span className="text-[#64748B]">{tr("perfume.profiles.suggest", "Same name in Contacts — click the right one to link:")}</span>
                {p.suggestions!.map((s) => (
                  <Button key={s.id} type="button" variant="secondary" className="h-[28px] px-2 text-left text-xs" onClick={() => void link(s.id)} data-testid={`perfume-vendor-suggest-${s.id}`}>
                    {s.name}{[s.city, s.country].filter(Boolean).length ? ` · ${[s.city, s.country].filter(Boolean).join(", ")}` : ""}{` · ${s.people} ${s.people === 1 ? "person" : "people"}`}
                  </Button>
                ))}
              </div>
            ) : null}
            <input className={`${ctl} w-[320px]`} aria-label={tr("perfume.profiles.link", "Link to a company in Contacts")} placeholder={tr("perfume.profiles.link_ph", "Not linked — type the company name")}
              value={find} onChange={(e) => setFind(e.target.value)} data-testid="perfume-vendor-link-find" />
            {find.trim().length >= 2 && (found.data?.rows?.length ?? 0) > 0 ? (
              <div className="absolute z-20 mt-1 max-h-64 w-[320px] overflow-y-auto border border-gray-300 bg-white shadow-lg" role="listbox">
                {found.data!.rows.map((r) => (
                  <button key={r.id} type="button" role="option" aria-selected={false} className="block w-full px-2 py-1 text-left text-xs hover:bg-gray-100" onClick={() => void link(r.id)} data-testid={`perfume-vendor-link-${r.id}`}>
                    <span className="font-semibold">{r.name}</span> <span className="text-[#64748B]">{[r.city, r.country].filter(Boolean).join(", ")}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>
      {p.vendor.kind === "buy" ? <ScentsxVendorLink vendorId={p.vendor.id} name={c?.name ?? p.vendor.name} /> : null}
      <div className="grid grid-cols-2 gap-[10px] md:grid-cols-6" data-testid="perfume-vendor-kpis">
        <KpiCard label={tr("perfume.profiles.kpi_items", "Items it carries")} number={p.items.toLocaleString("en-US")} disabled />
        <KpiCard label={tr("perfume.profiles.kpi_waiting", "Lines waiting in Review")} number={p.waiting.toLocaleString("en-US")} to="/perfume?tab=review" />
        <KpiCard label={tr("perfume.profiles.kpi_codes", "Their codes remembered")} number={p.codes.toLocaleString("en-US")} disabled />
        <KpiCard label={tr("perfume.profiles.kpi_words", "Their words remembered")} number={p.words.toLocaleString("en-US")} disabled />
        <KpiCard label={tr("perfume.profiles.kpi_pos", "Open purchase orders")} number={p.po_open.toLocaleString("en-US")} to="/perfume?tab=purchases" />
        <KpiCard label={tr("perfume.profiles.kpi_spend", "Bought (POs not cancelled)")} number={money(p.po_total_cents)} to="/perfume?tab=purchases" />
      </div>
      <ParityTable<PerfumeVendorProfile["lists"][number]> selectable cardTitle title={tr("perfume.profiles.lists", "Price lists")} rows={p.lists} rowKey={(l) => l.id} storageKey="perfume-vendor-lists-v1"
        exportFilename="TIO vendor lists" exportExcel emptyText="No lists from this vendor."
        columns={[
          { key: "list_date", label: "List date", cellClass: "text-right tabular-nums", render: (l) => usDate(l.list_date) },
          { key: "file_name", label: "File", render: (l) => l.label ?? l.file_name },
          { key: "state", label: "In use", render: (l) => (l.voided_at ? "Voided" : l.is_current ? "Current" : "Older"), exportValue: (l) => (l.voided_at ? "Voided" : l.is_current ? "Current" : "Older") },
          { key: "rows_saved", label: "Lines", kind: "number", cellClass: "text-right tabular-nums", render: (l) => l.rows_saved.toLocaleString("en-US") },
          { key: "matched", label: "Linked", kind: "number", cellClass: "text-right tabular-nums", render: (l) => l.matched.toLocaleString("en-US") },
          { key: "waiting", label: "Waiting", kind: "number", cellClass: "text-right tabular-nums", render: (l) => l.waiting.toLocaleString("en-US") },
        ]} />
      <PosTable rows={p.purchase_orders} storageKey="perfume-vendor-pos-v1" />
    </section>
  );
}

/* ------------------------------------------------------------------ Item profiles */

export function PerfumeItemProfilesPanel() {
  const { openId, open } = useOpenDoc();
  const [q, setQ] = useState("");
  // Owner 2026-11-27 07:40 CT: "Items creator should live in items".
  const [creating, setCreating] = useState(false);
  const hits = useQuery({ queryKey: ["perfume", "item-profile-search", q], queryFn: () => searchPerfumeItems(q), enabled: q.trim().length >= 2 });
  return (
    <div className="space-y-3" data-testid="perfume-items-panel">
      <section className="relative space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" aria-label={tr("perfume.profiles.items", "Item profiles")}>
        <div className="flex flex-wrap items-center gap-2">
        <Button type="button" className="h-[34px] px-3 text-xs" onClick={() => setCreating((x) => !x)} data-testid="perfume-items-new">{creating ? tr("perfume.profiles.cancel_new", "Cancel new item") : tr("perfume.profiles.new_item", "New item")}</Button>
        <input type="search" className={`${ctl} w-full max-w-[460px]`} aria-label={tr("perfume.profiles.find_item", "Find an item")} placeholder={tr("perfume.profiles.find_item_ph", "Find an item — name, brand, barcode or my code")}
          value={q} onChange={(e) => setQ(e.target.value)} data-testid="perfume-items-search" />
        </div>
        {q.trim().length >= 2 && (hits.data?.items?.length ?? 0) > 0 ? (
          <div className="absolute z-20 max-h-72 w-full max-w-[460px] overflow-y-auto border border-gray-300 bg-white shadow-lg" role="listbox">
            {hits.data!.items.map((it) => (
              <button key={it.id} type="button" role="option" aria-selected={false} className="block w-full px-2 py-1 text-left text-xs hover:bg-gray-100"
                onClick={() => { setQ(""); open("items", it.id); }} data-testid={`perfume-items-hit-${it.id}`}>
                <span className="font-semibold">{it.display_name}</span> <span className="text-[#64748B]">{[it.internal_code, ...(it.upcs ?? []).slice(0, 2)].filter(Boolean).join(" · ")}</span>
              </button>
            ))}
          </div>
        ) : null}
      </section>
      {creating ? <ItemCreator onCreated={(newId) => { setCreating(false); open("items", newId); }} /> : null}
      {openId && !creating ? <ItemProfile id={openId} /> : null}
    </div>
  );
}

function ItemProfile({ id }: { id: string }) {
  const { open } = useOpenDoc();
  const prof = useQuery({ queryKey: ["perfume", "item-profile", id], queryFn: () => getPerfumeItemProfile(id) });
  const lots = useQuery({ queryKey: ["perfume", "item-lots", id], queryFn: () => perfumeItemLots(id) });
  const merged = prof.data && "merged_into_id" in prof.data ? prof.data.merged_into_id : null;
  useEffect(() => { if (merged) open("items", merged); }, [merged, open]);
  if (prof.isError) return <ListErrorState title={tr("perfume.profiles.itemError", "Couldn't load the item")} status={0} message={(prof.error as Error)?.message} onRetry={() => void prof.refetch()} />;
  if (!prof.data || merged) return null;
  const p = prof.data as PerfumeItemProfile;
  const vendors = new Set(p.vendor_lines.map((l) => l.vendor_id)).size;
  return (
    <section className="space-y-3 rounded-[3px] border border-[#D8E0E8] bg-white p-3" data-testid="perfume-item-profile" aria-label={p.item.display_name}>
      <div className="text-card-title">{p.item.display_name}{p.item.internal_code ? ` · ${p.item.internal_code}` : ""}{p.item.flags.length ? ` · ${p.item.flags.join(", ")}` : ""}</div>
      <div className="grid grid-cols-2 gap-[10px] md:grid-cols-6" data-testid="perfume-item-kpis">
        <KpiCard label={tr("perfume.profiles.kpi_upcs", "Barcodes")} number={p.upcs.length.toLocaleString("en-US")} disabled />
        <KpiCard label={tr("perfume.profiles.kpi_vendors", "Vendors carrying it")} number={vendors.toLocaleString("en-US")} disabled />
        <KpiCard label={tr("perfume.profiles.kpi_best", "Best supplier cost")} number={money(p.best_cost_cents)} disabled />
        <KpiCard label={tr("perfume.profiles.kpi_quotes", "Quotes")} number={p.quotes.length.toLocaleString("en-US")} to="/perfume?tab=quotes" />
        <KpiCard label={tr("perfume.profiles.kpi_orders", "Sales orders")} number={p.orders.length.toLocaleString("en-US")} to="/perfume?tab=orders" />
        <KpiCard label={tr("perfume.profiles.kpi_item_pos", "Purchase orders")} number={p.purchase_orders.length.toLocaleString("en-US")} to="/perfume?tab=purchases" />
      </div>
      {/* Owner 2026-11-27 06:57 CT: "I click on an item and it does not take me to profile so I can edit" — every item link opens
          this profile, and the profile edits the item itself (the same editor as the Item file tab). */}
      <ItemFileEditor id={id} onChanged={() => void prof.refetch()} />
      {p.item.family_id ? <div className="text-xs"><span className="text-[#64748B]">{tr("perfume.profiles.family", "Family:")}</span> <DocLink tab="families" id={p.item.family_id}>{p.item.family ?? ""}</DocLink></div> : null}
      {p.item.flags.includes("TESTER") ? <RegularVersionLine itemId={id} regularId={p.item.regular_item_id ?? null} regularName={p.item.regular_name ?? null} onChanged={() => void prof.refetch()} /> : null}
      <ScentsxItemAccountLine itemId={id} />
      <ItemSitesBlock itemId={id} />
      <div className="text-xs" data-testid="perfume-item-upcs"><span className="text-[#64748B]">{tr("perfume.profiles.upcs", "Barcodes:")}</span> {p.upcs.length ? p.upcs.join(" · ") : DASH}</div>
      <ParityTable<PerfumeItemVendorLine> selectable cardTitle title={tr("perfume.profiles.vendor_lines", "Every vendor's line for it (their code, their words, their price)")} rows={p.vendor_lines} rowKey={(l) => l.id}
        storageKey="perfume-item-vendor-lines-v1" exportFilename="TIO item vendor lines" exportExcel emptyText="No current list carries it."
        columns={[
          { key: "vendor", label: "Vendor", render: (l) => <DocLink tab="suppliers" id={l.vendor_id}>{l.vendor}</DocLink>, exportValue: (l) => l.vendor },
          { key: "kind", label: "Kind", render: (l) => KIND_TEXT[l.kind] ?? l.kind, exportValue: (l) => KIND_TEXT[l.kind] ?? l.kind },
          { key: "sku", label: "Their code", render: (l) => l.sku ?? DASH, exportValue: (l) => l.sku ?? "" },
          { key: "description", label: "Their words", render: (l) => [l.brand, l.description, l.size_text].filter(Boolean).join(" ") },
          { key: "upc", label: "Barcode", render: (l) => l.upc ?? DASH, exportValue: (l) => l.upc ?? "" },
          { key: "price_cents", label: "Price", kind: "number", cellClass: "text-right tabular-nums", render: (l) => money(l.price_cents), exportValue: (l) => (l.price_cents == null ? "" : l.price_cents / 100) },
          { key: "match_method", label: "Linked by", render: (l) => METHOD_TEXT[l.match_method ?? ""] ?? DASH, exportValue: (l) => METHOD_TEXT[l.match_method ?? ""] ?? "" },
          { key: "list_date", label: "List date", cellClass: "text-right tabular-nums", render: (l) => usDate(l.list_date) },
        ]} />
      <ParityTable<PerfumeItemProfile["remembered"][number]> selectable cardTitle title={tr("perfume.profiles.remembered", "Remembered — any of these links to this item by itself")} rows={p.remembered} rowKey={(a) => a.id}
        storageKey="perfume-item-remembered-v1" exportFilename="TIO item remembered names" exportExcel emptyText="Nothing remembered yet."
        columns={[
          { key: "vendor", label: "Vendor", render: (a) => a.vendor },
          { key: "what", label: "What", render: (a) => (a.sku ? "Their code" : "Their words"), exportValue: (a) => (a.sku ? "Their code" : "Their words") },
          { key: "value", label: "Code / words", render: (a) => a.sku ?? a.text_key ?? DASH, exportValue: (a) => a.sku ?? a.text_key ?? "" },
          { key: "method", label: "From", render: (a) => (a.method === "confirmed" ? "Confirmed by me" : "Linked by the desk"), exportValue: (a) => (a.method === "confirmed" ? "Confirmed by me" : "Linked by the desk") },
        ]} />
      <ParityTable<PerfumeLot> selectable cardTitle title={tr("perfume.profiles.lots", "Stock and lots (FIFO — each lot keeps its vendor and PO)")} rows={lots.data?.lots ?? []} rowKey={(l) => l.id}
        storageKey="perfume-item-lots-v1" exportFilename="TIO item lots" exportExcel emptyText="No stock of this item yet."
        columns={[
          { key: "location_code", label: "Site", render: (l) => l.location_code },
          { key: "lot_code", label: "Lot", render: (l) => l.lot_code ?? DASH, exportValue: (l) => l.lot_code ?? "" },
          { key: "received_on", label: "Received", cellClass: "text-right tabular-nums", render: (l) => usDate(l.received_on) },
          { key: "qty_left", label: "Left", kind: "number", cellClass: "text-right tabular-nums", render: (l) => `${l.qty_left} of ${l.qty_in}`, exportValue: (l) => l.qty_left },
          { key: "unit_cost_cents", label: "Cost", kind: "number", cellClass: "text-right tabular-nums", render: (l) => money(l.unit_cost_cents), exportValue: (l) => Number(l.unit_cost_cents) / 100 },
          { key: "vendor", label: "Vendor", render: (l) => l.vendor ?? DASH, exportValue: (l) => l.vendor ?? "" },
          { key: "po_number", label: "PO", render: (l) => (l.po_id && l.po_number ? <DocLink tab="purchases" id={l.po_id}>{l.po_number}</DocLink> : DASH), exportValue: (l) => l.po_number ?? "" },
        ]} />
      <QuotesTable rows={p.quotes} storageKey="perfume-item-quotes-v1" />
      <OrdersTable rows={p.orders} storageKey="perfume-item-orders-v1" />
      <PosTable rows={p.purchase_orders} storageKey="perfume-item-pos-v1" />
    </section>
  );
}

/* ------------------------------------------------------------------ a company's activity (Contacts profile mounts this) */

export function PerfumeCompanyActivity({ companyId }: { companyId: string }) {
  const act = useQuery({ queryKey: ["perfume", "company-activity", companyId], queryFn: () => getPerfumeCompanyActivity(companyId) });
  if (act.isError) return <ListErrorState title={tr("perfume.profiles.activityError", "Couldn't load the activity")} status={0} message={(act.error as Error)?.message} onRetry={() => void act.refetch()} />;
  if (!act.data) return null;
  const a = act.data;
  return (
    <div className="space-y-3" data-testid="perfume-company-activity">
      <CompanyRoleEditor company={a.company} />
      <div className="grid grid-cols-2 gap-[10px] md:grid-cols-6">
        <KpiCard label={tr("perfume.profiles.kpi_c_quotes", "Quotes")} number={a.quotes.length.toLocaleString("en-US")} to="/perfume?tab=quotes" />
        <KpiCard label={tr("perfume.profiles.kpi_c_quoted", "Quoted (not rejected)")} number={money(a.quoted_cents)} to="/perfume?tab=quotes" />
        <KpiCard label={tr("perfume.profiles.kpi_c_orders", "Sales orders")} number={a.orders.length.toLocaleString("en-US")} to="/perfume?tab=orders" />
        <KpiCard label={tr("perfume.profiles.kpi_c_ordered", "Ordered (not cancelled)")} number={money(a.ordered_cents)} to="/perfume?tab=orders" />
        <KpiCard label={tr("perfume.profiles.kpi_c_pos", "POs to it as a vendor")} number={a.purchase_orders.length.toLocaleString("en-US")} to="/perfume?tab=purchases" />
        <KpiCard label={tr("perfume.profiles.kpi_c_bought", "Bought from it")} number={money(a.bought_cents)} to="/perfume?tab=purchases" />
      </div>
      {a.vendors.length ? (
        <div className="text-xs" data-testid="perfume-company-vendors">
          <span className="text-[#64748B]">{tr("perfume.profiles.as_vendor", "Its price lists on the desk:")}</span>{" "}
          {a.vendors.map((v, i) => <span key={v.id}>{i ? ", " : ""}<DocLink tab="suppliers" id={v.id}>{v.name}</DocLink></span>)}
        </div>
      ) : null}
      <QuotesTable rows={a.quotes} storageKey="perfume-company-quotes-v1" />
      <OrdersTable rows={a.orders} storageKey="perfume-company-orders-v1" />
      <PosTable rows={a.purchase_orders} storageKey="perfume-company-pos-v1" />
    </div>
  );
}

/** A tester's regular version (owner 2026-11-27 12:03 CT): the tester sells at the price level's testers % of this item's price. */
function RegularVersionLine({ itemId, regularId, regularName, onChanged }: { itemId: string; regularId: string | null; regularName: string | null; onChanged: () => void }) {
  const { pushToast } = useToast();
  const [picking, setPicking] = useState(false);
  const set = (rid: string | null) => void updatePerfumeItemFile(itemId, { regular_item_id: rid }).then(() => { setPicking(false); onChanged(); })
    .catch((e: unknown) => pushToast(userFacingApiError(e, "Not saved"), "error"));
  return (
    <div className="space-y-1 text-xs" data-testid="perfume-item-regular">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[#64748B]">{tr("perfume.profiles.regular", "Regular version (testers sell at the level's testers % of its price):")}</span>
        {regularId ? <DocLink tab="items" id={regularId}>{regularName ?? ""}</DocLink> : <span className="text-[#B91C1C]">{tr("perfume.profiles.no_regular", "None linked — priced by its own cost")}</span>}
        <Button type="button" variant="secondary" className="h-[26px] px-2 text-xs" onClick={() => setPicking((x) => !x)} data-testid="perfume-item-regular-change">{tr("perfume.profiles.change", "Change")}</Button>
        {regularId ? <Button type="button" variant="secondary" className="h-[26px] px-2 text-xs" onClick={() => set(null)} data-testid="perfume-item-regular-clear">{tr("perfume.profiles.unlink", "Unlink")}</Button> : null}
      </div>
      {picking ? <ItemFinder testId="perfume-item-regular-find" onPick={(rid) => set(rid)} /> : null}
    </div>
  );
}
