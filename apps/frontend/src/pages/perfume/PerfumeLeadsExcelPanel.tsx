/**
 * PERFUME-LEADS · Excel update (owner 2026-11-26 17:38 CT: "i need to be able to filter and categorize in an excel and then
 * upload, and then see what is not necessary"). Download every contact as Excel → filter, categorize, mark Remove → upload
 * → see every change, removal, new lead and new type BEFORE anything is saved → Apply. The same upload takes the organized
 * contacts files (Emails / Leaked emails with the sender on every row / Phone contacts by country) as new leads, each with
 * its source kind. Removed contacts are archived, never deleted.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { ParityTable } from "../../components/parity/ParityTable";
import { KpiCard } from "../../components/layout/KpiCard";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import {
  applyPerfumeContactUpload, discardPerfumeContactUpload, downloadPerfumeContactsExcel, getPerfumeContactUpload, listPerfumeContactUploads,
  uploadPerfumeContacts, type PerfumeUploadKind, type PerfumeUploadRow, type PerfumeUploadSummary,
} from "../../api/perfume";
import { tr } from "./perfumeI18n";
import { jumpTo } from "./PerfumeTradersPanel";

const DASH = "—";
const n = (v: number | null | undefined) => (v ?? 0).toLocaleString("en-US");
const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "short", timeStyle: "short" }) + " CT" : DASH);
export const KIND_TEXT: Record<PerfumeUploadKind | "skipped", string> = {
  export: "Leads download (with IDs)", email: "Emails", leaked: "Leaked emails", phone: "Phone contacts", research: "Research prospects (INEGI never read)",
  removed: "Removed-Check list", other: "Other sheet (new leads)", skipped: "Not read",
};
const FIELD_TEXT: Record<string, string> = { company: "Company", role: "Role", vendor_type: "Vendor type", customer_type: "Customer type", category: "Category",
  other_categories: "Other categories", segment: "Business type", status: "Status", country: "Country", state: "State", city: "City", region: "Region",
  address: "Address", website: "Website", notes: "Notes", person: "Person", title: "Title", email: "Email", phones: "Phones" };
/** File categories that are not perfume leads yet — skipped by default, one click to include. */
const DEFAULT_SKIP = ["Unclassified - review", "Other contact - review", "Local 956 / 210 / 867 - likely personal (review)", "Trucking / transport (IH / IH35 etc.)"];

/** Every sheet of the workbook as rows of cells; dates come out as YYYY-MM-DD so first / last email dates survive. */
export async function readWorkbook(file: File) {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const p2 = (x: number) => String(x).padStart(2, "0");
  const cell = (v: unknown): string | number | boolean | null =>
    v instanceof Date ? `${v.getFullYear()}-${p2(v.getMonth() + 1)}-${p2(v.getDate())}` : typeof v === "number" ? String(v) : (v as string | boolean | null) ?? null;
  return wb.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name]!, { header: 1, raw: true, defval: null, blankrows: false }).map((r) => r.map(cell)),
  }));
}

export function PerfumeLeadsExcelPanel() {
  const { pushToast } = useToast();
  const uploads = useQuery({ queryKey: ["perfume", "contact-uploads"], queryFn: listPerfumeContactUploads });
  const [busy, setBusy] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const download = async () => {
    setBusy("download");
    try { const rows = await downloadPerfumeContactsExcel(); pushToast(`${n(rows)} ${tr("perfume.leadsx.rows_downloaded", "rows downloaded")}`, "success"); }
    catch (e) { pushToast(userFacingApiError(e, "Download failed"), "error"); } finally { setBusy(null); }
  };
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy("upload");
    try {
      const sheets = await readWorkbook(file);
      const r = await uploadPerfumeContacts({ file_name: file.name, sheets });
      setOpenId(r.id);
      await uploads.refetch();
    } catch (e) { pushToast(userFacingApiError(e, "Upload failed"), "error"); } finally { setBusy(null); }
  };

  return (
    <div className="space-y-3" data-testid="perfume-leads-excel-panel">
      <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" aria-label={tr("perfume.leadsx.title", "Update the contacts in Excel")}>
        <div className="text-card-title">{tr("perfume.leadsx.title", "Update the contacts in Excel")}</div>
        <ol className="list-decimal space-y-0.5 pl-5 text-xs text-[#1F2A44]">
          <li>{tr("perfume.leadsx.s1", "Download every contact — one row per person, with drop-downs for role, types, category and status from the Catalogs.")}</li>
          <li>{tr("perfume.leadsx.s2", "Filter and categorize in Excel. Mark a row Remove company or Remove person if it is not needed. Add new leads at the bottom, or as their own sheets (Emails, Leaked emails, Phone contacts).")}</li>
          <li>{tr("perfume.leadsx.s3", "Upload it here. You see every change, removal, new lead and new type first — nothing is saved until you press Apply. Removed contacts are archived, never deleted.")}</li>
        </ol>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy !== null} onClick={() => void download()} data-testid="perfume-leadsx-download">
            {busy === "download" ? tr("perfume.leadsx.downloading", "Preparing…") : tr("perfume.leadsx.download", "Download all contacts (Excel)")}
          </Button>
          <label className={`inline-flex h-[34px] cursor-pointer items-center rounded-sm border border-[#14314F] px-3 text-xs font-semibold text-[#14314F] ${busy ? "pointer-events-none opacity-50" : ""}`}>
            {busy === "upload" ? tr("perfume.leadsx.reading", "Reading the file…") : tr("perfume.leadsx.upload", "Upload Excel to review")}
            <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" data-testid="perfume-leadsx-file"
              onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        </div>
      </section>

      {openId ? <UploadReview id={openId} onClose={() => setOpenId(null)} onChanged={() => void uploads.refetch()} /> : null}

      <section className="rounded-[3px] border border-[#D8E0E8] bg-white p-3" aria-label={tr("perfume.leadsx.history", "Uploads")}>
        <ParityTable<PerfumeUploadRow> selectable
          cardTitle title={tr("perfume.leadsx.history", "Uploads")}
          rows={uploads.data?.uploads ?? []}
          rowKey={(u) => u.id}
          loading={uploads.isLoading}
          storageKey="perfume-contact-uploads-v1"

          exportFilename="TIO contact uploads"

          exportExcel
          suppressToolbarSearch
          emptyText="No upload yet."
          onRowClick={(u) => setOpenId(u.id)}
          columns={[
            { key: "created_at", label: "Uploaded", sortable: true, render: (u) => when(u.created_at) },
            { key: "file_name", label: "File", sortable: true, render: (u) => <span className="font-semibold">{u.file_name}</span> },
            { key: "status", label: "Status", sortable: true, render: (u) => u.status },
            { key: "changes", label: "Changes", kind: "number", cellClass: "text-right tabular-nums", render: (u) => n((u.existing?.companies_changed ?? 0) + (u.existing?.people_changed ?? 0)) },
            { key: "removals", label: "Removals", kind: "number", cellClass: "text-right tabular-nums", render: (u) => n((u.existing?.remove_companies ?? 0) + (u.existing?.remove_people ?? 0)) },
            { key: "new", label: "New leads", kind: "number", cellClass: "text-right tabular-nums", render: (u) => n(u.new?.records) },
            { key: "inserted", label: "Added", kind: "number", cellClass: "text-right tabular-nums", render: (u) => (u.result ? n(u.result.inserted) : DASH) },
            { key: "applied_at", label: "Applied", sortable: true, render: (u) => when(u.applied_at) },
          ]}
        />
      </section>
    </div>
  );
}

function UploadReview({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { pushToast } = useToast();
  const up = useQuery({
    queryKey: ["perfume", "contact-upload", id], queryFn: () => getPerfumeContactUpload(id),
    refetchInterval: (q) => (q.state.data?.status === "applying" ? 2000 : false),
  });
  const s = up.data?.summary;
  const [skipCats, setSkipCats] = useState<string[] | null>(null);
  const [skipKinds, setSkipKinds] = useState<PerfumeUploadKind[]>([]);
  const [addUnknown, setAddUnknown] = useState(true);
  const [applyRemoved, setApplyRemoved] = useState(false);
  const status = up.data?.status;
  useEffect(() => { if (status === "applied" || status === "failed") onChanged(); }, [status, onChanged]);
  const cats = useMemo(() => Object.entries(s?.new.by_category ?? {}).sort((a, b) => b[1].records - a[1].records), [s]);
  const skip = skipCats ?? cats.map(([k]) => k).filter((k) => DEFAULT_SKIP.includes(k));
  const kept = cats.filter(([k]) => !skip.includes(k)).reduce((t, [, v]) => t + v.records, 0);
  const editable = status === "previewed" || status === "failed";

  const apply = async () => {
    try { await applyPerfumeContactUpload(id, { skip_categories: skip, skip_kinds: skipKinds, add_unknown: addUnknown, apply_removed_check: applyRemoved }); await up.refetch(); }
    catch (e) { pushToast(userFacingApiError(e, "Not applied"), "error"); }
  };
  const discard = async () => {
    try { await discardPerfumeContactUpload(id); onChanged(); onClose(); } catch (e) { pushToast(userFacingApiError(e, "Not discarded"), "error"); }
  };

  if (!s) return <section className="rounded-[3px] border border-[#D8E0E8] bg-white p-3 text-xs" data-testid="perfume-leadsx-review">{tr("perfume.leadsx.loading", "Reading the upload…")}</section>;
  const ex = s.existing;
  const r = up.data?.result;
  return (
    <section className="space-y-3 rounded-[3px] border border-[#D8E0E8] bg-white p-3" data-testid="perfume-leadsx-review" aria-label={s.file_name}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-card-title">{s.file_name}</div>
          <div className="text-xs text-[#64748B]">{s.sheets.map((x) => `${x.name}: ${KIND_TEXT[x.kind]}${x.kind === "skipped" ? "" : ` · ${n(x.used)} rows`}`).join("  ·  ")}</div>
        </div>
        <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>{tr("perfume.leadsx.close", "Close")}</Button>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6" data-testid="perfume-leadsx-kpis">
        <KpiCard label={tr("perfume.leadsx.k_changes", "Contacts changed")} number={n(ex.companies_changed + ex.people_changed)} onClick={() => jumpTo("perfume-leadsx-changes")} />
        <KpiCard label={tr("perfume.leadsx.k_remove", "To remove (archive)")} number={n(ex.remove_companies + ex.remove_people)} onClick={() => jumpTo("perfume-leadsx-removals")} />
        <KpiCard label={tr("perfume.leadsx.k_new", "New leads in the file")} number={n(s.new.records)} onClick={() => jumpTo("perfume-leadsx-new")} />
        <KpiCard label={tr("perfume.leadsx.k_join", "… already on file (joined)")} number={n(s.new.would_match)} onClick={() => jumpTo("perfume-leadsx-new")} />
        <KpiCard label={tr("perfume.leadsx.k_add", "… new companies")} number={n(s.new.would_insert)} onClick={() => jumpTo("perfume-leadsx-new")} />
        <KpiCard label={tr("perfume.leadsx.k_unknown", "New types")} number={n(Object.values(s.unknown).reduce((t, v) => t + (v?.length ?? 0), 0))} onClick={() => jumpTo("perfume-leadsx-unknown")} />
      </div>
      {ex.not_found || ex.conflicts ? (
        <div className="bg-amber-50 px-2 py-1 text-xs text-amber-900" role="status">
          {ex.not_found ? `${n(ex.not_found)} ${tr("perfume.leadsx.not_found", "rows carry an ID that is no longer on file (removed earlier) — they are left out.")} ` : ""}
          {ex.conflicts ? `${n(ex.conflicts)} ${tr("perfume.leadsx.conflicts", "fields got two different values on rows of the same company — those fields are left as they are:")} ${s.conflicts.slice(0, 5).map((c) => `${c.company} · ${FIELD_TEXT[c.field] ?? c.field} (${c.values.join(" / ")})`).join("; ")}` : ""}
        </div>
      ) : null}

      {s.changes.length ? (
        <div id="perfume-leadsx-changes">
        <ParityTable selectable
          cardTitle title={`${tr("perfume.leadsx.changes", "Changes")} (${n(s.changes_total)})`}
          rows={s.changes.map((c, i) => ({ ...c, i }))}
          rowKey={(c) => String(c.i)}
          storageKey="perfume-upload-changes-v1"

          exportFilename="TIO upload changes"

          exportExcel
          emptyText="No change."
          columns={[
            { key: "company", label: "Company", sortable: true, render: (c) => <span className="font-semibold">{c.company}</span> },
            { key: "person", label: "Person", sortable: true, render: (c) => c.person ?? DASH },
            { key: "field", label: "Field", sortable: true, render: (c) => FIELD_TEXT[c.field] ?? c.field },
            { key: "from", label: "Now", render: (c) => c.from ?? DASH },
            { key: "to", label: "Becomes", render: (c) => <span className="font-semibold">{c.to ?? tr("perfume.leadsx.blank", "(blank)")}</span> },
          ]}
        />
        </div>
      ) : null}

      {s.removals.length ? (
        <div id="perfume-leadsx-removals">
        <ParityTable selectable
          cardTitle title={`${tr("perfume.leadsx.removals", "Marked Remove — archived on Apply")} (${n(ex.remove_companies + ex.remove_people)})`}
          rows={s.removals.map((c, i) => ({ ...c, i }))}
          rowKey={(c) => String(c.i)}
          storageKey="perfume-upload-removals-v1"

          exportFilename="TIO upload removals"

          exportExcel
          emptyText="Nothing marked Remove."
          columns={[
            { key: "scope", label: "Remove", sortable: true, render: (c) => (c.scope === "company" ? "Whole company" : "Person only") },
            { key: "company", label: "Company", sortable: true, render: (c) => <span className="font-semibold">{c.company}</span> },
            { key: "person", label: "Person", render: (c) => c.person ?? DASH },
          ]}
        />
        </div>
      ) : null}

      {s.new.records ? (
        <div id="perfume-leadsx-new" className="space-y-2" data-testid="perfume-leadsx-new">
          <div className="text-card-title">{tr("perfume.leadsx.new_title", "New leads — choose what goes in")}</div>
          <div className="flex flex-wrap gap-2">
            {(Object.entries(s.new.by_kind) as Array<[PerfumeUploadKind, number]>).map(([k, v]) => {
              const on = !skipKinds.includes(k);
              return (
                <label key={k} className="flex items-center gap-1 rounded-sm border border-[#C6D1DC] px-2 py-1 text-xs">
                  <input type="checkbox" checked={on} disabled={!editable} data-testid={`perfume-leadsx-kind-${k}`}
                    onChange={() => setSkipKinds((x) => (on ? [...x, k] : x.filter((y) => y !== k)))} />
                  {KIND_TEXT[k]} · {n(v)}
                </label>
              );
            })}
          </div>
          <ParityTable selectable
            cardTitle title={tr("perfume.leadsx.by_category", "By category in the file")}
            rows={cats.map(([k, v]) => ({ k, ...v }))}
            rowKey={(c) => c.k}
            storageKey="perfume-upload-categories-v1"

            exportFilename="TIO upload categories"

            exportExcel
            suppressToolbarSearch
            emptyText="No category."
            columns={[
              { key: "include", label: "Include", render: (c) => (
                <input type="checkbox" aria-label={`Include ${c.k}`} checked={!skip.includes(c.k)} disabled={!editable} data-testid={`perfume-leadsx-cat-${c.k}`}
                  onChange={() => setSkipCats(skip.includes(c.k) ? skip.filter((x) => x !== c.k) : [...skip, c.k])} />) },
              { key: "k", label: "Category", sortable: true, render: (c) => <span className="font-semibold">{c.k}</span> },
              { key: "records", label: "Leads", sortable: true, kind: "number", cellClass: "text-right tabular-nums", render: (c) => n(c.records) },
              { key: "match", label: "Already on file", sortable: true, kind: "number", cellClass: "text-right tabular-nums", render: (c) => n(c.match) },
              { key: "new", label: "New", kind: "number", cellClass: "text-right tabular-nums", render: (c) => n(c.records - c.match) },
            ]}
          />
          <ParityTable<PerfumeUploadSummary["new"]["samples"][number] & { i: number }> selectable
            cardTitle title={`${tr("perfume.leadsx.samples", "First new leads")} (${n(s.new.samples.length)} ${tr("perfume.leadsx.of", "of")} ${n(s.new.records)})`}
            rows={s.new.samples.map((x, i) => ({ ...x, i }))}
            rowKey={(x) => String(x.i)}
            storageKey="perfume-upload-samples-v1"

            exportFilename="TIO upload samples"

            exportExcel
            emptyText="No new lead."
            columns={[
              { key: "name", label: "Company", sortable: true, render: (x) => <span className="font-semibold">{x.name}</span> },
              { key: "kind", label: "From", sortable: true, render: (x) => KIND_TEXT[x.kind] },
              { key: "leaked_from", label: "Leaked by", sortable: true, render: (x) => x.leaked_from ?? DASH },
              { key: "category", label: "Category", sortable: true, render: (x) => x.category ?? DASH },
              { key: "email", label: "Email", render: (x) => x.email ?? DASH },
              { key: "phone", label: "Phone", render: (x) => x.phone ?? DASH },
              { key: "country", label: "Country", sortable: true, render: (x) => x.country ?? DASH },
              { key: "match", label: "Joins", sortable: true, render: (x) => x.match ?? tr("perfume.leadsx.new_co", "New company") },
            ]}
          />
        </div>
      ) : null}

      {s.removed_check && (s.removed_check.companies || s.removed_check.people) ? (
        <div className="space-y-2" data-testid="perfume-leadsx-removed-check">
          <ParityTable selectable
            cardTitle title={`${tr("perfume.leadsx.rc_title", "Contacts on file that the file's Removed-Check list names")} (${n(s.removed_check.companies)} ${tr("perfume.leadsx.rc_co", "companies")} · ${n(s.removed_check.people)} ${tr("perfume.leadsx.rc_pe", "people")})`}
            rows={s.removed_check.list.map((c, i) => ({ ...c, i }))}
            rowKey={(c) => String(c.i)}
            storageKey="perfume-upload-removed-check-v1"

            exportFilename="TIO upload removed check"

            exportExcel
            emptyText="None."
            columns={[
              { key: "scope", label: "Archive", sortable: true, render: (c) => (c.scope === "company" ? "Whole company" : "Person only") },
              { key: "company", label: "Company", sortable: true, render: (c) => <span className="font-semibold">{c.company}</span> },
              { key: "person", label: "Person", render: (c) => c.person ?? DASH },
            ]}
          />
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" checked={applyRemoved} disabled={!editable} onChange={(e) => setApplyRemoved(e.target.checked)} data-testid="perfume-leadsx-apply-removed" />
            {tr("perfume.leadsx.rc_apply", "Archive these too on Apply (off until you check the list)")}
          </label>
        </div>
      ) : null}

      {Object.keys(s.unknown).length ? (
        <div id="perfume-leadsx-unknown" className="space-y-1 text-xs" data-testid="perfume-leadsx-unknown">
          <div className="text-card-title">{tr("perfume.leadsx.unknown_title", "Types not in the Catalogs yet")}</div>
          {Object.entries(s.unknown).map(([k, vals]) => <div key={k}><span className="font-semibold">{FIELD_TEXT[k] ?? k}:</span> {(vals ?? []).join(" · ")}</div>)}
          <label className="flex items-center gap-1"><input type="checkbox" checked={addUnknown} disabled={!editable} onChange={(e) => setAddUnknown(e.target.checked)} />
            {tr("perfume.leadsx.add_unknown", "Add the ones still used to the Catalogs on Apply")}</label>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-[#E8EDF2] pt-2">
        {editable ? (
          <>
            <Button type="button" className="h-[34px] px-3 text-xs" onClick={() => void apply()} data-testid="perfume-leadsx-apply">
              {tr("perfume.leadsx.apply", "Apply")} · {n(ex.companies_changed + ex.people_changed)} {tr("perfume.leadsx.a_changes", "changes")} · {n(ex.remove_companies + ex.remove_people)} {tr("perfume.leadsx.a_removals", "removals")}{skipKinds.length ? "" : ` · ${n(kept)} ${tr("perfume.leadsx.a_new", "new leads")}`}
            </Button>
            <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={() => void discard()} data-testid="perfume-leadsx-discard">{tr("perfume.leadsx.discard", "Discard")}</Button>
          </>
        ) : null}
        <span className="text-xs text-[#1F2A44]" role="status" data-testid="perfume-leadsx-status">
          {status === "applying" ? tr("perfume.leadsx.applying", "Applying… (this can take a minute for thousands of leads)") : null}
          {status === "failed" ? `${tr("perfume.leadsx.failed", "Not applied — nothing was saved:")} ${up.data?.error ?? ""}` : null}
          {status === "discarded" ? tr("perfume.leadsx.discarded", "Discarded — nothing was saved.") : null}
          {status === "applied" && r ? `${tr("perfume.leadsx.applied", "Applied")} ${when(up.data?.applied_at)}: ${n(r.companies_changed)} companies and ${n(r.people_changed)} people changed · ${n(r.companies_removed)} companies and ${n(r.people_removed)} people archived · ${n(r.inserted)} new companies, ${n(r.matched)} joined, ${n(r.people_inserted)} people added · ${n(r.skipped)} leads left out · ${n(r.catalog_added)} types added${r.errors.length ? ` · ${r.errors.length} not saved: ${r.errors.slice(0, 3).join("; ")}` : ""}` : null}
        </span>
      </div>
    </section>
  );
}
