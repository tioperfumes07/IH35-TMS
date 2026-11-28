/**
 * PERFUME-TRADE-SHOWS — the trade show planner (owner 2026-11-26 15:56 CT: "i am still missing all the other views that you
 * or he other agent deisnged"). Every show with its dates, city and type; "I go" is the owner's own mark (7 of the 60 on the
 * 2027 calendar); each show lists the contacts who attend and the meeting asked / booked / held, so meetings are planned
 * per show. Type-to-narrow filters, the same desk look as Contacts. Nothing is deleted — a contact taken off is archived.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { DatePicker } from "../../components/forms/DatePicker";
import { MultiSelectDropdown } from "../../components/forms/MultiSelectDropdown";
import { ParityTable } from "../../components/parity/ParityTable";
import { KpiCard } from "../../components/layout/KpiCard";
import { useToast } from "../../components/Toast";
import { ListErrorState } from "../../components/ListErrorState";
import { userFacingApiError } from "../../lib/api-error-message";
import {
  addPerfumeShowContact, listPerfumeContacts, listPerfumeShowContacts, listPerfumeShows, savePerfumeShow, setPerfumeShowIGo, updatePerfumeShowContact,
  type PerfumeShow, type PerfumeShowContact, type PerfumeShowContactStatus,
} from "../../api/perfume";
import { DateTimePicker } from "../../components/forms/DateTimePicker";

/** A stored instant (ISO, UTC) as the local wall clock "YYYY-MM-DDTHH:mm" the picker shows and edits. */
function localWallClock(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
import { tr } from "./perfumeI18n";
import { companyToday } from "../../lib/businessDate";

const DASH = "—";
const ctl = "h-[34px] rounded-sm border border-[#C6D1DC] bg-white px-2 text-xs";
const usDate = (d: string | null | undefined) => (d ? `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)}` : DASH);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const STATUS_TEXT: Record<PerfumeShowContactStatus, string> = { attends: "Attends", meeting_asked: "Meeting asked", meeting_booked: "Meeting booked", met: "Met" };
// Laredo calendar day, not UTC (verify-acct-utc-today-defaults; after 6 PM CT the UTC date is already tomorrow).
const todayIso = () => companyToday();

type Picks = { years: string[]; months: string[]; kinds: string[]; cities: string[] };
const NO_PICKS: Picks = { years: [], months: [], kinds: [], cities: [] };
const countOpts = (vals: Array<string | null>) => {
  const m = new Map<string, number>();
  for (const v of vals) if (v) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m].sort((a, b) => a[0].localeCompare(b[0], "en", { numeric: true })).map(([value, count]) => ({ value, label: `${value} (${count})` }));
};

export function PerfumeTradeShowsPanel() {
  const { pushToast } = useToast();
  const shows = useQuery({ queryKey: ["perfume", "trade-shows"], queryFn: listPerfumeShows });
  const [picks, setPicks] = useState<Picks>(NO_PICKS);
  const [onlyGo, setOnlyGo] = useState(false);
  const [onlyMeetings, setOnlyMeetings] = useState(false);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const all = shows.data?.shows ?? [];
  const yearOf = (s: PerfumeShow) => s.starts_on?.slice(0, 4) ?? null;
  const monthOf = (s: PerfumeShow) => (s.starts_on ? MONTHS[Number(s.starts_on.slice(5, 7)) - 1] ?? null : null);
  const rows = useMemo(() => all.filter((s) =>
    (!onlyGo || s.i_go)
    && (!onlyMeetings || s.meetings > 0)
    && (!picks.years.length || picks.years.includes(yearOf(s) ?? ""))
    && (!picks.months.length || picks.months.includes(monthOf(s) ?? ""))
    && (!picks.kinds.length || picks.kinds.includes(s.kind ?? ""))
    && (!picks.cities.length || picks.cities.includes(s.city ?? ""))
    && (!q.trim() || `${s.name} ${s.city ?? ""} ${s.kind ?? ""} ${s.venue ?? ""} ${s.notes ?? ""} ${s.organizer ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()))),
  [all, onlyGo, onlyMeetings, picks, q]);
  const goShows = all.filter((s) => s.i_go);
  const next = goShows.find((s) => (s.ends_on ?? s.starts_on ?? "") >= todayIso());
  const meetings = all.reduce((t, s) => t + s.meetings, 0);
  const anyFilter = onlyGo || onlyMeetings || q || Object.values(picks).some((v) => v.length);

  const toggleGo = async (s: PerfumeShow) => {
    try { await setPerfumeShowIGo(s.id, !s.i_go); await shows.refetch(); pushToast(`${s.name}: ${!s.i_go ? "I go" : "not going"}`, "success"); }
    catch (e) { pushToast(userFacingApiError(e, "Not saved"), "error"); }
  };

  if (shows.isError) return <ListErrorState title={tr("perfume.shows.error", "Couldn't load the trade shows")} status={0} message={(shows.error as Error)?.message} onRetry={() => void shows.refetch()} />;
  return (
    <div className="space-y-3" data-testid="perfume-trade-shows-panel">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <KpiCard label={tr("perfume.shows.kpi_shows", "Shows on the calendar")} number={all.length.toLocaleString()} onClick={() => { setPicks(NO_PICKS); setOnlyGo(false); setOnlyMeetings(false); setQ(""); }} />
        <KpiCard label={tr("perfume.shows.kpi_go", "I go")} number={goShows.length.toLocaleString()} onClick={() => setOnlyGo(true)} />
        <KpiCard label={tr("perfume.shows.kpi_next", "Next show I go to")} number={next ? `${usDate(next.starts_on)} · ${next.name}` : DASH} onClick={next ? () => setSelected(next.id) : undefined} />
        <KpiCard label={tr("perfume.shows.kpi_meetings", "Meetings booked / held")} number={meetings.toLocaleString()} onClick={() => setOnlyMeetings(true)} />
      </div>

      <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" aria-label={tr("perfume.shows.title", "Trade shows")}>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" aria-pressed={onlyGo} data-testid="perfume-shows-only-go" onClick={() => setOnlyGo((v) => !v)}
            className={`h-[34px] rounded-sm border px-3 text-xs ${onlyGo ? "border-[#14314F] bg-[#14314F] font-semibold text-white" : "border-[#C6D1DC] bg-[var(--surface-unselected)] text-[#1F2A44]"}`}>
            {tr("perfume.shows.only_go", "Only shows I go to")}
          </button>
          <MultiSelectDropdown label={tr("perfume.shows.year", "Year")} allLabel={tr("perfume.shows.all_years", "All years")} data-testid="perfume-shows-filter-year"
            options={countOpts(all.map(yearOf))} selected={picks.years} onChange={(v) => setPicks((p) => ({ ...p, years: v }))} />
          <MultiSelectDropdown label={tr("perfume.shows.month", "Month")} allLabel={tr("perfume.shows.all_months", "All months")} data-testid="perfume-shows-filter-month"
            options={MONTHS.filter((m) => all.some((s) => monthOf(s) === m)).map((m) => ({ value: m, label: `${m} (${all.filter((s) => monthOf(s) === m).length})` }))}
            selected={picks.months} onChange={(v) => setPicks((p) => ({ ...p, months: v }))} />
          <MultiSelectDropdown label={tr("perfume.shows.type", "Type")} allLabel={tr("perfume.shows.all_types", "All types")} searchable data-testid="perfume-shows-filter-type"
            options={countOpts(all.map((s) => s.kind))} selected={picks.kinds} onChange={(v) => setPicks((p) => ({ ...p, kinds: v }))} />
          <MultiSelectDropdown label={tr("perfume.shows.city", "City")} allLabel={tr("perfume.shows.all_cities", "All cities")} searchable data-testid="perfume-shows-filter-city"
            options={countOpts(all.map((s) => s.city))} selected={picks.cities} onChange={(v) => setPicks((p) => ({ ...p, cities: v }))} />
          <input type="search" aria-label={tr("perfume.shows.search", "Search shows")} placeholder={tr("perfume.shows.search_ph", "Search show, city, venue, notes")}
            className={`${ctl} min-w-[220px] flex-1`} value={q} onChange={(e) => setQ(e.target.value)} data-testid="perfume-shows-search" />
          {anyFilter ? <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={() => { setPicks(NO_PICKS); setOnlyGo(false); setOnlyMeetings(false); setQ(""); }}>{tr("perfume.shows.clear", "Clear filters")}</Button> : null}
          <Button type="button" className="h-[34px] px-3 text-xs" data-testid="perfume-shows-add" onClick={() => setAdding(true)}>{tr("perfume.shows.add", "Add a show")}</Button>
        </div>
        {adding ? <AddShowForm onClose={() => setAdding(false)} onSaved={() => { setAdding(false); void shows.refetch(); }} /> : null}
        <ParityTable<PerfumeShow> selectable
          rows={rows}
          rowKey={(s) => s.id}
          loading={shows.isLoading}
          storageKey="perfume-trade-shows-v1"
          exportFilename="TIO trade shows"
          exportExcel
          emptyText={anyFilter ? "No show matches these filters." : "No shows yet — add one, or load the 2027 calendar."}
          onRowClick={(s) => setSelected(s.id)}
          columns={[
            { key: "i_go", label: "I go", sortable: true, render: (s) => (
              <input type="checkbox" aria-label={`I go to ${s.name}`} checked={s.i_go} data-testid={`perfume-show-igo-${s.id}`}
                onClick={(e) => e.stopPropagation()} onChange={() => void toggleGo(s)} />) },
            { key: "name", label: "Show", sortable: true, render: (s) => <span className="font-semibold">{s.name}</span> },
            // Owner 2026-11-26 17:08 CT: "i need the contact data the website so i can click and take me there to register".
            { key: "register_url", label: "Register", render: (s) => <ShowLink href={s.register_url ?? s.website} text={tr("perfume.shows.register", "Register")} testId={`perfume-show-register-${s.id}`} />, exportValue: (s) => s.register_url ?? s.website ?? "" },
            { key: "website", label: "Website", render: (s) => <ShowLink href={s.website} text={hostOf(s.website)} />, exportValue: (s) => s.website ?? "" },
            { key: "organizer", label: "Organizer", sortable: true, render: (s) => s.organizer ?? DASH },
            { key: "contact_email", label: "Email", render: (s) => (s.contact_email ? <a className="text-[#1B5FA8] underline" href={`mailto:${s.contact_email}`} onClick={(e) => e.stopPropagation()}>{s.contact_email}</a> : DASH) },
            { key: "contact_phone", label: "Phone", render: (s) => (s.contact_phone ? <a className="text-[#1B5FA8] underline tabular-nums" href={`tel:${s.contact_phone.replace(/[^\d+]/g, "")}`} onClick={(e) => e.stopPropagation()}>{s.contact_phone}</a> : DASH) },
            { key: "starts_on", label: "Starts", sortable: true, cellClass: "text-right tabular-nums", render: (s) => usDate(s.starts_on) },
            { key: "ends_on", label: "Ends", sortable: true, cellClass: "text-right tabular-nums", render: (s) => usDate(s.ends_on) },
            { key: "city", label: "City", sortable: true, render: (s) => s.city ?? DASH },
            { key: "kind", label: "Type", sortable: true, render: (s) => s.kind ?? DASH },
            { key: "dates_status", label: "Dates", sortable: true, render: (s) => s.dates_status ?? DASH },
            { key: "contacts", label: "Contacts", sortable: true, kind: "number", cellClass: "text-right tabular-nums", render: (s) => s.contacts.toLocaleString() },
            { key: "meetings", label: "Meetings", sortable: true, kind: "number", cellClass: "text-right tabular-nums", render: (s) => s.meetings.toLocaleString() },
            { key: "venue", label: "Venue", sortable: true, render: (s) => s.venue ?? DASH },
            { key: "notes", label: "Notes", render: (s) => s.notes ?? DASH },
            { key: "source", label: "Source", sortable: true, render: (s) => s.source ?? DASH },
          ]}
        />
      </section>
      {selected ? <ShowDetail show={all.find((s) => s.id === selected) ?? null} onClose={() => setSelected(null)} onChanged={() => void shows.refetch()} /> : null}
    </div>
  );
}

/** Only a real web address opens (http / https), in a new tab; the row click never fires with it. */
export function safeUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  const v = /^https?:\/\//i.test(u.trim()) ? u.trim() : `https://${u.trim()}`;
  try { const x = new URL(v); return x.protocol === "http:" || x.protocol === "https:" ? x.toString() : null; } catch { return null; }
}
function hostOf(u: string | null): string {
  const v = safeUrl(u);
  return v ? new URL(v).hostname.replace(/^www\./, "") : "";
}
function ShowLink({ href, text, testId }: { href: string | null; text: string; testId?: string }) {
  const v = safeUrl(href);
  if (!v) return <>{DASH}</>;
  return <a className="text-[#1B5FA8] underline" href={v} target="_blank" rel="noopener noreferrer" data-testid={testId} onClick={(e) => e.stopPropagation()}>{text}</a>;
}

function AddShowForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { pushToast } = useToast();
  const [f, setF] = useState({ name: "", starts_on: "", ends_on: "", city: "", kind: "", venue: "", notes: "", website: "", register_url: "", organizer: "",
    contact_email: "", contact_phone: "", i_go: false });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: k === "i_go" ? e.target.checked : e.target.value }));
  const save = async () => {
    try {
      await savePerfumeShow({ ...f, starts_on: f.starts_on || null, ends_on: f.ends_on || null, source: "Added by hand" });
      pushToast(`${f.name} saved`, "success"); onSaved();
    } catch (e) { pushToast(userFacingApiError(e, "Not saved"), "error"); }
  };
  return (
    <div className="flex flex-wrap items-end gap-2 border-t border-[#E8EDF2] pt-2" data-testid="perfume-shows-add-form">
      <label className="text-xs">{tr("perfume.shows.f_name", "Show")}<input className={`${ctl} block w-[240px]`} value={f.name} onChange={set("name")} data-testid="perfume-shows-add-name" /></label>
      <label className="text-xs">{tr("perfume.shows.f_starts", "Starts")}<DatePicker aria-label={tr("perfume.shows.f_starts", "Starts")} value={f.starts_on} onChange={(v) => setF((x) => ({ ...x, starts_on: v }))} /></label>
      <label className="text-xs">{tr("perfume.shows.f_ends", "Ends")}<DatePicker aria-label={tr("perfume.shows.f_ends", "Ends")} value={f.ends_on} onChange={(v) => setF((x) => ({ ...x, ends_on: v }))} /></label>
      <label className="text-xs">{tr("perfume.shows.f_city", "City")}<input className={`${ctl} block`} value={f.city} onChange={set("city")} /></label>
      <label className="text-xs">{tr("perfume.shows.f_type", "Type")}<input className={`${ctl} block`} value={f.kind} onChange={set("kind")} /></label>
      <label className="text-xs">{tr("perfume.shows.f_venue", "Venue")}<input className={`${ctl} block`} value={f.venue} onChange={set("venue")} /></label>
      <label className="text-xs">{tr("perfume.shows.f_website", "Website")}<input className={`${ctl} block`} value={f.website} onChange={set("website")} /></label>
      <label className="text-xs">{tr("perfume.shows.f_register", "Register page")}<input className={`${ctl} block`} value={f.register_url} onChange={set("register_url")} /></label>
      <label className="text-xs">{tr("perfume.shows.f_organizer", "Organizer")}<input className={`${ctl} block`} value={f.organizer} onChange={set("organizer")} /></label>
      <label className="text-xs">{tr("perfume.shows.f_email", "Email")}<input className={`${ctl} block`} value={f.contact_email} onChange={set("contact_email")} /></label>
      <label className="text-xs">{tr("perfume.shows.f_phone", "Phone")}<input className={`${ctl} block`} value={f.contact_phone} onChange={set("contact_phone")} /></label>
      <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={f.i_go} onChange={set("i_go")} />{tr("perfume.shows.f_go", "I go")}</label>
      <Button type="button" className="h-[34px] px-3 text-xs" disabled={!f.name.trim()} onClick={() => void save()} data-testid="perfume-shows-add-save">{tr("perfume.shows.save", "Save")}</Button>
      <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>{tr("perfume.shows.cancel", "Cancel")}</Button>
    </div>
  );
}

/** One show: its contacts and meetings, and adding a contact from the contacts database. */
function ShowDetail({ show, onClose, onChanged }: { show: PerfumeShow | null; onClose: () => void; onChanged: () => void }) {
  const { pushToast } = useToast();
  const id = show?.id ?? "";
  const contacts = useQuery({ queryKey: ["perfume", "trade-show-contacts", id], queryFn: () => listPerfumeShowContacts(id), enabled: Boolean(id) });
  const [find, setFind] = useState("");
  const found = useQuery({ queryKey: ["perfume", "contacts", "pick", find], queryFn: () => listPerfumeContacts({ q: find, limit: 20 }), enabled: find.trim().length >= 2 });
  const refresh = async () => { await contacts.refetch(); onChanged(); };
  const add = async (companyId: string, name: string) => {
    try { await addPerfumeShowContact(id, { company_id: companyId }); setFind(""); await refresh(); pushToast(`${name} added to ${show?.name}`, "success"); }
    catch (e) { pushToast(userFacingApiError(e, "Not saved"), "error"); }
  };
  const patch = async (x: PerfumeShowContact, b: Parameters<typeof updatePerfumeShowContact>[1]) => {
    try { await updatePerfumeShowContact(x.id, b); await refresh(); } catch (e) { pushToast(userFacingApiError(e, "Not saved"), "error"); }
  };
  if (!show) return null;
  return (
    <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" data-testid="perfume-show-detail" aria-label={show.name}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-card-title">{show.name}</div>
          <div className="text-xs text-[#64748B]">{[`${usDate(show.starts_on)} – ${usDate(show.ends_on)}`, show.city ?? DASH, show.kind ?? DASH, show.i_go ? tr("perfume.shows.f_go", "I go") : ""].filter(Boolean).join(" · ")}</div>
        </div>
        <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>{tr("perfume.shows.close", "Close")}</Button>
      </div>
      <div className="relative">
        <input type="search" className={`${ctl} w-full max-w-[420px]`} placeholder={tr("perfume.shows.find_contact", "Add a contact who attends — type a company, person, email or city")}
          value={find} onChange={(e) => setFind(e.target.value)} data-testid="perfume-show-find-contact" />
        {find.trim().length >= 2 && (found.data?.rows?.length ?? 0) > 0 ? (
          <div className="absolute z-20 mt-1 max-h-64 w-full max-w-[420px] overflow-y-auto border border-gray-300 bg-white shadow-lg" role="listbox">
            {found.data!.rows.map((r) => (
              <button key={r.id} type="button" role="option" aria-selected={false} className="block w-full px-2 py-1 text-left text-xs hover:bg-gray-100"
                onClick={() => void add(r.id, r.name)} data-testid={`perfume-show-pick-${r.id}`}>
                <span className="font-semibold">{r.name}</span> <span className="text-[#64748B]">{[r.city, r.country].filter(Boolean).join(", ")}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <ParityTable<PerfumeShowContact> selectable
        cardTitle title={tr("perfume.shows.contacts_title", "Contacts at this show")}
        rows={contacts.data?.contacts ?? []}
        rowKey={(x) => x.id}
        loading={contacts.isLoading}
        storageKey="perfume-show-contacts-v1"
          exportFilename="TIO trade show contacts"
          exportExcel
        suppressToolbarSearch
        emptyText="No contact linked to this show yet."
        columns={[
          { key: "company", label: "Company", sortable: true, render: (x) => <span className="font-semibold">{x.company}</span> },
          { key: "person", label: "Person", sortable: true, render: (x) => x.person ?? DASH },
          { key: "email", label: "Email", sortable: true, render: (x) => x.email ?? DASH },
          { key: "phone", label: "Phone", render: (x) => x.phone ?? DASH },
          { key: "city", label: "City", sortable: true, render: (x) => [x.city, x.country].filter(Boolean).join(", ") || DASH },
          { key: "status", label: "Meeting", sortable: true, render: (x) => (
            <select aria-label={`Meeting with ${x.company}`} className={ctl} value={x.status} onClick={(e) => e.stopPropagation()}
              onChange={(e) => void patch(x, { status: e.target.value as PerfumeShowContactStatus })} data-testid={`perfume-show-status-${x.id}`}>
              {(Object.keys(STATUS_TEXT) as PerfumeShowContactStatus[]).map((k) => <option key={k} value={k}>{STATUS_TEXT[k]}</option>)}
            </select>) },
          { key: "meeting_at", label: "When", sortable: true, render: (x) => (
            <span onClick={(e) => e.stopPropagation()}>
              <DateTimePicker aria-label={`Meeting time with ${x.company}`} className={ctl} value={localWallClock(x.meeting_at)}
                onChange={(v) => void patch(x, { meeting_at: v ? new Date(v).toISOString() : null })} />
            </span>) },
          { key: "booth", label: "Booth", sortable: true, render: (x) => x.booth ?? DASH },
          { key: "note", label: "Note", render: (x) => x.note ?? DASH },
          { key: "remove", label: "", render: (x) => (
            <Button type="button" variant="secondary" className="h-[28px] px-2 text-xs" onClick={(e) => { e.stopPropagation(); void patch(x, { archived: true }); }}>
              {tr("perfume.shows.remove", "Take off")}
            </Button>) },
        ]}
      />
    </section>
  );
}
