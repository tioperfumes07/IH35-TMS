/**
 * PERFUME-CAMPAIGNS — the mass email campaign (design board 4, owner 2026-11-26 16:59 CT "ok get this all completely done now").
 * Three steps on one screen: WHO (a saved segment or the Contacts filters — role, country, state, city, category, source, how),
 * WHAT (subject and message in English and Spanish, attachments, my offer list as Excel), WHEN (now or one scheduled time,
 * and the pace per hour). The audience count is read live from the contacts database: one row per email address, the
 * phone-only and opted-out left out. Sending goes only from jpm@tioperfumes.com through the desk's own send batches
 * (500 addresses each, daily cap, opt-outs always skipped). A test goes to jpm@ itself first.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { MultiSelectDropdown } from "../../components/forms/MultiSelectDropdown";
import { DateTimePicker } from "../../components/forms/DateTimePicker";
import { ParityTable } from "../../components/parity/ParityTable";
import { KpiCard } from "../../components/layout/KpiCard";
import { useToast } from "../../components/Toast";
import { ListErrorState } from "../../components/ListErrorState";
import { userFacingApiError } from "../../lib/api-error-message";
import {
  addPerfumeCampaignAttachment, archivePerfumeSegment, fetchPerfumeOfferExcel, getPerfumeAudience, getPerfumeCampaign, listPerfumeCampaigns,
  listPerfumeContacts, listPerfumeSegments, removePerfumeCampaignAttachment, savePerfumeCampaign, savePerfumeSegment, sendPerfumeCampaign,
  stopPerfumeCampaign, testPerfumeCampaign,
  type PerfumeCampaign, type PerfumeCampaignFilters, type PerfumeCampaignInput, type PerfumeContactFacet, type PerfumeContactRole,
} from "../../api/perfume";
import { tr } from "./perfumeI18n";

const DASH = "—";
const ctl = "h-[34px] rounded-sm border border-[#C6D1DC] bg-white px-2 text-xs";
const area = "w-full rounded-sm border border-[#C6D1DC] bg-white p-2 text-xs";
const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "short", timeStyle: "short" }) + " CT" : DASH);
const STATUS_TEXT: Record<PerfumeCampaign["status"], string> = { draft: "Draft", scheduled: "Scheduled", sending: "Sending", sent: "Sent", stopped: "Stopped", failed: "Failed" };
const ROLES: Array<[PerfumeContactRole | "none", string]> = [["customer", "Customers"], ["vendor", "Vendors"], ["both", "Vendor + customer"], ["none", "Not classified"]];
const FACETS: Array<{ facet: PerfumeContactFacet; key: keyof PerfumeCampaignFilters; label: string; all: string }> = [
  { facet: "country", key: "countries", label: "Country", all: "All countries" },
  { facet: "state", key: "states", label: "State", all: "All states" },
  { facet: "city", key: "cities", label: "City", all: "All cities" },
  { facet: "category", key: "categories", label: "Category", all: "All categories" },
  { facet: "source", key: "sources", label: "Source", all: "All sources" },
  { facet: "how", key: "hows", label: "How it started", all: "Every way" },
];

type Draft = PerfumeCampaignInput & { status?: PerfumeCampaign["status"] };
const EMPTY: Draft = { name: "", filters: {}, language: "auto", subject_en: "", subject_es: "", body_en: "", body_es: "", per_hour: 600, segment_id: null };

/** A wall-clock "YYYY-MM-DDTHH:mm" (the picker's value) for an ISO instant. */
function localWallClock(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function PerfumeCampaignPanel() {
  const campaigns = useQuery({ queryKey: ["perfume", "campaigns"], queryFn: listPerfumeCampaigns, refetchInterval: 15_000 });
  const [open, setOpen] = useState<string | "new" | null>(null);
  const all = campaigns.data?.campaigns ?? [];
  const sending = all.filter((c) => c.status === "sending").length;
  const scheduled = all.filter((c) => c.status === "scheduled").length;
  const sent = all.reduce((t, c) => t + c.sent, 0);

  if (campaigns.isError) return <ListErrorState title={tr("perfume.cmp.error", "Couldn't load the campaigns")} status={0} message={(campaigns.error as Error)?.message} onRetry={() => void campaigns.refetch()} />;
  return (
    <div className="space-y-3" data-testid="perfume-campaign-panel">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <KpiCard label={tr("perfume.cmp.kpi_all", "Campaigns")} number={all.length.toLocaleString()} />
        <KpiCard label={tr("perfume.cmp.kpi_sending", "Sending now")} number={sending.toLocaleString()} />
        <KpiCard label={tr("perfume.cmp.kpi_scheduled", "Scheduled")} number={scheduled.toLocaleString()} />
        <KpiCard label={tr("perfume.cmp.kpi_sent", "Emails sent")} number={sent.toLocaleString()} />
      </div>
      <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" aria-label={tr("perfume.cmp.title", "Mass email campaigns")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-section-header">{tr("perfume.cmp.title", "Mass email campaigns")}</div>
          <Button type="button" className="h-[34px] px-3 text-xs" data-testid="perfume-cmp-new" onClick={() => setOpen("new")}>{tr("perfume.cmp.new", "New campaign")}</Button>
        </div>
        <ParityTable<PerfumeCampaign>
          rows={all}
          rowKey={(c) => c.id}
          loading={campaigns.isLoading}
          storageKey="perfume-campaigns-v1"
          suppressToolbarSearch
          emptyText="No campaign yet — start one with New campaign."
          onRowClick={(c) => setOpen(c.id)}
          columns={[
            { key: "name", label: "Campaign", sortable: true, render: (c) => <span className="font-semibold">{c.name}</span> },
            { key: "status", label: "Status", sortable: true, render: (c) => STATUS_TEXT[c.status] },
            { key: "segment_name", label: "Segment", sortable: true, render: (c) => c.segment_name ?? DASH },
            { key: "language", label: "Language", render: (c) => (c.language === "auto" ? "Each in their language" : c.language === "es" ? "Spanish" : "English") },
            { key: "scheduled_for", label: "Scheduled", sortable: true, render: (c) => when(c.scheduled_for) },
            { key: "recipients", label: "Recipients", sortable: true, kind: "number", cellClass: "text-right tabular-nums", render: (c) => c.recipients.toLocaleString() },
            { key: "sent", label: "Sent", sortable: true, kind: "number", cellClass: "text-right tabular-nums", render: (c) => c.sent.toLocaleString() },
            { key: "skipped", label: "Skipped", sortable: true, kind: "number", cellClass: "text-right tabular-nums", render: (c) => c.skipped.toLocaleString() },
            { key: "failed", label: "Failed", sortable: true, kind: "number", cellClass: "text-right tabular-nums", render: (c) => c.failed.toLocaleString() },
            { key: "updated_at", label: "Updated", sortable: true, render: (c) => when(c.updated_at) },
          ]}
        />
      </section>
      {open ? <CampaignEditor key={open} id={open === "new" ? null : open} onClose={() => setOpen(null)} onChanged={(id) => { void campaigns.refetch(); if (id) setOpen(id); }} /> : null}
    </div>
  );
}

function CampaignEditor({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: (id?: string) => void }) {
  const { pushToast } = useToast();
  const detail = useQuery({ queryKey: ["perfume", "campaign", id], queryFn: () => getPerfumeCampaign(id!), enabled: Boolean(id), refetchInterval: 10_000 });
  const segments = useQuery({ queryKey: ["perfume", "segments"], queryFn: listPerfumeSegments });
  const [d, setD] = useState<Draft>(EMPTY);
  const [loaded, setLoaded] = useState(!id);
  const [segName, setSegName] = useState("");
  const [schedule, setSchedule] = useState("");
  const [busy, setBusy] = useState(false);
  const cmp = detail.data?.campaign;
  useEffect(() => {
    if (!cmp || loaded) return;
    setD({ id: cmp.id, name: cmp.name, segment_id: cmp.segment_id, filters: cmp.filters ?? {}, language: cmp.language, subject_en: cmp.subject_en ?? "",
      subject_es: cmp.subject_es ?? "", body_en: cmp.body_en ?? "", body_es: cmp.body_es ?? "", per_hour: cmp.per_hour, status: cmp.status });
    setSchedule(localWallClock(cmp.scheduled_for));
    setLoaded(true);
  }, [cmp, loaded]);
  const status = cmp?.status ?? "draft";
  const editable = ["draft", "stopped", "failed", "scheduled"].includes(status);
  const f = d.filters;
  const facetQuery = useMemo(() => ({ limit: 1, q: f.q, countries: f.countries, states: f.states, cities: f.cities, categories: f.categories, sources: f.sources, hows: f.hows }), [f]);
  const facets = useQuery({ queryKey: ["perfume", "contacts", "facets", facetQuery], queryFn: () => listPerfumeContacts(facetQuery) });
  const audience = useQuery({ queryKey: ["perfume", "audience", d.filters, d.language], queryFn: () => getPerfumeAudience(d.filters, d.language) });
  const setFilters = (patch: Partial<PerfumeCampaignFilters>) => setD((x) => ({ ...x, segment_id: null, filters: { ...x.filters, ...patch } }));

  const save = async (): Promise<string | null> => {
    if (!d.name.trim()) { pushToast(tr("perfume.cmp.need_name", "Give the campaign a name first."), "error"); return null; }
    try {
      const body: PerfumeCampaignInput = { ...d, subject_en: d.subject_en || null, subject_es: d.subject_es || null, body_en: d.body_en || null, body_es: d.body_es || null };
      delete (body as Draft).status;
      const r = await savePerfumeCampaign(body);
      setD((x) => ({ ...x, id: r.id }));
      return r.id;
    } catch (e) { pushToast(userFacingApiError(e, "Not saved"), "error"); return null; }
  };
  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); pushToast(label, "success"); } catch (e) { pushToast(userFacingApiError(e, "Not done"), "error"); }
    finally { setBusy(false); await detail.refetch(); }
  };
  const onSave = () => run(tr("perfume.cmp.saved", "Campaign saved"), async () => { const nid = await save(); if (!nid) throw new Error("Not saved"); onChanged(nid); });
  const attach = async (name: string, mime: string, buf: ArrayBuffer) => {
    const cid = d.id ?? (await save());
    if (!cid) return;
    await run(`${name} attached`, () => addPerfumeCampaignAttachment(cid, { name, mime_type: mime || "application/octet-stream", content_base64: toBase64(buf) }));
    onChanged(cid);
  };
  const onFiles = async (files: FileList | null) => { for (const file of Array.from(files ?? [])) await attach(file.name, file.type, await file.arrayBuffer()); };
  const onOffer = async () => {
    try { const x = await fetchPerfumeOfferExcel(); await attach(x.name, x.mime, x.bytes); } catch (e) { pushToast(userFacingApiError(e, "Offer list not attached"), "error"); }
  };
  const onTest = (lang: "en" | "es") => run(tr("perfume.cmp.test_sent", "Test sent to jpm@tioperfumes.com"), async () => { const cid = await save(); if (!cid) throw new Error("Not saved"); await testPerfumeCampaign(cid, lang); });
  const onSend = (later: boolean) => run(later ? tr("perfume.cmp.scheduled", "Campaign scheduled") : tr("perfume.cmp.started", "Campaign is sending"), async () => {
    const cid = await save(); if (!cid) throw new Error("Not saved");
    await sendPerfumeCampaign(cid, later && schedule ? new Date(schedule).toISOString() : null);
    onChanged(cid);
  });
  const onSaveSegment = () => run(`${segName} saved`, async () => { const r = await savePerfumeSegment({ name: segName.trim(), filters: d.filters }); setD((x) => ({ ...x, segment_id: r.id })); setSegName(""); await segments.refetch(); });
  const pickSegment = (sid: string) => {
    const s = segments.data?.segments.find((x) => x.id === sid);
    setD((x) => ({ ...x, segment_id: s?.id ?? null, filters: s ? s.filters : x.filters }));
  };
  const a = audience.data;
  const recipients = d.language === "auto" ? (a?.recipients ?? 0) : (a?.recipients ?? 0);
  const perHour = Math.max(10, Math.min(3000, d.per_hour || 600));
  const hours = recipients ? Math.ceil(recipients / perHour) : 0;

  if (id && detail.isError) return <ListErrorState title={tr("perfume.cmp.error_one", "Couldn't load the campaign")} status={0} message={(detail.error as Error)?.message} onRetry={() => void detail.refetch()} />;
  return (
    <section className="space-y-3 rounded-[3px] border border-[#D8E0E8] bg-white p-3" data-testid="perfume-cmp-editor" aria-label={d.name || tr("perfume.cmp.new", "New campaign")}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <label className="text-xs">{tr("perfume.cmp.name", "Campaign name")}
          <input className={`${ctl} block w-[320px] max-w-full`} value={d.name} disabled={!editable} onChange={(e) => setD((x) => ({ ...x, name: e.target.value }))} data-testid="perfume-cmp-name" />
        </label>
        <div className="text-xs text-[#64748B]">{tr("perfume.cmp.status", "Status")}: <span className="font-semibold text-[#1F2A44]">{STATUS_TEXT[status]}</span>
          {cmp?.scheduled_for ? ` · ${when(cmp.scheduled_for)}` : ""}{cmp?.error ? ` · ${cmp.error}` : ""}</div>
        <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>{tr("perfume.cmp.close", "Close")}</Button>
      </div>

      {/* 1 · WHO */}
      <div className="space-y-2 border-t border-[#E8EDF2] pt-2" data-testid="perfume-cmp-who">
        <div className="text-section-header font-bold uppercase tracking-wide text-[#4B5563]">{tr("perfume.cmp.who", "1 · Who")}</div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label={tr("perfume.cmp.segment", "Saved segment")} className={ctl} value={d.segment_id ?? ""} disabled={!editable} onChange={(e) => pickSegment(e.target.value)} data-testid="perfume-cmp-segment">
            <option value="">{tr("perfume.cmp.no_segment", "Filters below (no saved segment)")}</option>
            {(segments.data?.segments ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {d.segment_id ? <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={busy}
            onClick={() => void run(tr("perfume.cmp.segment_archived", "Segment archived"), async () => { await archivePerfumeSegment(d.segment_id!); setD((x) => ({ ...x, segment_id: null })); await segments.refetch(); })}>
            {tr("perfume.cmp.segment_archive", "Archive segment")}</Button> : null}
          {ROLES.map(([r, label]) => {
            const on = (f.roles ?? []).includes(r);
            return (
              <button key={r} type="button" aria-pressed={on} disabled={!editable} data-testid={`perfume-cmp-role-${r}`}
                onClick={() => setFilters({ roles: on ? (f.roles ?? []).filter((x) => x !== r) : [...(f.roles ?? []), r] })}
                className={`h-[34px] rounded-sm border px-3 text-xs ${on ? "border-[#14314F] bg-[#14314F] font-semibold text-white" : "border-[#C6D1DC] bg-[var(--surface-unselected)] text-[#1F2A44]"}`}>
                {tr(`perfume.cmp.role_${r}`, label)}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {FACETS.map((x) => (
            <MultiSelectDropdown key={x.facet} label={tr(`perfume.cmp.f_${x.facet}`, x.label)} allLabel={tr(`perfume.cmp.f_all_${x.facet}`, x.all)} searchable data-testid={`perfume-cmp-filter-${x.facet}`}
              options={(facets.data?.facets?.[x.facet] ?? []).map((o) => ({ value: o.value, label: `${o.value} (${o.count.toLocaleString()})` }))}
              selected={(f[x.key] as string[] | undefined) ?? []} onChange={(v) => setFilters({ [x.key]: v })} />
          ))}
          <input type="search" aria-label={tr("perfume.cmp.q", "Search contacts")} placeholder={tr("perfume.cmp.q_ph", "Company, person, email, city")} className={`${ctl} min-w-[200px] flex-1`}
            value={f.q ?? ""} disabled={!editable} onChange={(e) => setFilters({ q: e.target.value })} data-testid="perfume-cmp-q" />
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-6" data-testid="perfume-cmp-audience">
          <KpiCard label={tr("perfume.cmp.a_recipients", "Will receive it")} number={audience.isLoading ? "…" : (a?.recipients ?? 0).toLocaleString()} />
          <KpiCard label={tr("perfume.cmp.a_en", "In English")} number={(a?.en ?? 0).toLocaleString()} />
          <KpiCard label={tr("perfume.cmp.a_es", "In Spanish")} number={(a?.es ?? 0).toLocaleString()} />
          <KpiCard label={tr("perfume.cmp.a_companies", "Companies")} number={(a?.companies ?? 0).toLocaleString()} />
          <KpiCard label={tr("perfume.cmp.a_phone", "Phone only (left out)")} number={(a?.phone_only ?? 0).toLocaleString()} />
          <KpiCard label={tr("perfume.cmp.a_out", "Opted out / bad address")} number={`${(a?.opted_out ?? 0).toLocaleString()} / ${(a?.invalid ?? 0).toLocaleString()}`} />
        </div>
        {a?.sample?.length ? <div className="text-xs text-[#64748B]">{tr("perfume.cmp.sample", "First addresses")}: {a.sample.map((s) => `${s.email} (${s.language.toUpperCase()})`).join(" · ")}</div> : null}
        <div className="flex flex-wrap items-center gap-2">
          <input className={`${ctl} w-[260px] max-w-full`} placeholder={tr("perfume.cmp.segment_name", "Save these filters as a segment — name")} value={segName}
            onChange={(e) => setSegName(e.target.value)} data-testid="perfume-cmp-segment-name" />
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={!segName.trim() || busy} onClick={() => void onSaveSegment()} data-testid="perfume-cmp-segment-save">
            {tr("perfume.cmp.segment_save", "Save segment")}</Button>
        </div>
      </div>

      {/* 2 · WHAT */}
      <div className="space-y-2 border-t border-[#E8EDF2] pt-2" data-testid="perfume-cmp-what">
        <div className="text-section-header font-bold uppercase tracking-wide text-[#4B5563]">{tr("perfume.cmp.what", "2 · What")}</div>
        <label className="text-xs">{tr("perfume.cmp.language", "Language")}
          <select className={`${ctl} ml-2`} value={d.language} disabled={!editable} onChange={(e) => setD((x) => ({ ...x, language: e.target.value as Draft["language"] }))} data-testid="perfume-cmp-language">
            <option value="auto">{tr("perfume.cmp.lang_auto", "Each in their language (Mexico, Latin America, Spain → Spanish)")}</option>
            <option value="en">{tr("perfume.cmp.lang_en", "Everyone in English")}</option>
            <option value="es">{tr("perfume.cmp.lang_es", "Everyone in Spanish")}</option>
          </select>
        </label>
        <div className="grid gap-3 md:grid-cols-2">
          {(["en", "es"] as const).map((l) => (
            <div key={l} className="space-y-1">
              <div className="text-xs font-semibold text-[#1F2A44]">{l === "en" ? tr("perfume.cmp.english", "English") : tr("perfume.cmp.spanish", "Spanish")}</div>
              <input className={`${ctl} w-full`} placeholder={tr("perfume.cmp.subject", "Subject")} value={(l === "en" ? d.subject_en : d.subject_es) ?? ""} disabled={!editable}
                onChange={(e) => setD((x) => ({ ...x, [`subject_${l}`]: e.target.value }))} data-testid={`perfume-cmp-subject-${l}`} />
              <textarea className={area} rows={8} placeholder={tr("perfume.cmp.body", "Message")} value={(l === "en" ? d.body_en : d.body_es) ?? ""} disabled={!editable}
                onChange={(e) => setD((x) => ({ ...x, [`body_${l}`]: e.target.value }))} data-testid={`perfume-cmp-body-${l}`} />
            </div>
          ))}
        </div>
        <div className="text-xs text-[#64748B]">{tr("perfume.cmp.one_language", "If only one language is written, it goes to everyone.")}</div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs">
            <span className="sr-only">{tr("perfume.cmp.attach", "Attach files")}</span>
            <input type="file" multiple disabled={!editable || busy} className="text-xs" onChange={(e) => { void onFiles(e.target.files); e.target.value = ""; }} data-testid="perfume-cmp-file" />
          </label>
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={!editable || busy} onClick={() => void onOffer()} data-testid="perfume-cmp-offer">
            {tr("perfume.cmp.offer", "Attach my offer list (Excel)")}</Button>
        </div>
        {(detail.data?.attachments ?? []).length ? (
          <ul className="space-y-1" data-testid="perfume-cmp-attachments">
            {detail.data!.attachments.map((x) => (
              <li key={x.id} className="flex items-center gap-2 text-xs">
                <span className="font-semibold">{x.file_name}</span><span className="text-[#64748B]">{(x.bytes / 1024).toLocaleString("en-US", { maximumFractionDigits: 0 })} KB</span>
                {editable ? <Button type="button" variant="secondary" className="h-[28px] px-2 text-xs" disabled={busy}
                  onClick={() => void run(`${x.file_name} removed`, () => removePerfumeCampaignAttachment(d.id!, x.id))}>{tr("perfume.cmp.remove", "Remove")}</Button> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* 3 · WHEN */}
      <div className="space-y-2 border-t border-[#E8EDF2] pt-2" data-testid="perfume-cmp-when">
        <div className="text-section-header font-bold uppercase tracking-wide text-[#4B5563]">{tr("perfume.cmp.when", "3 · When")}</div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs">{tr("perfume.cmp.per_hour", "Emails per hour")}
            <input type="number" min={10} max={3000} className={`${ctl} block w-[120px]`} value={d.per_hour} disabled={!editable}
              onChange={(e) => setD((x) => ({ ...x, per_hour: Number(e.target.value) }))} data-testid="perfume-cmp-per-hour" />
          </label>
          <label className="text-xs">{tr("perfume.cmp.schedule", "Send at (your time)")}
            <DateTimePicker aria-label={tr("perfume.cmp.schedule", "Send at (your time)")} className={ctl} value={schedule} onChange={(v) => setSchedule(v)} />
          </label>
          <div className="text-xs text-[#64748B]">{recipients ? `${recipients.toLocaleString()} ${tr("perfume.cmp.at", "addresses at")} ${perHour.toLocaleString()}/${tr("perfume.cmp.hour", "hour")} ≈ ${hours.toLocaleString()} h` : ""}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={!editable || busy} onClick={() => void onSave()} data-testid="perfume-cmp-save">{tr("perfume.cmp.save", "Save draft")}</Button>
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={busy} onClick={() => void onTest("en")} data-testid="perfume-cmp-test-en">{tr("perfume.cmp.test_en", "Send me a test (English)")}</Button>
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={busy} onClick={() => void onTest("es")} data-testid="perfume-cmp-test-es">{tr("perfume.cmp.test_es", "Send me a test (Spanish)")}</Button>
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={!editable || busy || !recipients} onClick={() => void onSend(false)} data-testid="perfume-cmp-send">
            {tr("perfume.cmp.send_now", "Send now")}{recipients ? ` · ${recipients.toLocaleString()}` : ""}</Button>
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={!editable || busy || !recipients || !schedule} onClick={() => void onSend(true)} data-testid="perfume-cmp-schedule">
            {tr("perfume.cmp.schedule_btn", "Schedule")}</Button>
          {status === "sending" || status === "scheduled" ? (
            <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={busy}
              onClick={() => void run(tr("perfume.cmp.stopped", "Campaign stopped"), async () => { await stopPerfumeCampaign(d.id!); onChanged(d.id); })} data-testid="perfume-cmp-stop">
              {tr("perfume.cmp.stop", "Stop")}</Button>) : null}
        </div>
        {cmp ? <div className="text-xs text-[#64748B]" data-testid="perfume-cmp-counts">{`${tr("perfume.cmp.c_recipients", "Recipients")} ${cmp.recipients.toLocaleString()} · ${tr("perfume.cmp.c_sent", "sent")} ${cmp.sent.toLocaleString()} · ${tr("perfume.cmp.c_skipped", "skipped")} ${cmp.skipped.toLocaleString()} · ${tr("perfume.cmp.c_failed", "failed")} ${cmp.failed.toLocaleString()}`}{cmp.started_at ? ` · ${tr("perfume.cmp.c_started", "started")} ${when(cmp.started_at)}` : ""}{cmp.finished_at ? ` · ${tr("perfume.cmp.c_finished", "finished")} ${when(cmp.finished_at)}` : ""}</div> : null}
        {(detail.data?.batches ?? []).length ? (
          <ParityTable
            title={tr("perfume.cmp.batches", "Send batches")}
            rows={detail.data!.batches}
            rowKey={(b) => b.id}
            storageKey="perfume-campaign-batches-v1"
            suppressToolbarSearch
            emptyText="No batch yet."
            columns={[
              { key: "seq", label: "#", sortable: true, kind: "number", cellClass: "text-right tabular-nums", render: (b) => String(b.seq) },
              { key: "language", label: "Language", render: (b) => (b.language === "es" ? "Spanish" : "English") },
              { key: "status", label: "Status", render: (b) => b.status },
              { key: "recipients", label: "Addresses", kind: "number", cellClass: "text-right tabular-nums", render: (b) => b.recipients.toLocaleString() },
              { key: "sent", label: "Sent", kind: "number", cellClass: "text-right tabular-nums", render: (b) => b.sent.toLocaleString() },
              { key: "skipped", label: "Skipped", kind: "number", cellClass: "text-right tabular-nums", render: (b) => b.skipped.toLocaleString() },
              { key: "failed", label: "Failed", kind: "number", cellClass: "text-right tabular-nums", render: (b) => b.failed.toLocaleString() },
              { key: "error", label: "Error", render: (b) => b.error ?? DASH },
            ]}
          />
        ) : null}
      </div>
    </section>
  );
}
