/**
 * PERFUME-CONTACTS — the TIO Perfumes contacts database (owner 2026-11-25 22:04 CT) with how, where and when each contact
 * started, vendors that are also customers (22:11 CT), and the Google business search that adds prospects with phone,
 * website, hours and rating (22:09 CT: "Yes ask for it and I want is possible all the data").
 *
 * The first Google batch is ONE city (Nuevo Laredo) — research session ROUND P1.4 #5; the full matrix unlocks only after a
 * finished batch. Every batch shows how many Google requests it can use and waits for a second click.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { MultiSelectDropdown } from "../../components/forms/MultiSelectDropdown";
import { ParityTable } from "../../components/parity/ParityTable";
import { KpiCard } from "../../components/layout/KpiCard";
import { useToast } from "../../components/Toast";
import { ListErrorState } from "../../components/ListErrorState";
import { userFacingApiError } from "../../lib/api-error-message";
import { formatDateTimeUS } from "../../lib/formatDate";
import {
  getPerfumeContact, getPerfumeGooglePlan, importPerfumeContacts, listPerfumeContacts, perfumeGoogleSearch, startPerfumeGoogleRun, stopPerfumeGoogleRun,
  type PerfumeContactFacet, type PerfumeContactImportTally, type PerfumeContactPicks, type PerfumeContactProfile, type PerfumeContactRole, type PerfumeContactRow, type PerfumeGoogleResult, type PerfumeGoogleRun,
} from "../../api/perfume";
import { tr } from "./perfumeI18n";

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
  { facet: "category", pick: "categories", label: "Category", all: "All categories" },
  { facet: "source", pick: "sources", label: "Source", all: "Every source" },
  { facet: "how", pick: "hows", label: "How it started", all: "Any start" },
];

function RoleBadge({ role }: { role: PerfumeContactRole | null }) {
  if (!role) return <span className="text-gray-400">{DASH}</span>;
  return <span className={`text-section-header inline-block rounded-sm px-1.5 text-white ${ROLE_CLASS[role]}`}>{ROLE_TEXT[role]}</span>;
}

export function PerfumeContactsPanel() {
  const [role, setRole] = useState<PerfumeContactRole | "none" | "all">("all");
  const [source, setSource] = useState<string>("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [picks, setPicks] = useState<PerfumeContactPicks>({});
  const list = useQuery({ queryKey: ["perfume", "contacts", role, source, q, picks], queryFn: () => listPerfumeContacts({ role, source, q, limit: 300, ...picks }) });
  const anyPick = Object.values(picks).some((v) => (v?.length ?? 0) > 0);

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
      <div className="grid grid-cols-2 gap-[10px] md:grid-cols-6" data-testid="perfume-contacts-kpis">
        <KpiCard label={`Companies · ${n(c?.people)} people`} number={n(c?.companies)} onClick={() => { setRole("all"); setSource(""); }} />
        <KpiCard label={tr("perfume.contacts.vendors", "Vendors")} number={n(c?.vendors)} onClick={() => setRole("vendor")} />
        <KpiCard label={tr("perfume.contacts.customers", "Customers")} number={n(c?.customers)} onClick={() => setRole("customer")} />
        <KpiCard label={tr("perfume.contacts.vendor_customer", "Vendor + customer")} number={n(c?.both)} onClick={() => setRole("both")} />
        <KpiCard label={tr("perfume.contacts.from_google", "From Google")} number={n(c?.from_google)} onClick={() => setSource("Google")} />
        <KpiCard label={tr("perfume.contacts.needs_email_never_in_a_send", "Needs email — never in a send")} number={n(c?.needs_email)} disabled disabledReason="Companies with no email on file; Google gives no email." />
      </div>

      <ImportCard onDone={() => void list.refetch()} />
      <GoogleCard onChanged={() => void list.refetch()} />

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
        <ParityTable<PerfumeContactRow>
          rows={list.data?.rows ?? []}
          rowKey={(r) => r.id}
          loading={list.isLoading}
          storageKey="perfume-contacts-v1"
          emptyText={q || role !== "all" || source || anyPick ? "No contact matches these filters." : "No contacts yet — the Master Database import fills this list."}
          onRowClick={(r) => setSelected(r.id)}
          columns={[
            { key: "name", label: "Company", sortable: true, render: (r) => <span className="font-semibold text-[#14314F]">{r.name}</span> },
            { key: "role", label: "Role", sortable: true, render: (r) => <RoleBadge role={r.role} /> },
            { key: "how_started", label: "How it started", sortable: true, render: (r) => r.how_started ?? DASH },
            { key: "city", label: "City · state · country", sortable: true, render: (r) => [r.city, r.state, r.country].filter(Boolean).join(" · ") || DASH },
            { key: "phone", label: "Phone", sortable: true, render: (r) => r.phone ?? DASH },
            { key: "website", label: "Website", sortable: true, render: (r) => (r.website ? <a href={r.website} target="_blank" rel="noreferrer" className="text-[#14314F] underline">{r.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a> : DASH) },
            { key: "people", label: "People", sortable: true, kind: "number", cellClass: "text-right tabular-nums" },
            { key: "with_email", label: "With email", sortable: true, kind: "number", cellClass: "text-right tabular-nums", render: (r) => (r.with_email ? r.with_email : <span className="text-[#8A4208]">{tr("perfume.contacts.needs_email", "needs email")}</span>) },
            { key: "first_contact_on", label: "First contact", sortable: true, cellClass: "text-right tabular-nums", render: (r) => usDate(r.first_contact_on) },
            { key: "last_email_on", label: "Last email", sortable: true, cellClass: "text-right tabular-nums", render: (r) => usDate(r.last_email_on) },
            { key: "source", label: "Source", sortable: true },
          ]}
        />
        <div className="text-xs text-[#64748B]">{list.data ? `Showing ${list.data.rows.length.toLocaleString("en-US")} of ${list.data.total.toLocaleString("en-US")}` : ""}</div>
      </section>

      {selected ? <ContactProfile id={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

function ContactProfile({ id, onClose }: { id: string; onClose: () => void }) {
  const p = useQuery({ queryKey: ["perfume", "contact", id], queryFn: () => getPerfumeContact(id) });
  const co = p.data?.company;
  const val = (k: string) => { const v = co?.[k]; return v == null || v === "" ? DASH : Array.isArray(v) ? (v.length ? v.join(" · ") : DASH) : String(v); };
  return (
    <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" aria-label={tr("perfume.contacts.company_profile", "Company profile")} data-testid="perfume-contact-profile">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2"><span className="text-section-header">{co?.name ?? "…"}</span><RoleBadge role={(co?.["role"] as PerfumeContactRole) ?? null} /></div>
        <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>{tr("perfume.contacts.close", "Close")}</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          <ParityTable<PerfumeContactProfile["origins"][number]>
            title={tr("perfume.contacts.how_and_when_this_relationship_started", "How and when this relationship started")}
            rows={p.data?.origins ?? []}
            rowKey={(o) => o.id}
            loading={p.isLoading}
            storageKey="perfume-contact-origins-v1"
            suppressToolbarSearch
            emptyText="No origin recorded."
            columns={[
              { key: "occurred_on", label: "Date", sortable: true, cellClass: "text-right tabular-nums", render: (o) => usDate(o.occurred_on) },
              { key: "how", label: "How", sortable: true },
              { key: "source", label: "Where (source)", sortable: true, render: (o) => (o.source_url ? <a className="text-[#14314F] underline" href={o.source_url} target="_blank" rel="noreferrer">{o.source}</a> : o.source) },
              { key: "person_name", label: "Who", sortable: true, render: (o) => o.person_name ?? DASH },
              { key: "detail", label: "Detail", sortable: true, render: (o) => o.detail ?? DASH },
            ]}
          />
          <ParityTable<PerfumeContactProfile["people"][number]>
            title={tr("perfume.contacts.people", "People")}
            rows={p.data?.people ?? []}
            rowKey={(x) => x.id}
            loading={p.isLoading}
            storageKey="perfume-contact-people-v1"
            suppressToolbarSearch
            emptyText="No person on file — needs email."
            columns={[
              { key: "name", label: "Name", sortable: true, render: (x) => <span className="font-semibold">{x.name ?? DASH}</span> },
              { key: "email", label: "Email", sortable: true, render: (x) => x.email ?? DASH },
              { key: "phones", label: "Phones", render: (x) => x.phones.join(" · ") || DASH },
              { key: "role", label: "Role", sortable: true, render: (x) => <RoleBadge role={x.role} /> },
              { key: "how_started", label: "How it started", sortable: true, render: (x) => x.how_started ?? DASH },
              { key: "first_contact_on", label: "First", sortable: true, cellClass: "text-right tabular-nums", render: (x) => usDate(x.first_contact_on) },
              { key: "last_email_on", label: "Last", sortable: true, cellClass: "text-right tabular-nums", render: (x) => usDate(x.last_email_on) },
              { key: "email_count", label: "Emails", sortable: true, kind: "number", cellClass: "text-right tabular-nums", render: (x) => n(x.email_count) },
            ]}
          />
        </div>
        <div className="text-xs">
          {([["Website", "website"], ["Phone", "phone"], ["Address", "address"], ["City", "city"], ["State", "state"], ["Country", "country"], ["Categories", "categories"],
            ["Customer type", "customer_type"], ["Vendor type", "vendor_type"], ["Google rating", "google_rating"], ["Google reviews", "google_rating_count"],
            ["Open hours", "google_hours"], ["Google status", "google_business_status"], ["Owner", "owner_name"], ["LinkedIn", "linkedin"], ["Source", "source"]] as const).map(([l, k]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-[#E8EDF2] py-1.5"><span className="text-[#64748B]">{l}</span><span className="text-right">{val(k)}</span></div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** The Master Database and the INEGI DENUE pull come in as one JSON-lines file each; sent in batches of 500, one transaction each. */
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
      <span className="text-section-header">{tr("perfume.contacts.import_contacts_file", "Import contacts file")}</span>
      <input type="file" accept=".jsonl,.json,.txt" aria-label={tr("perfume.contacts.contacts_file", "Contacts file")} disabled={busy} data-testid="perfume-contacts-import-file"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void run(f); }} />
      {state ? (
        <span data-testid="perfume-contacts-import-status">
          {state.file}: {state.done.toLocaleString("en-US")}{" "}{tr("perfume.contacts.of", "of")}{" "}{state.total.toLocaleString("en-US")}{" "}{tr("perfume.contacts.records", "records")}{state.tally ? ` · ${state.tally.inserted.toLocaleString("en-US")} new · ${state.tally.matched.toLocaleString("en-US")} already in the list (${Object.entries(state.tally.by).map(([k, v]) => `${k} ${v.toLocaleString("en-US")}`).join(" · ") || "—"}) · ${state.tally.people_inserted.toLocaleString("en-US")} people · ${state.tally.origins.toLocaleString("en-US")} origins` : ""}
          {state.error ? <b className="text-red-700"> — {state.error}</b> : null}
        </span>
      ) : <span className="text-[#64748B]">{tr("perfume.contacts.master_database_or_inegi_denue_duplicate", "Master Database or INEGI DENUE — duplicates are matched, never doubled.")}</span>}
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
          <div className="text-section-header">{tr("perfume.contacts.google_business_search", "Google business search")}</div>
          <div className="text-xs text-[#64748B]">{tr("perfume.contacts.phone_website_address_hours_and_rating_f", "Phone, website, address, hours and rating for perfume, cosmetics, duty free, liquor, tobacco and beer stores. Google gives no email — those read “needs email”.")}</div>
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
          <ParityTable<PerfumeGoogleResult>
            title={`“${results.text}” · ${results.rows.length} results · ${results.requests} Google requests`}
            rows={results.rows}
            rowKey={(r) => r.place_id}
            storageKey="perfume-google-results-v1"
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
      <ParityTable<PerfumeGoogleRun>
        title={tr("perfume.contacts.google_searches_run", "Google searches run")}
        rows={runs}
        rowKey={(r) => r.id}
        storageKey="perfume-google-runs-v1"
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
