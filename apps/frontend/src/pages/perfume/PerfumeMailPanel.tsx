/**
 * PERFUME-DESK — Mail price lists (owner 2026-11-25 17:29 CT): "CAN WE CREATE AN ENGINE THAT AUTOMATICALLY GOES TO MY MAIL
 * APP, GETS ALL THE PRICE LISTS DAILY AND UPDATES THE APP WITH THE NEW PRICES? … FROM TIOPERFUMES07@GMAIL.COM AND FROM
 * JPM@TIOPERFUMES.COM."
 *
 * The two mailboxes (connect = the owner's own Google sign-in, read-only), the last runs, every price-list file the engine
 * saw — imported, held with its reason, or from a sender not set up yet (pick the vendor once; next time it is automatic) —
 * and the sender rules. jpm@tioperfumes.com also connects for sending (owner 2026-11-25 22:50 CT) — the Send a list box.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Button } from "../../components/Button";
import { Combobox } from "../../components/Combobox";
import { ParityTable } from "../../components/parity/ParityTable";
import { useToast } from "../../components/Toast";
import { ListErrorState } from "../../components/ListErrorState";
import { userFacingApiError } from "../../lib/api-error-message";
import { formatDateTimeUS } from "../../lib/formatDate";
import {
  disconnectPerfumeMail, downloadPerfumeMailFile, getPerfumeMail, importPerfumeMailFile, listPerfumeVendors, perfumeMailConnectUrl, runPerfumeMail,
  savePerfumeMailRule, switchOffPerfumeMailRule,
  type PerfumeMailFile, type PerfumeMailFileStatus, type PerfumeMailRule, type PerfumeMailRun, type PerfumeVendor,
} from "../../api/perfume";
import { tr } from "./perfumeI18n";
import { PerfumeMailSendCard } from "./PerfumeMailSendCard";

const money = (c: unknown) => (c == null ? "—" : `$${(Number(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const STATUS_TEXT: Record<PerfumeMailFileStatus, string> = {
  imported: "Imported", held: "Held — needs you", unassigned: "Sender not set up", duplicate: "Same file already in use", failed: "Failed",
};
const STATUS_CLASS: Record<PerfumeMailFileStatus, string> = {
  imported: "text-emerald-800", held: "text-amber-800 font-semibold", unassigned: "text-amber-800 font-semibold", duplicate: "text-gray-600", failed: "text-red-700 font-semibold",
};
const CONNECT_ERRORS: Record<string, string> = {
  not_signed_in: "You were not signed in to the app — sign in and press Connect again.",
  not_allowed: "Only the desk owner can connect a mailbox.",
  read_access_not_granted: "Google did not give read access — press Connect again and leave \"Read your email\" ticked.",
  no_refresh_token: "Google did not return lasting access — press Connect again (the consent screen must be accepted).",
  no_email: "Google did not say which mailbox this is — press Connect again.",
  not_a_tio_mailbox: "That account is not one of the TIO mailboxes — pick tioperfumes07@gmail.com, jpm@tioperfumes.com or tio-perfumes@hotmail.com.",
  invalid_state: "The sign-in took too long or came from another tab — press Connect again.",
  microsoft_sign_in_failed: "Microsoft did not finish the sign-in — press Connect again.",
  access_denied: "Microsoft access was not allowed — press Connect again and accept \"Read your mail\".",
};

export function PerfumeMailPanel() {
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const [params, setParams] = useSearchParams();
  const [runBusy, setRunBusy] = useState(false);
  const mail = useQuery({ queryKey: ["perfume", "mail"], queryFn: getPerfumeMail, refetchInterval: (q) => (q.state.data?.running || runBusy || q.state.data?.send?.batches.some((b) => b.status === "sending") ? 4_000 : false) });
  const vendors = useQuery({ queryKey: ["perfume", "vendors"], queryFn: listPerfumeVendors });

  // Back from Google: say what happened once, then clear the URL.
  useEffect(() => {
    const ok = params.get("mail_connected");
    const err = params.get("mail_error");
    if (!ok && !err) return;
    if (ok) pushToast(`${ok} connected — its price lists are read five times a day.`, "success");
    if (err) pushToast(CONNECT_ERRORS[err] ?? `Mailbox not connected (${err})`, "error");
    const next = new URLSearchParams(params);
    for (const k of ["mail_connected", "mail_error", "mail_email"]) next.delete(k);
    setParams(next, { replace: true });
  }, [params, setParams, pushToast]);

  const running = Boolean(mail.data?.running);
  useEffect(() => { if (runBusy && mail.data && !mail.data.running) { setRunBusy(false); void qc.invalidateQueries({ queryKey: ["perfume"] }); } }, [runBusy, mail.data, qc]);

  if (mail.isError) {
    return <ListErrorState title={tr("perfume.mail.loadError", "Couldn't load the mail price lists")} status={0} message={(mail.error as Error)?.message} onRetry={() => void mail.refetch()} />;
  }
  const d = mail.data;
  const vendorOptions = (vendors.data?.vendors ?? []).filter((v) => v.kind !== "offer" && v.kind !== "inventory")
    .map((v) => ({ value: v.id, label: v.name }));

  return (
    <div className="space-y-4" data-testid="perfume-mail-panel">
      <section className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" aria-label={tr("perfume.mail.boxes", "Mailboxes")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-card-title">{tr("perfume.mail.boxes", "Mailboxes")}</div>
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <span data-testid="perfume-mail-schedule">{d?.schedule ?? ""}</span>
            <Button type="button" className="h-[34px] px-3 text-xs" disabled={running || runBusy || !d?.accounts.some((a) => a.status === "connected")} data-testid="perfume-mail-run"
              onClick={async () => {
                setRunBusy(true);
                try { await runPerfumeMail(); pushToast("Checking the mailboxes — the results show here when it finishes.", "success"); await mail.refetch(); }
                catch (e) { setRunBusy(false); pushToast(userFacingApiError(e, "Mail check not started"), "error"); }
              }}>{running || runBusy ? tr("perfume.mail.running", "Checking mail…") : tr("perfume.mail.run", "Check mail now")}</Button>
          </div>
        </div>
        {d && !d.configured ? <div className="text-xs text-red-700">{tr("perfume.mail.notConfigured", "Google sign-in is not configured on the server, so no mailbox can be connected.")}</div> : null}
        <div className="grid gap-2 md:grid-cols-3">
          {(d?.mailboxes ?? []).map((email) => {
            const a = d?.accounts.find((x) => x.email === email);
            const state = a?.status ?? "not connected";
            const microsoft = (d?.microsoft_mailboxes ?? []).includes(email);
            const canConnect = microsoft ? Boolean(d?.microsoft_configured) : Boolean(d?.configured);
            return (
              <div key={email} className="flex flex-wrap items-center justify-between gap-2 bg-[var(--surface-unselected)] p-2 text-xs" data-testid="perfume-mail-account">
                <div className="space-y-0.5">
                  <div className="font-semibold">{email}</div>
                  <div className={state === "connected" ? "text-emerald-800" : state === "reconnect" ? "font-semibold text-red-700" : "text-gray-600"}>
                    {state === "connected" ? (a?.can_send ? tr("perfume.mail.connectedSend", "Connected (read + send)") : tr("perfume.mail.connected", "Connected (read-only)")) : state === "reconnect" ? tr("perfume.mail.reconnect", "Google stopped the access — connect again") : tr("perfume.mail.notConnected", "Not connected")}
                    {a?.last_checked_at ? ` · ${tr("perfume.mail.lastChecked", "last checked")} ${formatDateTimeUS(a.last_checked_at)}` : ""}
                  </div>
                  {a?.last_error ? <div className="text-red-700">{a.last_error}</div> : null}
                  {microsoft && !d?.microsoft_configured ? <div className="text-gray-600">{tr("perfume.mail.msNotConfiguredLine", "Hotmail (Microsoft) sign-in is not set up on the server yet.")}</div> : null}
                </div>
                <div className="flex items-center gap-1">
                  <Button type="button" className="h-[34px] px-3 text-xs" disabled={!canConnect} data-testid="perfume-mail-connect"
                    title={!canConnect && microsoft ? tr("perfume.mail.msNotConfigured", "Microsoft sign-in is not set up on the server yet") : undefined}
                    onClick={() => { window.location.assign(perfumeMailConnectUrl(email, email === (d?.send?.sender ?? "jpm@tioperfumes.com"), microsoft)); }}>
                    {state === "connected" ? tr("perfume.mail.connectAgain", "Connect again") : tr("perfume.mail.connect", "Connect")}
                  </Button>
                  {state === "connected" || state === "reconnect" ? (
                    <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={async () => {
                      try { await disconnectPerfumeMail(email); await mail.refetch(); pushToast(`${email} disconnected`, "success"); }
                      catch (e) { pushToast(userFacingApiError(e, "Not disconnected"), "error"); }
                    }}>{tr("perfume.mail.disconnect", "Disconnect")}</Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        <RunsLine runs={d?.runs ?? []} />
      </section>

      <PerfumeMailSendCard send={d?.send} account={d?.accounts.find((a) => a.email === (d?.send?.sender ?? "jpm@tioperfumes.com"))}
        configured={Boolean(d?.configured)} onChanged={() => void mail.refetch()} />

      <FilesCard files={d?.files ?? []} loading={mail.isLoading} vendorOptions={vendorOptions} onChanged={() => void qc.invalidateQueries({ queryKey: ["perfume"] })} />
      <RulesCard rules={d?.rules ?? []} vendors={vendors.data?.vendors ?? []} onChanged={() => void mail.refetch()} />
    </div>
  );
}

function RunsLine({ runs }: { runs: PerfumeMailRun[] }) {
  const last = runs[0];
  if (!last) return <div className="text-xs text-gray-600">{tr("perfume.mail.noRuns", "No mail check yet.")}</div>;
  return (
    <div className="text-xs text-gray-700" data-testid="perfume-mail-last-run">
      <b>{tr("perfume.mail.lastRun", "Last check")}:</b> {formatDateTimeUS(last.started_at)} ({last.trigger === "schedule" ? "scheduled check" : "Check mail now"})
      {last.finished_at ? ` · ${last.messages_seen} emails · ${last.imported} imported · ${last.held} held · ${last.unassigned} from senders not set up · ${last.failed} failed` : " · running…"}
      {last.error ? <div className="whitespace-pre-wrap text-red-700">{last.error}</div> : null}
    </div>
  );
}

function FilesCard({ files, loading, vendorOptions, onChanged }: { files: PerfumeMailFile[]; loading: boolean; vendorOptions: Array<{ value: string; label: string }>; onChanged: () => void }) {
  const [show, setShow] = useState<"needs" | "all">("needs");
  const needs = useMemo(() => files.filter((f) => f.status === "held" || f.status === "unassigned" || f.status === "failed"), [files]);
  const rows = show === "needs" ? needs : files;
  return (
    <section className="space-y-1" aria-label={tr("perfume.mail.files", "Price lists from mail")}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-card-title">{tr("perfume.mail.files", "Price lists from mail")}</div>
        {(["needs", "all"] as const).map((k) => (
          <button key={k} type="button" aria-pressed={show === k} onClick={() => setShow(k)} data-testid={`perfume-mail-show-${k}`}
            className={`h-[30px] rounded-sm border px-2 text-xs ${show === k ? "border-[#1F2A44] bg-[#1F2A44] text-white" : "border-gray-300 bg-[var(--surface-unselected)] text-gray-700"}`}>
            {k === "needs" ? `${tr("perfume.mail.needsYou", "Needs you")} (${needs.length})` : `${tr("perfume.mail.all", "All")} (${files.length})`}
          </button>
        ))}
      </div>
      <ParityTable<PerfumeMailFile>
        rows={rows}
        rowKey={(f) => f.id}
        loading={loading}
        storageKey="perfume-desk-mail-files-v1"
        emptyText={show === "needs" ? "Nothing waiting for you." : "No price list has come by mail yet."}
        columns={[
          { key: "received_at", label: "Received", sortable: true, render: (f) => formatDateTimeUS(f.received_at) },
          { key: "account_email", label: "Mailbox", sortable: true },
          { key: "sender", label: "From", sortable: true },
          { key: "subject", label: "Subject", sortable: true, render: (f) => f.subject ?? "" },
          { key: "file_name", label: "File", sortable: true },
          { key: "vendor_name", label: "Vendor", sortable: true, render: (f) => f.vendor_name ?? "" },
          { key: "status", label: "Status", sortable: true, render: (f) => <span className={STATUS_CLASS[f.status]}>{STATUS_TEXT[f.status]}{f.status === "imported" && f.list_voided_at ? " (since replaced)" : ""}</span> },
          { key: "reason", label: "Why", sortable: true, render: (f) => f.reason ?? "" },
          { key: "rows_saved", label: "Lines", sortable: true, kind: "number", cellClass: "text-right tabular-nums", render: (f) => (f.rows_saved ?? f.rows_read ?? "—") },
          { key: "file_total_cents", label: "Price total", sortable: true, kind: "number", cellClass: "text-right tabular-nums", sortValue: (f) => Number(f.file_total_cents ?? 0), render: (f) => money(f.file_total_cents) },
        ]}
        rowActions={(f) => <FileActions file={f} vendorOptions={vendorOptions} onChanged={onChanged} />}
        rowActionsWidth={430}
      />
    </section>
  );
}

function FileActions({ file, vendorOptions, onChanged }: { file: PerfumeMailFile; vendorOptions: Array<{ value: string; label: string }>; onChanged: () => void }) {
  const { pushToast } = useToast();
  const [vendorId, setVendorId] = useState<string | null>(file.vendor_id);
  const [special, setSpecial] = useState(false);
  const [busy, setBusy] = useState(false);
  const go = async (body: Parameters<typeof importPerfumeMailFile>[1], done: string) => {
    setBusy(true);
    try {
      const r = await importPerfumeMailFile(file.id, body);
      pushToast(r.status === "imported" ? `${done} · ${(r.rowsSaved ?? 0).toLocaleString()} lines saved, totals match to the cent` : `${STATUS_TEXT[r.status]}: ${r.reason ?? ""}`, r.status === "imported" ? "success" : "error");
      onChanged();
    } catch (e) { pushToast(userFacingApiError(e, "Not imported"), "error"); }
    finally { setBusy(false); }
  };
  const download = (
    <Button type="button" variant="secondary" className="h-[34px] px-2 text-xs" disabled={busy} onClick={async () => {
      try { await downloadPerfumeMailFile(file.id, file.file_name); } catch (e) { pushToast(userFacingApiError(e, "Download failed"), "error"); }
    }}>{tr("perfume.mail.download", "File")}</Button>
  );
  if (file.status === "unassigned") {
    return (
      <span className="flex items-center gap-1">
        <Combobox ariaLabel="Vendor of this sender" size="sm" value={vendorId} onChange={setVendorId} placeholder={tr("perfume.mail.pickVendor", "This sender is…")} options={vendorOptions} />
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={special} onChange={(e) => setSpecial(e.target.checked)} />{tr("perfume.mail.special", "Special list")}</label>
        <Button type="button" className="h-[34px] px-2 text-xs" disabled={busy || !vendorId} data-testid="perfume-mail-assign"
          onClick={() => void go({ vendor_id: vendorId!, special }, "Saved — this sender is read automatically from now on")}>{tr("perfume.mail.use", "Use")}</Button>
        <Button type="button" variant="secondary" className="h-[34px] px-2 text-xs" disabled={busy} onClick={async () => {
          try { await savePerfumeMailRule({ from_address: file.sender, ignore: true }); pushToast(`${file.sender}: ignored from now on`, "success"); onChanged(); }
          catch (e) { pushToast(userFacingApiError(e, "Not saved"), "error"); }
        }}>{tr("perfume.mail.ignore", "Not a price list")}</Button>
        {download}
      </span>
    );
  }
  if (file.status === "held" || file.status === "failed") {
    return (
      <span className="flex items-center gap-1">
        <Button type="button" className="h-[34px] px-2 text-xs" disabled={busy || !file.vendor_id} data-testid="perfume-mail-force"
          onClick={() => void go({ force: true }, "Imported anyway")}>{tr("perfume.mail.force", "Import anyway")}</Button>
        {download}
      </span>
    );
  }
  return download;
}

function RulesCard({ rules, vendors, onChanged }: { rules: PerfumeMailRule[]; vendors: PerfumeVendor[]; onChanged: () => void }) {
  const { pushToast } = useToast();
  const [from, setFrom] = useState("");
  const [fileText, setFileText] = useState("");
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [special, setSpecial] = useState(false);
  const options = vendors.filter((v) => v.kind !== "offer" && v.kind !== "inventory").map((v) => ({ value: v.id, label: v.name }));
  return (
    <section className="space-y-2" aria-label={tr("perfume.mail.rules", "Senders")}>
      <div className="text-card-title">{tr("perfume.mail.rules", "Senders")}</div>
      <div className="flex flex-wrap items-end gap-2 text-xs">
        <label className="flex flex-col gap-1 text-gray-600">{tr("perfume.mail.from", "From (address or @domain.com)")}
          <input className="h-[40px] w-[240px] rounded-sm border border-gray-300 px-2" value={from} onChange={(e) => setFrom(e.target.value)} placeholder={tr("perfume.mail.fromPh", "sales@vendor.com")} />
        </label>
        <label className="flex flex-col gap-1 text-gray-600">{tr("perfume.mail.fileText", "File name contains (optional)")}
          <input className="h-[40px] w-[170px] rounded-sm border border-gray-300 px-2" value={fileText} onChange={(e) => setFileText(e.target.value)} placeholder={tr("perfume.mail.fileTextPh", "ARABIC")} />
        </label>
        <label className="flex flex-col gap-1 text-gray-600">{tr("perfume.lists.23", "Vendor")}
          <Combobox ariaLabel="Vendor" size="sm" value={vendorId} onChange={setVendorId} placeholder={tr("perfume.lists.24", "Pick vendor")} options={options} />
        </label>
        <label className="flex h-[40px] items-center gap-1"><input type="checkbox" checked={special} onChange={(e) => setSpecial(e.target.checked)} />{tr("perfume.mail.specialLong", "Special list (kept next to the vendor's list)")}</label>
        <Button type="button" className="h-[40px] px-3 text-xs" disabled={!from.trim() || !vendorId} data-testid="perfume-mail-rule-add" onClick={async () => {
          try { await savePerfumeMailRule({ from_address: from.trim().toLowerCase(), file_text: fileText.trim() || null, vendor_id: vendorId, special }); setFrom(""); setFileText(""); setSpecial(false); onChanged(); pushToast("Sender saved", "success"); }
          catch (e) { pushToast(userFacingApiError(e, "Sender not saved"), "error"); }
        }}>{tr("perfume.mail.addRule", "Add sender")}</Button>
      </div>
      <ParityTable<PerfumeMailRule>
        rows={rules}
        rowKey={(r) => r.id}
        storageKey="perfume-desk-mail-rules-v1"
        emptyText="No sender set up yet — pick the vendor on a file above, or add a sender here."
        columns={[
          { key: "from_address", label: "From", sortable: true },
          { key: "file_text", label: "File name contains", sortable: true, render: (r) => r.file_text ?? "" },
          { key: "vendor_name", label: "Vendor", sortable: true, render: (r) => (r.ignore ? "— not a price list —" : r.vendor_name ?? "") },
          { key: "special", label: "List", sortable: true, render: (r) => (r.ignore ? "" : r.special ? "Special (kept next to)" : "Full list (replaces)") },
        ]}
        rowActions={(r) => (
          <Button type="button" variant="secondary" className="h-[34px] px-2 text-xs" onClick={async () => {
            try { await switchOffPerfumeMailRule(r.id); onChanged(); pushToast("Sender switched off", "success"); }
            catch (e) { pushToast(userFacingApiError(e, "Not changed"), "error"); }
          }}>{tr("perfume.mail.off", "Switch off")}</Button>
        )}
        rowActionsWidth={140}
      />
    </section>
  );
}
