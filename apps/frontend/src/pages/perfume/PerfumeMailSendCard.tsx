/**
 * PERFUME-DESK — Send a list from jpm@tioperfumes.com (owner 2026-11-25 22:50 CT: "WE NEED TO ACTIVATE THE OUTGOING EMAILS
 * WITH JPM@TIOPERFUMES.COM SO I CAN SEND THE LISTS FROM THE APP").
 *
 * Nothing is sent on a schedule — only when the owner presses Send and then confirms the count. Each address gets its own
 * email (nobody sees the others). Opted-out addresses are always skipped. The last sends show below with their counts.
 */
import { useMemo, useState } from "react";
import { Button } from "../../components/Button";
import { ParityTable } from "../../components/parity/ParityTable";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { formatDateTimeUS } from "../../lib/formatDate";
import {
  addPerfumeMailOptouts, removePerfumeMailOptout, sendPerfumeMail, stopPerfumeMailSend,
  type PerfumeMailAccount, type PerfumeMailSendBatch, type PerfumeMailSendState,
} from "../../api/perfume";
import { tr } from "./perfumeI18n";

const EMAIL_RE = /[^@\s<>",;]+@[^@\s<>",;]+\.[^@\s<>",;]{2,}/g;
/** Same counting as the server: unique lower-case addresses found in what was pasted. */
export function countRecipients(text: string): number {
  return new Set((text.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase().replace(/^mailto:/, ""))).size;
}
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
const STATUS_TEXT: Record<PerfumeMailSendBatch["status"], string> = { sending: "Sending…", done: "Done", stopped: "Stopped", failed: "Failed" };

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ""));
    r.onerror = () => reject(r.error ?? new Error("read failed"));
    r.readAsDataURL(file);
  });
}

export function PerfumeMailSendCard({ send, account, configured, onChanged }: {
  send: PerfumeMailSendState | undefined; account: PerfumeMailAccount | undefined; configured: boolean; onChanged: () => void;
}) {
  const { pushToast } = useToast();
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [optText, setOptText] = useState("");
  const count = useMemo(() => countRecipients(to), [to]);
  const bytes = files.reduce((s, f) => s + f.size, 0);
  const sender = send?.sender ?? "jpm@tioperfumes.com";
  const ready = account?.status === "connected" && account.can_send === true;
  const tooBig = send ? bytes > send.max_attachment_bytes : false;
  const tooMany = send ? count > send.max_recipients : false;
  const overCap = send ? send.sent_last_24h + count > send.daily_cap : false;
  const canSend = ready && count > 0 && subject.trim().length > 0 && !tooBig && !tooMany && !overCap && !busy;

  async function doSend() {
    setBusy(true);
    try {
      const attachments = await Promise.all(files.map(async (f) => ({ name: f.name, mime_type: f.type || undefined, content_base64: await toBase64(f) })));
      const r = await sendPerfumeMail({ to, subject, body, attachments });
      pushToast(`Sending to ${r.recipients.toLocaleString("en-US")} — one email each from ${sender}. Progress shows below.`, "success");
      setTo(""); setSubject(""); setBody(""); setFiles([]); setConfirming(false);
      onChanged();
    } catch (e) {
      pushToast(userFacingApiError(e, "Not sent"), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" aria-label={tr("perfume.mail.send", "Send a list")} data-testid="perfume-mail-send">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-card-title">{tr("perfume.mail.send", "Send a list")} — {sender}</div>
        <div className="text-xs text-gray-600" data-testid="perfume-mail-send-cap">
          {send ? `${send.sent_last_24h.toLocaleString("en-US")} of ${send.daily_cap.toLocaleString("en-US")} sent in the last 24 hours` : ""}
        </div>
      </div>
      {send && !ready ? (
        <div className="text-xs text-red-700" data-testid="perfume-mail-send-not-ready">
          {account?.status === "connected"
            ? tr("perfume.mail.sendNeedsGrant", `${sender} is connected for reading only. Press "Connect again" on it above and allow "Send email on your behalf".`)
            : tr("perfume.mail.sendNeedsConnect", `Connect ${sender} above first — Google asks once for read and send access.`)}
          {!configured ? " (Google sign-in is not configured on the server.)" : ""}
        </div>
      ) : null}
      <div className="grid gap-2 md:grid-cols-2">
        <label className="space-y-1 text-xs">
          <span className="font-semibold">{tr("perfume.mail.to", "To — paste the addresses (one per line, or separated by commas)")}</span>
          <textarea className="h-[120px] w-full rounded-sm border border-gray-300 p-2 text-xs" value={to} onChange={(e) => { setTo(e.target.value); setConfirming(false); }}
            data-testid="perfume-mail-send-to" />
          <span className={tooMany || overCap ? "font-semibold text-red-700" : "text-gray-600"} data-testid="perfume-mail-send-count">
            {count.toLocaleString("en-US")} {count === 1 ? "address" : "addresses"}
            {tooMany && send ? ` — up to ${send.max_recipients} per send` : ""}
            {overCap && send ? ` — passes the ${send.daily_cap.toLocaleString("en-US")} a day limit` : ""}
          </span>
        </label>
        <div className="space-y-2">
          <label className="block space-y-1 text-xs">
            <span className="font-semibold">{tr("perfume.mail.subject", "Subject")}</span>
            <input className="h-[40px] w-full rounded-sm border border-gray-300 px-2 text-xs" value={subject} maxLength={300}
              onChange={(e) => { setSubject(e.target.value); setConfirming(false); }} data-testid="perfume-mail-send-subject" />
          </label>
          <label className="block space-y-1 text-xs">
            <span className="font-semibold">{tr("perfume.mail.attach", "Attach the list (Excel / PDF)")}</span>
            <input type="file" multiple accept=".xlsx,.xls,.csv,.pdf" className="block text-xs" data-testid="perfume-mail-send-files"
              onChange={(e) => { setFiles(Array.from(e.target.files ?? []).slice(0, 10)); setConfirming(false); }} />
            <span className={tooBig ? "font-semibold text-red-700" : "text-gray-600"}>
              {files.length ? `${files.map((f) => f.name).join(", ")} · ${mb(bytes)}` : "No file attached"}{tooBig ? " — over 20 MB" : ""}
            </span>
          </label>
        </div>
      </div>
      <label className="block space-y-1 text-xs">
        <span className="font-semibold">{tr("perfume.mail.message", "Message")}</span>
        <textarea className="h-[100px] w-full rounded-sm border border-gray-300 p-2 text-xs" value={body} maxLength={20000}
          onChange={(e) => { setBody(e.target.value); setConfirming(false); }} data-testid="perfume-mail-send-body" />
        <span className="whitespace-pre-wrap text-gray-500">{tr("perfume.mail.footer", "Added at the end of every email:")}{send?.footer ?? ""}</span>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        {!confirming ? (
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={!canSend} data-testid="perfume-mail-send-start" onClick={() => setConfirming(true)}>
            {tr("perfume.mail.sendBtn", "Send")}
          </Button>
        ) : (
          <>
            <span className="text-xs font-semibold" data-testid="perfume-mail-send-confirm-text">
              {`${tr("perfume.mail.confirmSend", "Send")} “${subject.trim()}” ${tr("perfume.mail.confirmTo", "to")} ${count.toLocaleString("en-US")} ${count === 1 ? "address" : "addresses"} ${tr("perfume.mail.confirmFrom", "from")} ${sender}?`}
            </span>
            <Button type="button" className="h-[34px] px-3 text-xs" disabled={!canSend} data-testid="perfume-mail-send-confirm" onClick={() => void doSend()}>
              {busy ? "Starting…" : `Yes, send to ${count.toLocaleString("en-US")}`}
            </Button>
            <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={() => setConfirming(false)}>{tr("perfume.mail.cancel", "Cancel")}</Button>
          </>
        )}
      </div>

      <ParityTable<PerfumeMailSendBatch> selectable
        rows={send?.batches ?? []}
        rowKey={(b) => b.id}
        storageKey="perfume-desk-mail-sends-v1"
        emptyText="Nothing sent from the app yet."
        columns={[
          { key: "started_at", label: "Sent", sortable: true, render: (b) => formatDateTimeUS(b.started_at) },
          { key: "subject", label: "Subject", sortable: true },
          { key: "attachment_names", label: "Files", sortable: false, render: (b) => b.attachment_names.join(", ") || "—" },
          { key: "recipients", label: "Addresses", sortable: true, kind: "number", cellClass: "text-right tabular-nums" },
          { key: "sent", label: "Sent", sortable: true, kind: "number", cellClass: "text-right tabular-nums" },
          { key: "skipped", label: "Skipped (opted out)", sortable: true, kind: "number", cellClass: "text-right tabular-nums" },
          { key: "failed", label: "Failed", sortable: true, kind: "number", cellClass: "text-right tabular-nums" },
          { key: "status", label: "Status", sortable: true, render: (b) => <span className={b.status === "failed" ? "font-semibold text-red-700" : ""}>{STATUS_TEXT[b.status]}{b.error ? ` — ${b.error}` : ""}</span> },
        ]}
        rowActions={(b) => (b.status === "sending" ? (
          <Button type="button" variant="secondary" className="h-[30px] px-2 text-xs" onClick={async () => {
            try { await stopPerfumeMailSend(b.id); onChanged(); } catch (e) { pushToast(userFacingApiError(e, "Not stopped"), "error"); }
          }}>{tr("perfume.mail.stop", "Stop")}</Button>
        ) : null)}
        rowActionsWidth={90}
      />

      <div className="space-y-1 text-xs" data-testid="perfume-mail-optouts">
        <div className="font-semibold">{tr("perfume.mail.optouts", "Do not send to")} ({(send?.optouts ?? []).length})</div>
        <div className="flex flex-wrap items-center gap-2">
          <input className="h-[34px] min-w-[260px] flex-1 rounded-sm border border-gray-300 px-2 text-xs" placeholder={tr("perfume.mail.optoutPlaceholder", "address@company.com (people who replied STOP)")}
            value={optText} onChange={(e) => setOptText(e.target.value)} data-testid="perfume-mail-optout-input" />
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={!countRecipients(optText)} onClick={async () => {
            try { const r = await addPerfumeMailOptouts(optText, "Replied STOP"); setOptText(""); onChanged(); pushToast(`${r.added} added — never sent to again`, "success"); }
            catch (e) { pushToast(userFacingApiError(e, "Not added"), "error"); }
          }}>{tr("perfume.mail.optoutAdd", "Add")}</Button>
        </div>
        <div className="flex flex-wrap gap-1">
          {(send?.optouts ?? []).map((o) => (
            <span key={o.email} className="inline-flex items-center gap-1 rounded-sm border border-gray-300 bg-[var(--surface-unselected)] px-2 py-0.5">
              {o.email}
              <button type="button" className="text-gray-500 hover:text-red-700" aria-label={`Remove ${o.email}`} onClick={async () => {
                try { await removePerfumeMailOptout(o.email); onChanged(); } catch (e) { pushToast(userFacingApiError(e, "Not removed"), "error"); }
              }}>×</button>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
