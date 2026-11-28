/**
 * PERFUME-CONTACTS — the TIO Perfumes contacts database (owner 2026-11-25 22:04 CT) with how, where and when each contact
 * started, vendors that are also customers (22:11 CT), and the Google business search that adds prospects with phone,
 * website, hours and rating (22:09 CT: "Yes ask for it and I want is possible all the data").
 *
 * The first Google batch is ONE city (Nuevo Laredo) — research session ROUND P1.4 #5; the full matrix unlocks only after a
 * finished batch. Every batch shows how many Google requests it can use and waits for a second click.
 */
import { useEffect, useState } from "react";
import { useOpenDoc } from "./perfumeDocParts";
import { useSearchParams } from "react-router-dom";
import { PerfumeCompanyProfile } from "./PerfumeCompanyProfile";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { MultiSelectDropdown } from "../../components/forms/MultiSelectDropdown";
import { ParityTable } from "../../components/parity/ParityTable";
import { Modal } from "../../components/Modal";
import { KpiCard } from "../../components/layout/KpiCard";
import { useToast } from "../../components/Toast";
import { ListErrorState } from "../../components/ListErrorState";
import { userFacingApiError } from "../../lib/api-error-message";
import { ApiError } from "../../api/client";
import { listCustomers } from "../../api/catalog-customers";
import { formatDateTimeUS } from "../../lib/formatDate";
import {
  deletePerfumeContacts, restorePerfumeContacts, mergeOnePerfumeDuplicate, approvePerfumeContacts, unapprovePerfumeContacts, type PerfumeContactDeleteResult,
  getPerfumeGooglePlan, importPerfumeContacts, listPerfumeContacts, perfumeGoogleSearch, startPerfumeGoogleRun, stopPerfumeGoogleRun,
  type PerfumeContactFacet, type PerfumeContactImportTally, type PerfumeContactPicks, type PerfumeContactRole, type PerfumeContactRow, type PerfumeGoogleResult, type PerfumeGoogleRun,
} from "../../api/perfume";
import { createScentsxCustomer, getEligibleScentsxCustomers, getScentsxCompany, linkScentsxCustomer, type EligibleScentsxContact } from "../../api/scentsx";
import { tr } from "./perfumeI18n";
import { PerfumeNameFormatCard } from "./PerfumeNameFormatCard";
import { PerfumeCreateCompany } from "./PerfumeCreateCompany";
import { PerfumeDuplicatesCard } from "./PerfumeDuplicatesCard";
import { PerfumeDupRecommendations } from "./PerfumeDupRecommendations";

const DASH = "—";
const ROLE_TEXT: Record<PerfumeContactRole, string> = { vendor: "Vendor", customer: "Customer", both: "Vendor + customer" };
const ROLE_CLASS: Record<PerfumeContactRole, string> = { vendor: "bg-[#14314F]", customer: "bg-[#1F6B32]", both: "bg-[#8A4208]" };
const usDate = (d: string | null | undefined) => (d ? `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)}` : DASH);
const n = (v: number | null | undefined) => (v == null ? DASH : v.toLocaleString("en-US"));
const ctl = "h-[34px] rounded-sm border border-[#C6D1DC] bg-white px-2 text-xs";

/** Owner 2026-11-26 15:56 CT: "the boxes are not drop down filter combobox so i can typ city etc." — every box types to narrow. */
const CONTACT_FILTERS: Array<{ facet: PerfumeContactFacet; pick: keyof PerfumeContactPicks; label: string; all: string }> = [
  { facet: "country", pick: "countries", label: "Country", all: "All countries" },
  { facet: "state", pick: "states", label: "State", all: "All states" },
  { facet: "city", pick: "cities", label: "City", all: "All cities" },
  // Owner 2026-11-27 16:54 CT "not mix": the old Category box was three things — now Relationship, Industry and Review tag.
  { facet: "relationship", pick: "relationships", label: "Relationship", all: "Every relationship" },
  { facet: "industry", pick: "industries", label: "Industry", all: "Every industry" },
  { facet: "tag", pick: "tags", label: "Review tag", all: "Any review tag" },
  { facet: "source", pick: "sources", label: "Source", all: "Every source" },
  { facet: "how", pick: "hows", label: "How it started", all: "Any start" },
  { facet: "region", pick: "regions", label: "Region", all: "All regions" },
  { facet: "ctype", pick: "ctypes", label: "Customer type", all: "All customer types" },
  { facet: "vtype", pick: "vtypes", label: "Vendor type", all: "All vendor types" },
  { facet: "segment", pick: "segments", label: "Business type", all: "All business types" },
  { facet: "status", pick: "statuses", label: "Status", all: "Any status" },
  { facet: "show", pick: "shows", label: "Trade show", all: "Any trade show" },
  { facet: "reach", pick: "reach", label: "Email / phone", all: "Email or not" },
  { facet: "kind", pick: "kinds", label: "Source kind", all: "Every source kind" },
];

function RoleBadge({ role }: { role: PerfumeContactRole | null }) {
  if (!role) return <span className="text-gray-400">{DASH}</span>;
  return <span className={`text-section-header inline-block rounded-sm px-1.5 text-white ${ROLE_CLASS[role]}`}>{ROLE_TEXT[role]}</span>;
}

/** `initialRole`: the Leads module's Vendors / Customers tabs open this list already on that role (owner 2026-11-26 17:38 CT "where is vendors and customers?"). */
export function PerfumeContactsPanel({ initialRole = "all" }: { initialRole?: PerfumeContactRole | "none" | "all" } = {}) {
  const [role, setRole] = useState<PerfumeContactRole | "none" | "all">(initialRole);
  const isLeads = initialRole === "all" || initialRole === "none";
  const [source, setSource] = useState<string>("");
  const [q, setQ] = useState("");
  // ?open=<company id> opens that company's profile (a supplier's company link, owner 2026-11-27 17:25 CT: one record).
  const { openId } = useOpenDoc();
  const [, setParams] = useSearchParams();
  const clearOpen = () => setParams((prev) => { const n = new URLSearchParams(prev); n.delete("open"); return n; });
  const [selected, setSelected] = useState<string | null>(openId);
  useEffect(() => { if (openId) setSelected(openId); }, [openId]);
  // The profile mounts under the list: bring it on screen when one is opened (same fix as Supplier profiles, #29981).
  useEffect(() => { if (selected) setTimeout(() => document.querySelector('[data-testid="perfume-contact-profile"]')?.scrollIntoView?.({ block: "start" }), 50); }, [selected]);
  const [picks, setPicks] = useState<PerfumeContactPicks>({});
  // Owner 2026-11-28 14:30 CT: Leads = not approved; Customers / Vendors = approved only (one record, it changes list when approved).
  const stage: "lead" | "approved" = isLeads ? "lead" : "approved";
  const list = useQuery({ queryKey: ["perfume", "contacts", stage, role, source, q, picks], queryFn: () => listPerfumeContacts({ stage, role, source, q, limit: 300, ...picks }) });
  const anyPick = Object.values(picks).some((v) => (v?.length ?? 0) > 0);
  // Owner 2026-11-27 21:39 CT: select several → Delete (contacts that are not for the business). Confirmed in the page, never a browser dialog.
  const { pushToast } = useToast();
  const [checked, setChecked] = useState<string[]>([]);
  const [askDelete, setAskDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastDeleted, setLastDeleted] = useState<{ ids: string[]; result: PerfumeContactDeleteResult } | null>(null);
  const doDelete = async () => {
    setBusy(true);
    try {
      const ids = [...checked];
      const r = await deletePerfumeContacts(ids);
      const keptIds = new Set(r.kept.map((k) => k.id));
      setLastDeleted({ ids: ids.filter((x) => !keptIds.has(x)), result: r });
      pushToast(`${r.deleted.toLocaleString("en-US")} deleted (${r.people.toLocaleString("en-US")} people)${r.kept.length ? ` · ${r.kept.length} kept — they have business on file` : ""}`, r.kept.length ? "info" : "success");
      setChecked([]); setAskDelete(false);
      if (selected && !keptIds.has(selected) && ids.includes(selected)) setSelected(null);
      await list.refetch();
    } catch (e) { pushToast(userFacingApiError(e, "Not deleted"), "error"); } finally { setBusy(false); }
  };
  // Owner 2026-11-28 13:46 CT: "ALL LISTS SELECTOR HAVE A CONFIRM OR MERGE, OR DELETE". Select 2+ → Merge: pick the one that stays,
  // Confirm. The same engine as the duplicate pop-up (POST /contacts/duplicates/merge-one): people, quotes, orders, vendor records
  // and history move to the one that stays; the others become its merged locations (history records it).
  const [askMerge, setAskMerge] = useState(false);
  const [keepId, setKeepId] = useState<string | null>(null);
  const checkedRows = (list.data?.rows ?? []).filter((r) => checked.includes(r.id));
  const doMerge = async () => {
    if (!keepId) return;
    setBusy(true);
    try {
      const r = await mergeOnePerfumeDuplicate(keepId, checked.filter((x) => x !== keepId));
      pushToast(`${r.merged.toLocaleString("en-US")} merged into ${checkedRows.find((x) => x.id === keepId)?.name ?? "the one that stays"}`, "success");
      setChecked([]); setAskMerge(false); setKeepId(null);
      await list.refetch();
    } catch (e) { pushToast(userFacingApiError(e, "Not merged"), "error"); } finally { setBusy(false); }
  };
  const [askApprove, setAskApprove] = useState<PerfumeContactRole | null>(null);
  const [askSendBack, setAskSendBack] = useState(false);
  const doApprove = async (r: PerfumeContactRole) => {
    setBusy(true);
    try {
      const res = await approvePerfumeContacts([...checked], r);
      pushToast(`${res.approved.toLocaleString("en-US")} approved as ${r === "both" ? "vendor + customer" : r} — now under ${r === "vendor" ? "Vendors" : r === "customer" ? "Customers" : "Customers and Vendors"}`, "success");
      setChecked([]); setAskApprove(null); await list.refetch();
    } catch (e) { pushToast(userFacingApiError(e, "Not approved"), "error"); } finally { setBusy(false); }
  };
  const doSendBack = async () => {
    setBusy(true);
    try {
      const res = await unapprovePerfumeContacts([...checked]);
      pushToast(`${res.sent_back.toLocaleString("en-US")} sent back to Leads${res.kept.length ? ` · ${res.kept.length} kept — ${res.kept.slice(0, 3).map((k) => `${k.name} (${k.reason})`).join(" · ")}` : ""}`, res.kept.length ? "info" : "success");
      setChecked([]); setAskSendBack(false); await list.refetch();
    } catch (e) { pushToast(userFacingApiError(e, "Not sent back"), "error"); } finally { setBusy(false); }
  };
  const undoDelete = async () => {
    if (!lastDeleted) return;
    setBusy(true);
    try { const r = await restorePerfumeContacts(lastDeleted.ids); pushToast(`${r.restored.toLocaleString("en-US")} put back`, "success"); setLastDeleted(null); await list.refetch(); }
    catch (e) { pushToast(userFacingApiError(e, "Not put back"), "error"); } finally { setBusy(false); }
  };

  // Owner 2026-11-28 13:57 CT: a company opens its own PROFILE PAGE in place (Customers stays Customers) — not a block under the list.
  if (selected) {
    const back = initialRole === "customer" ? "Back to Customers" : initialRole === "vendor" ? "Back to Vendors" : "Back to Leads";
    return <PerfumeCompanyProfile id={selected} backLabel={back} onClose={() => { setSelected(null); clearOpen(); }} />;
  }
  if (list.isError) {
    return <ListErrorState title={tr("perfume.contacts.loadError", "Couldn't load the contacts")} status={0} message={(list.error as Error)?.message} onRetry={() => void list.refetch()} />;
  }
  const c = list.data?.counts;
  const roleBtn = (k: typeof role, label: string, count: number | undefined) => (
    <button key={k} type="button" aria-pressed={role === k} onClick={() => setRole(k)} data-testid={`perfume-contacts-role-${k}`}
      className={`h-[34px] rounded-sm border px-3 text-xs ${role === k ? "border-[#14314F] bg-[#14314F] font-semibold text-white" : "border-[#C6D1DC] bg-[var(--surface-unselected)] text-[#1F2A44] hover:bg-[var(--surface-hover)]"}`}>
      {label} {count == null ? "" : count.toLocaleString("en-US")}
    </button>
  );

  return (
    <div className="space-y-3" data-testid="perfume-contacts-panel">
      <div className="grid grid-cols-2 gap-[10px] md:grid-cols-7" data-testid="perfume-contacts-kpis">
        <KpiCard label={isLeads ? "Leads — not approved yet" : initialRole === "vendor" ? "Approved vendors" : "Approved customers"} number={n(isLeads ? c?.leads : initialRole === "vendor" ? c?.approved_vendors : c?.approved_customers)} onClick={() => { setRole("all"); setSource(""); }} />
        <KpiCard label={`All companies · ${n(c?.people)} people`} number={n(c?.companies)} disabled disabledReason="Every company on file — leads plus approved customers and vendors." />
        <KpiCard label={tr("perfume.contacts.vendors", "Vendors")} number={n(c?.vendors)} onClick={() => setRole("vendor")} />
        <KpiCard label={tr("perfume.contacts.customers", "Customers")} number={n(c?.customers)} onClick={() => setRole("customer")} />
        <KpiCard label={tr("perfume.contacts.vendor_customer", "Vendor + customer")} number={n(c?.both)} onClick={() => setRole("both")} />
        <KpiCard label={tr("perfume.contacts.from_google", "From Google")} number={n(c?.from_google)} onClick={() => setSource("Google")} />
        <KpiCard label={tr("perfume.contacts.needs_email_never_in_a_send", "Needs email — never in a send")} number={n(c?.needs_email)} disabled disabledReason="Companies with no email on file; Google gives no email." />
      </div>

      {/* Owner 2026-11-27 18:21 CT: "the google business search should be in leads not customers, customers is for customer accounts and
          their data not leads etc., vendors the same." Lead-finding tools (import, Google, name format) live on All leads only; Vendors
          and Customers get their own Create pop-up. */}
      {isLeads ? (
        <>
          <ImportCard onDone={() => void list.refetch()} />
          <GoogleCard onChanged={() => void list.refetch()} />
          <PerfumeNameFormatCard onDone={() => void list.refetch()} />
        </>
      ) : (
        <>
          <PerfumeCreateCompany role={initialRole === "vendor" ? "vendor" : "customer"} onCreated={(name) => { setQ(name); void list.refetch(); }} onOpen={(id) => setSelected(id)} />
          {/* L.29 E1 (CC3): the customers' purchase-history workbook creates the customer companies — on Customers, not Leads (owner 18:21 CT). */}
          {initialRole === "customer" ? <CustomerSalesImportCard onDone={() => void list.refetch()} /> : null}
          {/* L.29 E2 (CC3): bulk-link eligible customers to ScentsX (have email, no link yet). */}
          {initialRole === "customer" ? <BulkMakeScentsxCustomerCard onDone={() => void list.refetch()} /> : null}
        </>
      )}
      <PerfumeDuplicatesCard onDone={() => void list.refetch()} />
      <PerfumeDupRecommendations onDone={() => void list.refetch()} />

      <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" aria-label={tr("perfume.contacts.contacts", "Contacts")}>
        <div className="flex flex-wrap items-center gap-2">
          {roleBtn("all", "All", c?.companies)}
          {roleBtn("vendor", "Vendors", c?.vendors)}
          {roleBtn("customer", "Customers", c?.customers)}
          {roleBtn("both", "Vendor + customer", c?.both)}
          {roleBtn("none", "Not classified", c?.unclassified)}
          {CONTACT_FILTERS.map((f) => (
            <MultiSelectDropdown
              key={f.facet}
              label={f.label}
              allLabel={f.all}
              searchable
              data-testid={`perfume-contacts-filter-${f.facet}`}
              options={(list.data?.facets?.[f.facet] ?? []).map((o) => ({ value: o.value, label: `${o.value} (${o.count.toLocaleString()})` }))}
              selected={picks[f.pick] ?? (f.facet === "source" && source ? [source] : [])}
              onChange={(next) => { if (f.facet === "source") setSource(""); setPicks((p) => ({ ...p, [f.pick]: next })); }}
            />
          ))}
          {anyPick || source ? (
            <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" data-testid="perfume-contacts-clear"
              onClick={() => { setPicks({}); setSource(""); }}>{tr("perfume.contacts.clear", "Clear filters")}</Button>
          ) : null}
          <input type="search" aria-label={tr("perfume.contacts.search_contacts", "Search contacts")} placeholder={`Search all ${n(c?.companies)} — company, person, email, phone, city`}
            className={`${ctl} min-w-[240px] flex-1`} value={q} onChange={(e) => setQ(e.target.value)} data-testid="perfume-contacts-search" />
        </div>
        <div className="flex flex-wrap items-center gap-2" data-testid="perfume-contacts-bulk">
          <Button type="button" variant="danger" className="h-[34px] px-3 text-xs" disabled={!checked.length || busy} onClick={() => setAskDelete(true)} data-testid="perfume-contacts-delete">
            {`Delete ${checked.length ? checked.length.toLocaleString("en-US") + " " : ""}selected`}
          </Button>
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={checked.length < 2 || busy}
            onClick={() => { setKeepId(checked[0] ?? null); setAskMerge(true); }} data-testid="perfume-contacts-merge">
            {`Merge ${checked.length >= 2 ? checked.length.toLocaleString("en-US") + " " : ""}selected`}
          </Button>
          {isLeads ? (["customer", "vendor", "both"] as const).map((r) => (
            <Button key={r} type="button" variant="primary" className="h-[34px] px-3 text-xs" disabled={!checked.length || busy} onClick={() => setAskApprove(r)} data-testid={`perfume-contacts-approve-${r}`}>
              {`Approve as ${r === "both" ? "vendor + customer" : r}${checked.length ? ` (${checked.length.toLocaleString("en-US")})` : ""}`}
            </Button>
          )) : (
            <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={!checked.length || busy} onClick={() => setAskSendBack(true)} data-testid="perfume-contacts-sendback">
              {`Send back to leads${checked.length ? ` (${checked.length.toLocaleString("en-US")})` : ""}`}
            </Button>
          )}
          {lastDeleted && lastDeleted.ids.length ? (
            <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={busy} onClick={() => void undoDelete()} data-testid="perfume-contacts-undo-delete">
              {`Undo — put back the ${lastDeleted.result.deleted.toLocaleString("en-US")} just deleted`}
            </Button>
          ) : null}
          {lastDeleted?.result.kept.length ? (
            <span className="text-xs text-[#8A4208]" data-testid="perfume-contacts-kept">
              {`Kept ${lastDeleted.result.kept.length}: ${lastDeleted.result.kept.slice(0, 5).map((k) => `${k.name} (${k.reason})`).join(" · ")}${lastDeleted.result.kept.length > 5 ? " …" : ""}`}
            </span>
          ) : null}
        </div>
        <ParityTable<PerfumeContactRow> selectable selectedKeys={checked} onSelectionChange={setChecked}
          rows={list.data?.rows ?? []}
          rowKey={(r) => r.id}
          loading={list.isLoading}
          storageKey="perfume-contacts-v1"

          exportFilename="TIO contacts"

          exportExcel
          emptyText={q || role !== "all" || source || anyPick ? "No contact matches these filters." : "No contacts yet — the Master Database import fills this list."}
          onRowClick={(r) => setSelected(r.id)}
          columns={[
            { key: "name", label: "Company", sortable: true, render: (r) => <span className="font-semibold text-[#14314F]">{r.name}</span> },
            { key: "main_contact", label: "Contact", sortable: true, render: (r) => (r.main_contact ? <span>{r.main_contact}{r.people > 1 ? <span className="text-[#64748B]">{` +${r.people - 1}`}</span> : null}</span> : DASH), exportValue: (r) => r.main_contact ?? "" },
            { key: "main_email", label: "Email", sortable: true, render: (r) => (r.main_email ? <a className="underline" href={`mailto:${r.main_email}`} onClick={(e) => e.stopPropagation()}>{r.main_email}</a> : <span className="text-[#8A4208]">{tr("perfume.contacts.needs_email", "needs email")}</span>), exportValue: (r) => r.main_email ?? "" },
            { key: "main_phone", label: "Phone", sortable: true, render: (r) => r.main_phone ?? DASH, exportValue: (r) => r.main_phone ?? "" },
            { key: "role", label: "Role", sortable: true, render: (r) => <RoleBadge role={r.role} /> },
            { key: "city", label: "City · state · country", sortable: true, render: (r) => [r.city, r.state, r.country].filter(Boolean).join(" · ") || DASH },
            { key: "how_started", label: "How it started", sortable: true, render: (r) => r.how_started ?? DASH },
            { key: "website", label: "Website", sortable: true, render: (r) => (r.website ? <a href={r.website} target="_blank" rel="noreferrer" className="text-[#14314F] underline">{r.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a> : DASH) },
            { key: "people", label: "People", sortable: true, kind: "number", cellClass: "text-right tabular-nums" },
            { key: "with_email", label: "With email", sortable: true, kind: "number", cellClass: "text-right tabular-nums" },
            { key: "first_contact_on", label: "First contact", sortable: true, cellClass: "text-right tabular-nums", render: (r) => usDate(r.first_contact_on) },
            { key: "last_email_on", label: "Last email", sortable: true, cellClass: "text-right tabular-nums", render: (r) => usDate(r.last_email_on) },
            { key: "source", label: "Source", sortable: true },
          ]}
        />
        <div className="text-xs text-[#64748B]">{list.data ? `Showing ${list.data.rows.length.toLocaleString("en-US")} of ${list.data.total.toLocaleString("en-US")}` : ""}</div>
      </section>

      {askDelete ? (
        <Modal open onClose={() => setAskDelete(false)} title={`Delete ${checked.length.toLocaleString("en-US")} contact${checked.length === 1 ? "" : "s"}?`} size="sm" data-testid="perfume-contacts-delete-modal">
          <div className="space-y-3 text-xs">
            <p>{`The ${checked.length.toLocaleString("en-US")} selected compan${checked.length === 1 ? "y" : "ies"} and their people leave Vendors, Customers and All leads. Each one's history records the delete, and "Undo" puts them back.`}</p>
            <p>A company that already has quotes, orders, purchase orders, price lists, a ScentsX link, an account, a pagaré or a resale certificate is kept — you are told which and why.</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={() => setAskDelete(false)}>{tr("perfume.cat.cancel", "Cancel")}</Button>
              <Button type="button" variant="danger" className="h-[34px] px-3 text-xs" disabled={busy} onClick={() => void doDelete()} data-testid="perfume-contacts-delete-confirm">
                {`Delete ${checked.length.toLocaleString("en-US")}`}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
      {askApprove ? (
        <Modal open onClose={() => setAskApprove(null)} title={`Approve ${checked.length.toLocaleString("en-US")} as ${askApprove === "both" ? "vendor + customer" : askApprove}?`} size="sm" data-testid="perfume-contacts-approve-modal">
          <div className="space-y-3 text-xs">
            <p>{`The ${checked.length.toLocaleString("en-US")} selected leave Leads and show under ${askApprove === "vendor" ? "Vendors" : askApprove === "customer" ? "Customers" : "Customers and Vendors"}. Same record — nothing is copied. Each one's history records the approval; "Send back to leads" undoes it.`}</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={() => setAskApprove(null)}>{tr("perfume.cat.cancel", "Cancel")}</Button>
              <Button type="button" variant="primary" className="h-[34px] px-3 text-xs" disabled={busy} onClick={() => void doApprove(askApprove)} data-testid="perfume-contacts-approve-confirm">Approve</Button>
            </div>
          </div>
        </Modal>
      ) : null}
      {askSendBack ? (
        <Modal open onClose={() => setAskSendBack(false)} title={`Send ${checked.length.toLocaleString("en-US")} back to Leads?`} size="sm" data-testid="perfume-contacts-sendback-modal">
          <div className="space-y-3 text-xs">
            <p>They leave this list and return to Leads until approved again. A company with quotes, orders, purchase orders, price lists, a ScentsX link or an account stays — you are told which and why.</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={() => setAskSendBack(false)}>{tr("perfume.cat.cancel", "Cancel")}</Button>
              <Button type="button" variant="danger" className="h-[34px] px-3 text-xs" disabled={busy} onClick={() => void doSendBack()} data-testid="perfume-contacts-sendback-confirm">Send back</Button>
            </div>
          </div>
        </Modal>
      ) : null}
      {askMerge ? (
        <Modal open onClose={() => setAskMerge(false)} title={`Merge ${checked.length.toLocaleString("en-US")} companies into one?`} size="sm" data-testid="perfume-contacts-merge-modal">
          <div className="space-y-3 text-xs">
            <p>Pick the company that stays. The others merge into it: their people, quotes, orders, vendor records and history move to it, and they leave the lists as its merged locations.</p>
            <fieldset className="space-y-1" aria-label="Company that stays">
              {checkedRows.map((r) => (
                <label key={r.id} className="flex items-center gap-2">
                  <input type="radio" name="perfume-merge-keep" aria-label={`Keep ${r.name}`} checked={keepId === r.id} onChange={() => setKeepId(r.id)} data-testid={`perfume-contacts-merge-keep-${r.id}`} />
                  <span className="font-semibold">{r.name}</span>
                  <span className="text-[#64748B]">{[r.city, r.state, r.country].filter(Boolean).join(" · ") || DASH}</span>
                  <span className="text-[#64748B]">{`${r.people} people`}</span>
                </label>
              ))}
              {checkedRows.length < checked.length ? <p className="text-[#8A4208]">{`${checked.length - checkedRows.length} selected are not on this page — clear the filters to see them before merging.`}</p> : null}
            </fieldset>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={() => setAskMerge(false)}>{tr("perfume.cat.cancel", "Cancel")}</Button>
              <Button type="button" variant="primary" className="h-[34px] px-3 text-xs" disabled={busy || !keepId || checkedRows.length < checked.length} onClick={() => void doMerge()} data-testid="perfume-contacts-merge-confirm">
                {`Confirm merge into ${checkedRows.find((x) => x.id === keepId)?.name ?? "…"}`}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

/** The Master Database and the research files come in as one JSON-lines file each; sent in batches of 500, one transaction each. */
function ImportCard({ onDone }: { onDone: () => void }) {
  const { pushToast } = useToast();
  const [state, setState] = useState<{ file: string; done: number; total: number; tally: PerfumeContactImportTally | null; error: string | null } | null>(null);
  const run = async (f: File) => {
    const lines = (await f.text()).split(/\r?\n/).filter((l) => l.trim());
    let records: unknown[];
    try { records = lines.map((l) => JSON.parse(l)); } catch { pushToast(`${f.name} is not a contacts file (one JSON record per line).`, "error"); return; }
    const sum: PerfumeContactImportTally = { records: 0, inserted: 0, matched: 0, by: {}, people_inserted: 0, people_existing: 0, origins: 0 };
    setState({ file: f.name, done: 0, total: records.length, tally: null, error: null });
    for (let i = 0; i < records.length; i += 500) {
      try {
        const t = await importPerfumeContacts(records.slice(i, i + 500));
        for (const k of ["records", "inserted", "matched", "people_inserted", "people_existing", "origins"] as const) sum[k] += t[k];
        for (const [k, v] of Object.entries(t.by)) sum.by[k] = (sum.by[k] ?? 0) + v;
        setState({ file: f.name, done: Math.min(i + 500, records.length), total: records.length, tally: { ...sum, by: { ...sum.by } }, error: null });
      } catch (e) {
        setState({ file: f.name, done: i, total: records.length, tally: { ...sum }, error: userFacingApiError(e, "Import stopped") });
        return;
      }
    }
    pushToast(`${f.name}: ${sum.inserted.toLocaleString("en-US")} new · ${sum.matched.toLocaleString("en-US")} already in the list`, "success");
    onDone();
  };
  const busy = state != null && state.done < state.total && !state.error;
  return (
    <section className="flex flex-wrap items-center gap-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3 text-xs" aria-label={tr("perfume.contacts.import_contacts", "Import contacts")} data-testid="perfume-contacts-import">
      <span className="text-card-title">{tr("perfume.contacts.import_contacts_file", "Import contacts file")}</span>
      <input type="file" accept=".jsonl,.json,.txt" aria-label={tr("perfume.contacts.contacts_file", "Contacts file")} disabled={busy} data-testid="perfume-contacts-import-file"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void run(f); }} />
      {state ? (
        <span data-testid="perfume-contacts-import-status">
          {state.file}: {state.done.toLocaleString("en-US")}{" "}{tr("perfume.contacts.of", "of")}{" "}{state.total.toLocaleString("en-US")}{" "}{tr("perfume.contacts.records", "records")}{state.tally ? ` · ${state.tally.inserted.toLocaleString("en-US")} new · ${state.tally.matched.toLocaleString("en-US")} already in the list (${Object.entries(state.tally.by).map(([k, v]) => `${k} ${v.toLocaleString("en-US")}`).join(" · ") || "—"}) · ${state.tally.people_inserted.toLocaleString("en-US")} people · ${state.tally.origins.toLocaleString("en-US")} origins` : ""}
          {state.error ? <b className="text-red-700"> — {state.error}</b> : null}
        </span>
      ) : <span className="text-[#64748B]">{tr("perfume.contacts.master_database_or_research_duplicate", "Master Database or a research file — duplicates are matched, never doubled.")}</span>}
    </section>
  );
}

type SalesImportPreview = { usaCount: number; mxCount: number; records: unknown[] };

/** E1 (Lead L.29 2026-11-27): import TIO Perfumes USA + MX customer purchase history from the standard Excel report.
 *  Parses "Clientes USA" (row 5+) and "Clientes México" (row 5+) sheets.  NO balances imported — name + role + country only.
 *  Preview → owner Apply → POST /api/v1/perfume/contacts/import in batches of 500. */
export function CustomerSalesImportCard({ onDone }: { onDone: () => void }) {
  const { pushToast } = useToast();
  const [preview, setPreview] = useState<SalesImportPreview | null>(null);
  const [state, setState] = useState<{ done: number; total: number; tally: PerfumeContactImportTally | null; error: string | null } | null>(null);
  const [parsing, setParsing] = useState(false);

  const parse = async (f: File) => {
    setParsing(true);
    setPreview(null);
    setState(null);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await f.arrayBuffer());
      const usaSheet = wb.worksheets.find((s) => /clientes.?usa/i.test(s.name));
      const mxSheet = wb.worksheets.find((s) => /m[eé]xico|mexico/i.test(s.name));
      if (!usaSheet || !mxSheet) { pushToast("Could not find 'Clientes USA' and 'Clientes México' sheets in this file.", "error"); return; }
      const records: unknown[] = [];
      // USA sheet: row 4 = headers, row 5+ = data. Col 2 = Customer Name.
      usaSheet.eachRow((row, n) => {
        if (n < 5) return;
        const name = String(row.getCell(2).value ?? "").trim();
        if (!name) return;
        records.push({ company: { name, role: "customer", country: "US", source: "TIO Sales History 2020-2026", status: "active" }, people: [] });
      });
      const usaCount = records.length;
      // MX sheet: row 4 = headers, row 5+ = data. Col 2 = Customer Name.
      mxSheet.eachRow((row, n) => {
        if (n < 5) return;
        const name = String(row.getCell(2).value ?? "").trim();
        if (!name) return;
        records.push({ company: { name, role: "customer", country: "MX", source: "TIO Sales History MX 2020-2025", status: "active" }, people: [] });
      });
      const mxCount = records.length - usaCount;
      setPreview({ usaCount, mxCount, records });
    } catch (e) {
      pushToast(`Parse failed: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setParsing(false);
    }
  };

  const apply = async () => {
    if (!preview) return;
    const { records } = preview;
    const sum: PerfumeContactImportTally = { records: 0, inserted: 0, matched: 0, by: {}, people_inserted: 0, people_existing: 0, origins: 0 };
    setState({ done: 0, total: records.length, tally: null, error: null });
    for (let i = 0; i < records.length; i += 500) {
      try {
        const t = await importPerfumeContacts(records.slice(i, i + 500));
        for (const k of ["records", "inserted", "matched", "people_inserted", "people_existing", "origins"] as const) sum[k] += t[k];
        for (const [k, v] of Object.entries(t.by)) sum.by[k] = (sum.by[k] ?? 0) + v;
        setState({ done: Math.min(i + 500, records.length), total: records.length, tally: { ...sum, by: { ...sum.by } }, error: null });
      } catch (e) {
        setState({ done: i, total: records.length, tally: { ...sum }, error: userFacingApiError(e, "Import stopped") });
        return;
      }
    }
    pushToast(`Sales history import: ${sum.inserted.toLocaleString("en-US")} new · ${sum.matched.toLocaleString("en-US")} already on file`, "success");
    setPreview(null);
    onDone();
  };

  const busy = state != null && state.done < state.total && !state.error;

  return (
    <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3 text-xs" aria-label="Import customer sales history" data-testid="perfume-customer-sales-import">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-card-title">Import customer purchase history (Excel)</span>
        <span className="text-[#64748B]">USA + MX sales history · role=customer · no balances · duplicates matched</span>
      </div>
      {!preview && !state && (
        <div className="flex items-center gap-2">
          <input type="file" accept=".xlsx,.xls" aria-label="Customer sales Excel file" disabled={parsing} data-testid="perfume-sales-import-file"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void parse(f); }} />
          {parsing && <span className="text-[#64748B]">Parsing…</span>}
        </div>
      )}
      {preview && !state && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded border border-[#D1FAE5] bg-[#F0FDF4] px-3 py-2">
            <span className="font-semibold text-[#15803D]">{(preview.usaCount + preview.mxCount).toLocaleString("en-US")} companies to import</span>
            <span className="ml-2 text-[#64748B]">— {preview.usaCount.toLocaleString("en-US")} USA · {preview.mxCount.toLocaleString("en-US")} MX · role: customer · no balances</span>
          </div>
          <Button type="button" className="h-[30px] px-4 text-xs" disabled={busy} onClick={() => void apply()} data-testid="perfume-sales-import-apply">Apply — import now</Button>
          <button type="button" className="text-xs text-[#64748B] underline" onClick={() => setPreview(null)}>Cancel</button>
        </div>
      )}
      {state && (
        <span data-testid="perfume-sales-import-status">
          {state.done.toLocaleString("en-US")} of {state.total.toLocaleString("en-US")} posted
          {state.tally ? ` · ${state.tally.inserted.toLocaleString("en-US")} new · ${state.tally.matched.toLocaleString("en-US")} matched` : ""}
          {state.error ? <b className="text-red-700"> — {state.error}</b> : (state.done >= state.total ? " · done" : " · importing…")}
        </span>
      )}
    </section>
  );
}

/**
 * L.31 M18 E2 — bulk "Make ScentsX customer" (CC3, made safe by LEAD): every live customer company with an email and no ScentsX link
 * becomes ScentsX LLC's customer through the SAME two canonical calls as the one-at-a-time button — the canonical customer create
 * (POST /api/v1/mdata/customers for ScentsX's company) and the link (POST /api/v1/scentsx/customer-links). A name already on ScentsX's
 * customer list (409 mdata_customer_name_conflict) is linked instead of duplicated; a 429 waits and retries; confirm first (pop-up),
 * one result row per company, nothing silent.
 */
type BulkResult = { id: string; name: string; outcome: "created" | "linked_existing" | "failed"; detail: string };
async function withRetry429<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await fn(); } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 429 || attempt >= 3) throw e;
      await new Promise((res) => setTimeout(res, (e.retryAfter ?? 30) * 1000));
    }
  }
}
export async function makeScentsxCustomers(companyId: string, contacts: EligibleScentsxContact[], onEach: (r: BulkResult) => void) {
  for (const c of contacts) {
    let r: BulkResult;
    try {
      let customerId: string | null = null;
      let outcome: BulkResult["outcome"] = "created";
      try {
        customerId = (await withRetry429(() => createScentsxCustomer(companyId, { name: c.name, email: c.email, phone: c.phone }))).id ?? null;
      } catch (e) {
        const code = e instanceof ApiError ? (e.data as { error?: string } | null)?.error : undefined;
        if (code !== "mdata_customer_name_conflict") throw e;
        const found = await listCustomers({ operating_company_id: companyId, search: c.name, limit: 50 });
        const exact = found.customers.find((x) => (x.name ?? "").trim().toLowerCase() === c.name.trim().toLowerCase());
        if (!exact) throw e;
        customerId = String(exact.id);
        outcome = "linked_existing";
      }
      if (!customerId) throw new Error("The customer was created but its id did not come back");
      const id = customerId;
      await withRetry429(() => linkScentsxCustomer(c.id, id));
      r = { id: c.id, name: c.name, outcome, detail: c.email };
    } catch (e) {
      r = { id: c.id, name: c.name, outcome: "failed", detail: userFacingApiError(e, "Not created") };
    }
    onEach(r);
  }
}

export function BulkMakeScentsxCustomerCard({ onDone }: { onDone: () => void }) {
  const eligible = useQuery({ queryKey: ["scentsx", "eligible-customers"], queryFn: () => getEligibleScentsxCustomers(500), staleTime: 30_000 });
  const co = useQuery({ queryKey: ["scentsx", "company"], queryFn: getScentsxCompany });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<BulkResult[]>([]);
  const total = eligible.data?.total ?? 0;
  const contacts = eligible.data?.contacts ?? [];
  const companyId = co.data?.company.id ?? "";
  const go = async () => {
    setBusy(true); setResults([]);
    try { await makeScentsxCustomers(companyId, contacts, (r) => setResults((x) => [...x, r])); } finally { setBusy(false); void eligible.refetch(); onDone(); }
  };
  if (eligible.isError) return <ListErrorState title={tr("perfume.sctx.bulk_error", "Couldn't load the customers to make")} status={0} message={(eligible.error as Error)?.message} onRetry={() => void eligible.refetch()} />;
  return (
    <section className="flex flex-wrap items-center gap-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3 text-xs" aria-label={tr("perfume.sctx.bulk_section", "Make ScentsX customers")} data-testid="perfume-bulk-scentsx-card">
      <span className="text-card-title">{tr("perfume.sctx.bulk_title", "Make ScentsX customers")}</span>
      <span className="text-[#64748B]">{`${total.toLocaleString("en-US")} ${tr("perfume.sctx.bulk_sub", "customer companies with an email are not ScentsX customers yet")}`}</span>
      <Button type="button" className="h-[30px] px-3 text-xs" disabled={!companyId || !contacts.length} onClick={() => { setResults([]); setOpen(true); }} data-testid="perfume-bulk-scentsx-open">
        {`${tr("perfume.sctx.bulk_btn", "Make ScentsX customers")} (${contacts.length})`}</Button>
      {open ? (
        <Modal open onClose={() => { if (!busy) setOpen(false); }} title={tr("perfume.sctx.bulk_title", "Make ScentsX customers")} size="md" data-testid="perfume-bulk-scentsx-modal">
          <div className="space-y-3 text-xs">
            <p>{`${contacts.length} ${tr("perfume.sctx.bulk_confirm", "customer companies become ScentsX LLC customers (A/R), one by one.")}${total > contacts.length ? ` ${tr("perfume.sctx.bulk_more", "The rest follow on the next run")} (${total - contacts.length}).` : ""}`}</p>
            {/* TABLE_DATE_OMIT: a run result — one row per company and what happened to it, not a dated event. */}
            {results.length ? (
              <ParityTable<BulkResult> selectable rows={results} rowKey={(r) => r.id} storageKey="perfume-bulk-scentsx-v1" exportFilename="ScentsX customers made" exportExcel emptyText="—"
                columns={[
                  { className: "text-left", cellClass: "text-left font-semibold", key: "name", sortable: true, label: "Company", render: (r) => r.name, exportValue: (r) => r.name },
                  { className: "text-left", cellClass: "text-left", key: "outcome", sortable: true, label: "Result", render: (r) => (r.outcome === "created" ? "Created + linked" : r.outcome === "linked_existing" ? "Linked to the existing customer" : "NOT done"), exportValue: (r) => r.outcome },
                  { className: "text-left", cellClass: "text-left", key: "detail", sortable: true, label: "Detail", render: (r) => r.detail, exportValue: (r) => r.detail },
                ]} />
            ) : null}
            {results.length ? <p data-testid="perfume-bulk-scentsx-summary">{`${results.filter((r) => r.outcome !== "failed").length} ${tr("perfume.sctx.bulk_done", "done")} · ${results.filter((r) => r.outcome === "failed").length} ${tr("perfume.sctx.bulk_failed", "not done")} · ${contacts.length - results.length} ${tr("perfume.sctx.bulk_left", "left")}`}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={busy} onClick={() => setOpen(false)}>{tr("perfume.sctx.close", "Close")}</Button>
              <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy || !contacts.length || results.length > 0} onClick={() => void go()} data-testid="perfume-bulk-scentsx-apply">
                {busy ? tr("perfume.sctx.working", "Working…") : `${tr("perfume.sctx.make", "Make")} ${contacts.length}`}</Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}

function GoogleCard({ onChanged }: { onChanged: () => void }) {
  const { pushToast } = useToast();
  const plan = useQuery({ queryKey: ["perfume", "google-plan"], queryFn: getPerfumeGooglePlan, refetchInterval: (qq) => (qq.state.data?.running ? 4_000 : false) });
  const [confirmCity, setConfirmCity] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ query: "perfumería", city: "Nuevo Laredo", state: "Tamaulipas", country: "MX" });
  const [results, setResults] = useState<{ text: string; requests: number; rows: PerfumeGoogleResult[] } | null>(null);
  const d = plan.data;
  const running = d?.runs.find((r) => r.id === d.running) ?? null;

  const start = async (city: string) => {
    setBusy(true);
    try { await startPerfumeGoogleRun(city); setConfirmCity(null); pushToast("Google search started — totals update here while it runs.", "success"); await plan.refetch(); }
    catch (e) { pushToast(userFacingApiError(e, "Search not started"), "error"); }
    finally { setBusy(false); }
  };
  const confirmFor = (city: string) => (city === "all" ? d?.all : d?.first_city);

  return (
    <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" aria-label={tr("perfume.contacts.google_business_search", "Google business search")} data-testid="perfume-google-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-card-title">{tr("perfume.contacts.google_business_search", "Google business search")}</div>
          <div className="text-xs text-[#64748B]">{tr("perfume.contacts.phone_website_address_hours_and_rating_g", "Phone, website, address, hours and rating for perfume, cosmetics, beauty supply and duty free stores. Google gives no email — those read “needs email”.")}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={!d?.configured || Boolean(d?.running) || busy} data-testid="perfume-google-first"
            onClick={() => setConfirmCity(d?.first_city.city ?? null)}>
            {`Search ${d?.first_city.city.split(",")[0] ?? "Nuevo Laredo"} first`}
          </Button>
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" data-testid="perfume-google-all"
            disabled={!d?.configured || Boolean(d?.running) || busy || !d?.full_matrix_unlocked}
            title={d?.full_matrix_unlocked ? "" : "Run the first city and look at its result first"}
            onClick={() => setConfirmCity("all")}>
            {`Search all border + metro cities (${n(d?.all.cities)})`}
          </Button>
        </div>
      </div>
      {d && !d.configured ? <div className="text-xs text-red-700">{tr("perfume.contacts.the_google_places_key_is_not_set_on_the_", "The Google Places key is not set on the server, so no search can run.")}</div> : null}
      {confirmCity ? (
        <div className="flex flex-wrap items-center gap-2 border-l-4 border-[#B45309] bg-[#FFF7ED] p-2 text-xs" data-testid="perfume-google-confirm">
          <span><b>{confirmCity === "all" ? `All ${n(d?.all.cities)} cities` : confirmCity}:</b> {n(confirmFor(confirmCity)?.searches)}{" "}{tr("perfume.contacts.searches_up_to", "searches, up to")}{" "}{n(confirmFor(confirmCity)?.maxRequests)}{" "}{tr("perfume.contacts.google_requests_each_page_of_20_results_", "Google requests (each page of 20 results is one request).")}</span>
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy} data-testid="perfume-google-start" onClick={() => void start(confirmCity)}>{tr("perfume.contacts.start", "Start")}</Button>
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={() => setConfirmCity(null)}>{tr("perfume.contacts.cancel", "Cancel")}</Button>
        </div>
      ) : null}
      {running ? (
        <div className="flex flex-wrap items-center gap-3 text-xs" data-testid="perfume-google-progress">
          <span><b>{tr("perfume.contacts.running", "Running:")}</b> {running.searches_done}{" "}{tr("perfume.contacts.of", "of")}{" "}{running.planned_searches}{" "}{tr("perfume.contacts.searches", "searches ·")}{" "}{running.requests_made}{" "}{tr("perfume.contacts.requests", "requests ·")}{" "}{running.results}{" "}{tr("perfume.contacts.results", "results ·")}{" "}{running.inserted}{" "}{tr("perfume.contacts.new", "new ·")}{" "}{running.matched}{" "}{tr("perfume.contacts.already_in_the_list", "already in the list ·")}{" "}{running.skipped_closed}{" "}{tr("perfume.contacts.closed_skipped", "closed skipped")}</span>
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={async () => { await stopPerfumeGoogleRun(running.id); await plan.refetch(); }}>{tr("perfume.contacts.stop", "Stop")}</Button>
        </div>
      ) : null}

      <form className="flex flex-wrap items-center gap-2" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true);
        try {
          const r = await perfumeGoogleSearch({ ...form, max: 60 });
          setResults({ text: r.text_query, requests: r.requests, rows: r.results });
          pushToast(`${r.results.length} found · ${r.inserted} new · ${r.matched} already in the list`, "success");
          onChanged(); void plan.refetch();
        } catch (err) { pushToast(userFacingApiError(err, "Google search failed"), "error"); }
        finally { setBusy(false); }
      }}>
        <input aria-label={tr("perfume.contacts.what", "What")} className={`${ctl} w-[180px]`} value={form.query} onChange={(e) => setForm({ ...form, query: e.target.value })} />
        <input aria-label={tr("perfume.contacts.city", "City")} className={`${ctl} w-[150px]`} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        <input aria-label={tr("perfume.contacts.state", "State")} className={`${ctl} w-[130px]`} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
        <select aria-label={tr("perfume.contacts.country", "Country")} className={ctl} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}>
          <option value="MX">{tr("perfume.contacts.mexico", "México")}</option><option value="US">{tr("perfume.contacts.united_states", "United States")}</option>
        </select>
        <Button type="submit" className="h-[34px] px-3 text-xs" disabled={busy || !d?.configured || form.query.trim().length < 2} data-testid="perfume-google-search">{tr("perfume.contacts.search_one", "Search one")}</Button>
        <span className="text-xs text-[#64748B]">{tr("perfume.contacts.up_to_60_results_up_to_3_requests", "Up to 60 results = up to 3 requests.")}</span>
      </form>

      {results ? (
        <div className="space-y-1" data-testid="perfume-google-results">
          <ParityTable<PerfumeGoogleResult> selectable
            cardTitle title={`“${results.text}” · ${results.rows.length} results · ${results.requests} Google requests`}
            rows={results.rows}
            rowKey={(r) => r.place_id}
            storageKey="perfume-google-results-v1"

            exportFilename="TIO google results"

            exportExcel
            emptyText="Google found nothing for this search."
            columns={[
              { key: "name", label: "Business", sortable: true, render: (r) => (r.maps_uri ? <a className="font-semibold text-[#14314F] underline" href={r.maps_uri} target="_blank" rel="noreferrer">{r.name}</a> : r.name) },
              { key: "address", label: "Address", sortable: true, render: (r) => r.address ?? DASH },
              { key: "phone", label: "Phone", sortable: true, render: (r) => r.phone ?? DASH },
              { key: "website", label: "Website", sortable: true, render: (r) => (r.website ? <a className="text-[#14314F] underline" href={r.website} target="_blank" rel="noreferrer">{r.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a> : DASH) },
              { key: "rating", label: "Rating", sortable: true, kind: "number", cellClass: "text-right tabular-nums", render: (r) => (r.rating == null ? DASH : `${r.rating} (${r.rating_count ?? 0})`) },
              { key: "outcome", label: "Saved as", sortable: true, render: (r) => (r.outcome === "inserted" ? "New prospect" : r.outcome === "matched" ? "Already in the list" : "Closed — skipped") },
            ]}
          />
        </div>
      ) : null}

      <RunsTable runs={d?.runs ?? []} />
    </section>
  );
}

function RunsTable({ runs }: { runs: PerfumeGoogleRun[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const what = (r: PerfumeGoogleRun) => (r.kind === "single" ? String(r.query?.["textQuery"] ?? "") : r.query?.["city"] === "all" ? "All cities" : String(r.query?.["city"] ?? ""));
  const shown = runs.find((r) => r.id === open) ?? null;
  return (
    <div className="space-y-1" data-testid="perfume-google-runs">
      <ParityTable<PerfumeGoogleRun> selectable
        cardTitle title={tr("perfume.contacts.google_searches_run", "Google searches run")}
        rows={runs}
        rowKey={(r) => r.id}
        storageKey="perfume-google-runs-v1"

        exportFilename="TIO google runs"

        exportExcel
        suppressToolbarSearch
        emptyText="No Google search yet."
        columns={[
          { key: "started_at", label: "Started", sortable: true, render: (r) => formatDateTimeUS(r.started_at) },
          { key: "kind", label: "What", sortable: true, render: what },
          { key: "status", label: "Status", sortable: true, render: (r) => <span className={`font-semibold uppercase ${r.status === "done" ? "text-[#1F6B32]" : r.status === "running" ? "text-[#14314F]" : "text-[#8A4208]"}`}>{r.status}{r.error ? ` — ${r.error}` : ""}</span> },
          { key: "searches_done", label: "Searches", sortable: true, kind: "number", cellClass: "text-right tabular-nums", render: (r) => `${r.searches_done} / ${r.planned_searches}` },
          { key: "requests_made", label: "Requests", sortable: true, kind: "number", cellClass: "text-right tabular-nums" },
          { key: "results", label: "Results", sortable: true, kind: "number", cellClass: "text-right tabular-nums" },
          { key: "inserted", label: "New", sortable: true, kind: "number", cellClass: "text-right tabular-nums" },
          { key: "matched", label: "Already in list", sortable: true, kind: "number", cellClass: "text-right tabular-nums" },
          { key: "skipped_closed", label: "Closed", sortable: true, kind: "number", cellClass: "text-right tabular-nums" },
        ]}
        rowActions={(r) => (Object.keys(r.by_city ?? {}).length ? (
          <button type="button" className="text-xs text-[#14314F] underline" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? "Hide cities" : "Per city"}</button>
        ) : null)}
        rowActionsWidth={110}
      />
      {shown ? (
        <div className="space-y-0.5 bg-[#FAFCFD] p-2 text-xs tabular-nums" data-testid="perfume-google-run-cities">
          {Object.entries(shown.by_city).map(([city, t]) => <div key={city}>{city}: {t.searches}{" "}{tr("perfume.contacts.searches", "searches ·")}{" "}{t.results}{" "}{tr("perfume.contacts.results", "results ·")}{" "}{t.inserted}{" "}{tr("perfume.contacts.new", "new ·")}{" "}{t.matched}{" "}{tr("perfume.contacts.already_in_list", "already in list ·")}{" "}{t.skipped_closed}{" "}{tr("perfume.contacts.closed", "closed")}</div>)}
        </div>
      ) : null}
    </div>
  );
}
