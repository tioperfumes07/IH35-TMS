import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  legalMattersApi,
  type LegalMatterDeadline,
  type LegalMatterDocument,
  type LegalMatterEvent,
  uploadMatterDocument,
} from "../../../api/legal-matters";
import { useAuth } from "../../../auth/useAuth";
import { Button } from "../../../components/Button";
import { PageHeader } from "../../../components/layout/PageHeader";
import { ConfirmModal } from "../../../components/shared/ConfirmModal";
import { EntityLink } from "../../../components/shared/EntityLink";
import { EntityLinkOrTombstone } from "../../../components/shared/EntityLinkOrTombstone";
import { useToast } from "../../../components/Toast";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { LegalModuleTabs } from "../LegalModuleTabs";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { formatDateUS, formatDateTimeUS } from "../../../lib/formatDate";
import { companyWallClockToIso } from "../../../lib/businessDate";
import { DateTimePicker } from "../../../components/forms/DateTimePicker";
import { formatUsd, formatUsdCents } from "../../../lib/money";
import { resolveApiUrl } from "../../../api/client";
import {
  formStateToUpdatePayload,
  LegalMatterFormFields,
  matterRowToFormState,
  type LegalMatterFormState,
} from "./LegalMatterFormFields";
import { userFacingApiError } from "../../../lib/api-error-message";
import { properEnumOrFilterLabel } from "../../../lib/properDisplayText";
import { LegalMatterCostsReverseSection } from "../../../components/accounting/LegalMatterCostsReverseSection";
import { CreateBillModal } from "../../maintenance/components/CreateBillModal";
import { ListErrorState } from "../../../components/ListErrorState";

type Tab = "overview" | "timeline" | "documents" | "deadlines" | "notes";
const LEGAL_MATTER_TAB_IDS = new Set<string>(["overview", "timeline", "documents", "deadlines", "notes"]);

export function parseLegalMatterTab(raw: string | null): Tab {
  if (raw && LEGAL_MATTER_TAB_IDS.has(raw)) return raw as Tab;
  return "overview";
}

function fieldOrDash(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

/** Per-event-type readable summaries for the backend's known system events (see matters.service.ts appendMatterEvent callers). */
const LEGAL_MATTER_EVENT_SUMMARIZERS: Record<string, (body: Record<string, unknown>) => string | null> = {
  matter_created: (body) => {
    const num = body.matter_number;
    return typeof num === "string" && num.trim() ? `Matter ${num.trim()} created.` : "Matter created.";
  },
  matter_updated: (body) => {
    const fields = body.fields;
    if (Array.isArray(fields) && fields.length) {
      const names = fields.filter((f): f is string => typeof f === "string");
      if (names.length) return `Updated: ${names.join(", ")}.`;
    }
    return "Matter details updated.";
  },
  matter_closed: (body) => {
    const summary = body.outcome_summary;
    return typeof summary === "string" && summary.trim() ? `Matter closed. Outcome: ${summary.trim()}` : "Matter closed.";
  },
  document_uploaded: (body) => {
    const title = body.title;
    const privileged = body.is_privileged === true;
    const label = typeof title === "string" && title.trim() ? `"${title.trim()}"` : "a document";
    return `Uploaded ${label}${privileged ? " (privileged)" : ""}.`;
  },
  deadline_added: (body) => {
    const type = body.deadline_type;
    return typeof type === "string" && type.trim() ? `Deadline added: ${type.trim()}.` : "Deadline added.";
  },
  deadline_completed: () => "Deadline completed.",
};

/** Human timeline body for manual notes; other system events keep a readable summary (never raw JSON UI). */
export function formatLegalMatterEventBody(ev: { event_type?: unknown; event_body?: unknown }): string {
  const body = ev.event_body;
  const eventType = typeof ev.event_type === "string" ? ev.event_type.trim() : "";
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const record = body as Record<string, unknown>;
    const note = record.note;
    if (typeof note === "string" && note.trim()) return note.trim();
    const summarize = LEGAL_MATTER_EVENT_SUMMARIZERS[eventType];
    if (summarize) {
      const summary = summarize(record);
      if (summary) return summary;
    }
  }
  if (typeof body === "string" && body.trim()) return body.trim();
  if (body == null) return "—";
  // Last-resort fallback for an unrecognized event_type — never dump raw JSON in the UI.
  return `Recorded ${eventType || "system event"}.`;
}

export function LegalMatterDetailPage() {
  const { id = "" } = useParams();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { user } = useAuth();
  const { pushToast } = useToast();
  const qc = useQueryClient();
  const admin = user?.role === "Owner" || user?.role === "Administrator";
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseLegalMatterTab(searchParams.get("tab"));
  const setTab = (next: Tab) => {
    const params = new URLSearchParams(searchParams);
    if (next === "overview") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  };
  const [noteText, setNoteText] = useState("");
  const [dlType, setDlType] = useState("response");
  const [dlTitle, setDlTitle] = useState("");
  const [dlAt, setDlAt] = useState("");
  const [dlEmails, setDlEmails] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  // LEGAL-MATTER-CLOSE-NO-CONFIRM: closing a matter is a terminal, unreopenable transition (the
  // edit form's own read-only "closed" note says "reopen not supported via edit") — the same
  // consequence class as terminating a driver, which DOES gate behind a confirm modal
  // (TerminateConfirmModal). This flag gates the actual mutation behind one too.
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [docTitle, setDocTitle] = useState("");
  const [docPriv, setDocPriv] = useState(false);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<LegalMatterFormState | null>(null);
  const [createBillOpen, setCreateBillOpen] = useState(false);

  const detailQuery = useQuery({
    queryKey: ["legal", "matter", companyId, id],
    queryFn: () => legalMattersApi.get(companyId, id),
    enabled: Boolean(companyId && id),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["legal", "matter", companyId, id] });
    void qc.invalidateQueries({ queryKey: ["legal", "matters", companyId] });
  };

  // LEGAL-F6331: none of these 5 mutations had onError, unlike the sibling updateMut below
  // (which already establishes the correct pattern in this exact file — pushToast +
  // userFacingApiError, both already imported). A rejected note/deadline/close/upload silently
  // did nothing.
  const addEventMut = useMutation({
    mutationFn: () => {
      const note = noteText.trim();
      if (!note) throw new Error("Note is required.");
      return legalMattersApi.addEvent(companyId, id, {
        event_type: "note",
        event_body: { note },
      });
    },
    onSuccess: () => {
      invalidate();
      setNoteText("");
    },
    onError: (err) => pushToast(userFacingApiError(err, "Could not add the note"), "error"),
  });

  const addDlMut = useMutation({
    mutationFn: () =>
      legalMattersApi.addDeadline(companyId, id, {
        deadline_type: dlType,
        title: dlTitle,
        // LEGAL-MATTER-DEADLINE-CREATE-WRONG-TZ-INSTANT: `new Date(dlAt).toISOString()` interpreted
        // this zoneless DateTimePicker wall-clock string in the VIEWER's browser timezone, not
        // Central (CLAUDE.md §8) — a paralegal on a non-Central machine would have the stored
        // deadline land on the wrong hour, or the wrong calendar day entirely for a near-midnight
        // entry. companyWallClockToIso treats it as the intended Central-Time wall clock.
        deadline_at: companyWallClockToIso(dlAt),
        reminder_recipients: dlEmails.split(",").map((s) => s.trim()).filter(Boolean),
      }),
    onSuccess: () => {
      invalidate();
      setDlTitle("");
      setDlAt("");
    },
    onError: (err) => pushToast(userFacingApiError(err, "Could not add the deadline"), "error"),
  });

  const closeMut = useMutation({
    mutationFn: () => legalMattersApi.close(companyId, id, { outcome_summary: closeNotes.trim() }),
    onSuccess: invalidate,
    onError: (err) => pushToast(userFacingApiError(err, "Could not close the matter"), "error"),
  });

  const completeDlMut = useMutation({
    mutationFn: (deadlineId: string) => legalMattersApi.completeDeadline(companyId, id, deadlineId),
    onSuccess: invalidate,
    onError: (err) => pushToast(userFacingApiError(err, "Could not complete the deadline"), "error"),
  });

  const uploadMut = useMutation({
    mutationFn: async () => {
      if (!docFile) throw new Error("file");
      return uploadMatterDocument(companyId, id, docFile, docTitle || docFile.name, Boolean(admin && docPriv));
    },
    onSuccess: () => {
      invalidate();
      setDocFile(null);
      setDocTitle("");
      setDocPriv(false);
    },
    onError: (err) => pushToast(userFacingApiError(err, "Could not upload the document"), "error"),
  });

  const updateMut = useMutation({
    mutationFn: () => {
      if (!editForm) throw new Error("edit_form_missing");
      return legalMattersApi.update(companyId, id, formStateToUpdatePayload(editForm));
    },
    onSuccess: () => {
      invalidate();
      setIsEditing(false);
      setEditForm(null);
      pushToast("Matter updated", "success");
    },
    onError: (error) => {
      const message = userFacingApiError(error, "Could not update matter");
      pushToast(message, "error");
    },
  });

  const matter = detailQuery.data?.matter;

  useEffect(() => {
    if (!isEditing && matter) {
      setEditForm(null);
    }
  }, [isEditing, matter]);

  async function downloadDoc(documentId: string) {
    const path = legalMattersApi.documentDownloadUrl(companyId, id, documentId);
    const url = path;
    const res = await fetch(resolveApiUrl(url), { credentials: "include" });
    const json = (await res.json()) as { download_url?: string; error?: string };
    if (!res.ok || !json.download_url) return;
    window.open(json.download_url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-3">
      <PageHeader
        breadcrumb={["Legal", "Matters"]}
        title={matter ? String(matter.matter_number ?? "Matter") : "Matter"}
        subtitle={matter ? properEnumOrFilterLabel(matter.type) : ""}
        actions={
          <div className="flex flex-wrap gap-2">
            {companyId && id ? (
              <Button
                type="button"
                onClick={() => setCreateBillOpen(true)}
                data-testid="legal-matter-create-bill"
              >
                + Create Bill
              </Button>
            ) : null}
            {admin && matter && !isEditing ? (
              <Button
                variant="secondary"
                type="button"
                onClick={() => {
                  setEditForm(matterRowToFormState(matter));
                  setIsEditing(true);
                  setTab("overview");
                }}
              >
                Edit matter
              </Button>
            ) : null}
            <Link to="/legal/matters">
              <Button variant="secondary">Back to list</Button>
            </Link>
          </div>
        }
      />
      <LegalModuleTabs />
      {!companyId || !id ? (
        <p className="text-sm text-gray-600">Missing company or matter.</p>
      ) : detailQuery.isLoading ? (
        <p className="text-sm text-gray-600">Loading…</p>
      ) : detailQuery.isError ? (
        <ListErrorState
          title="Couldn't load legal matter"
          status={0}
          message={userFacingApiError(detailQuery.error, "Could not load this legal matter.")}
          onRetry={() => void detailQuery.refetch()}
        />
      ) : !detailQuery.data ? (
        <p className="text-sm text-red-600">Matter not found or access denied.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {(["overview", "timeline", "documents", "deadlines", "notes"] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                className={`rounded-sm px-3 py-1 text-sm ${tab === t ? "bg-gray-900 text-white" : "border border-gray-200 bg-white"}`}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === "overview" && isEditing && editForm && admin ? (
            <div className="mx-auto max-w-3xl space-y-3 rounded-sm border border-gray-200 bg-white p-4">
              <LegalMatterFormFields
                form={editForm}
                setForm={(update) =>
                  setEditForm((prev) =>
                    prev ? (typeof update === "function" ? update(prev) : update) : prev,
                  )
                }
                mode="edit"
                operatingCompanyId={companyId}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={updateMut.isPending}
                  onClick={() => void updateMut.mutate()}
                >
                  Save changes
                </Button>
                <Button
                  variant="secondary"
                  type="button"
                  disabled={updateMut.isPending}
                  onClick={() => {
                    setIsEditing(false);
                    setEditForm(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
              {updateMut.isError ? (
                <p className="text-sm text-red-600">
                  Could not update matter. Check your entries and try again.
                </p>
              ) : null}
            </div>
          ) : null}

          {tab === "overview" && !isEditing ? (
            <div className="rounded-sm border border-gray-200 bg-white p-4 text-sm text-gray-800">
              <p>
                <strong>Status:</strong> {String(matter?.status ?? "")} · <strong>Severity:</strong>{" "}
                {String(matter?.severity ?? "")} · <strong>Our role:</strong> {fieldOrDash(matter?.our_role)}
              </p>
              <p className="mt-2">{String(matter?.description ?? "")}</p>

              <div className="mt-3 grid gap-x-4 gap-y-1 border-t border-gray-100 pt-3 md:grid-cols-2">
                <div><strong>Opposing party:</strong> {fieldOrDash(matter?.opposing_party)}</div>
                <div><strong>Case number:</strong> {fieldOrDash(matter?.case_number)}</div>
                <div><strong>Court:</strong> {fieldOrDash(matter?.court)}</div>
                <div>
                  <strong>Related driver:</strong>{" "}
                  {matter?.related_driver_id ? (
                    <EntityLinkOrTombstone
                      kind="driver"
                      id={String(matter.related_driver_id)}
                      name={matter.related_driver_name}
                      noun="Driver"
                    />
                  ) : (
                    "—"
                  )}
                </div>
                <div>
                  <strong>Insurance claim:</strong>{" "}
                  {matter?.insurance_claim_id ? (
                    <EntityLinkOrTombstone
                      kind="claim"
                      id={String(matter.insurance_claim_id)}
                      name={matter.insurance_claim_number}
                      noun="Claim"
                    />
                  ) : (
                    "—"
                  )}
                </div>
                <div>
                  <strong>Insurance lawsuit:</strong>{" "}
                  {matter?.insurance_lawsuit_id ? (
                    <EntityLinkOrTombstone
                      kind="lawsuit"
                      id={String(matter.insurance_lawsuit_id)}
                      name={matter.insurance_lawsuit_case_number}
                      noun="Lawsuit"
                      data-testid="matter-insurance-lawsuit-link"
                    />
                  ) : (
                    "—"
                  )}
                </div>
                <div>
                  <strong>Unit:</strong>{" "}
                  {matter?.unit_id ? (
                    <EntityLinkOrTombstone
                      kind="unit"
                      id={String(matter.unit_id)}
                      name={matter.unit_number}
                      noun="Unit"
                    />
                  ) : (
                    "—"
                  )}
                </div>
                <div>
                  <strong>Trailer:</strong>{" "}
                  {matter?.equipment_id ? (
                    <EntityLinkOrTombstone
                      kind="trailer"
                      id={String(matter.equipment_id)}
                      name={matter.equipment_number}
                      noun="Trailer"
                    />
                  ) : (
                    "—"
                  )}
                </div>
                <div>
                  <strong>Incident:</strong>{" "}
                  {matter?.incident_id ? (
                    <EntityLink
                      kind="claim"
                      id={String(matter.incident_id)}
                      /* safety.accidents is prod-only (no migration), so it cannot be joined for a display id.
                         A human label still satisfies CLS-UUID-LABEL — what it must never be is a uuid. */
                      label="Open incident"
                    />
                  ) : (
                    "—"
                  )}
                </div>
                <div><strong>Amount claimed against us:</strong> {matter?.amount_claimed_against_us != null ? formatUsd(matter.amount_claimed_against_us as string | number) : "—"}</div>
                <div><strong>Amount we seek:</strong> {matter?.amount_we_seek != null ? formatUsd(matter.amount_we_seek as string | number) : "—"}</div>
                <div><strong>Financial reserve:</strong> {matter?.financial_reserve_cents != null ? formatUsdCents(matter.financial_reserve_cents as number) : "—"}</div>
                <div><strong>Next hearing date:</strong> {matter?.next_hearing_date ? formatDateUS(matter.next_hearing_date) : "—"}</div>
                <div><strong>Statute of limitations:</strong> {matter?.statute_of_limitations_at ? formatDateUS(matter.statute_of_limitations_at) : "—"}</div>
                <div><strong>Closed at:</strong> {matter?.closed_at ? formatDateTimeUS(matter.closed_at as string) : "—"}</div>
                <div><strong>Attorney:</strong> {fieldOrDash(matter?.attorney_name)}</div>
                <div><strong>Attorney firm:</strong> {fieldOrDash(matter?.attorney_firm)}</div>
                <div><strong>Attorney phone:</strong> {fieldOrDash(matter?.attorney_phone)}</div>
                <div><strong>Attorney email:</strong> {fieldOrDash(matter?.attorney_email)}</div>
              </div>

              {matter?.outcome_summary ? (
                <div className="mt-3 border-t border-gray-100 pt-3">
                  <div className="text-xs font-semibold uppercase text-gray-500">Outcome summary</div>
                  <p className="mt-1 whitespace-pre-wrap">{String(matter.outcome_summary)}</p>
                </div>
              ) : null}

              {companyId && id ? (
                <div className="mt-3 border-t border-gray-100 pt-3">
                  <LegalMatterCostsReverseSection
                    operatingCompanyId={companyId}
                    legalMatterId={id}
                    data-testid="legal-matter-costs-reverse"
                  />
                </div>
              ) : null}

              {admin &&
              ["settled", "dismissed", "judgment"].includes(String(matter?.status ?? "")) &&
              String(matter?.status ?? "") !== "closed" ? (
                <div className="mt-4 border-t border-gray-100 pt-3">
                  <p className="text-xs font-semibold uppercase text-gray-500">Close matter</p>
                  <textarea
                    className="mt-2 w-full rounded-sm border border-gray-200 p-2 text-sm"
                    placeholder="Outcome documentation (required)"
                    value={closeNotes}
                    onChange={(e) => setCloseNotes(e.target.value)}
                  />
                  <Button
                    size="sm"
                    className="mt-2"
                    disabled={closeMut.isPending || closeNotes.trim().length < 10}
                    onClick={() => setCloseConfirmOpen(true)}
                  >
                    Close matter
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          <ConfirmModal
            open={closeConfirmOpen}
            title="Close this matter?"
            message="This is a terminal action — closing marks the matter closed with this outcome and cannot be reopened via edit. Confirm the outcome documentation is complete before proceeding."
            confirmLabel="Close matter"
            danger
            onClose={() => setCloseConfirmOpen(false)}
            onConfirm={async () => {
              await closeMut.mutateAsync();
            }}
          />

          {tab === "timeline" ? (
            <div className="space-y-3 rounded-sm border border-gray-200 bg-white p-4">
              {admin ? (
                <div className="space-y-2 border-b border-gray-100 pb-3" data-testid="legal-matter-timeline-note-creator">
                  <p className="text-xs font-medium text-slate-600">Add note</p>
                  <textarea
                    className="w-full rounded-sm border border-gray-200 px-2 py-1 text-sm"
                    placeholder="Note"
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    rows={3}
                    data-testid="legal-matter-timeline-note-input"
                  />
                  <Button
                    size="sm"
                    disabled={addEventMut.isPending || noteText.trim().length === 0}
                    onClick={() => void addEventMut.mutate()}
                    data-testid="legal-matter-timeline-note-submit"
                  >
                    Create note
                  </Button>
                </div>
              ) : null}
              <ul className="space-y-2 text-sm" data-testid="legal-matter-timeline-list">
                {(detailQuery.data.events ?? []).map((ev: LegalMatterEvent) => (
                  <li key={String(ev.id ?? Math.random())} className="rounded-sm bg-gray-50 px-2 py-1">
                    <span className="font-semibold">{String(ev.event_type ?? "")}</span>{" "}
                    <span className="text-xs text-gray-500">{String(ev.created_at ?? "")}</span>
                    <p className="mt-1 text-xs text-slate-700 whitespace-pre-wrap">{formatLegalMatterEventBody(ev)}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {tab === "documents" ? (
            <div className="space-y-3 rounded-sm border border-gray-200 bg-white p-4">
              {admin ? (
                <div className="space-y-2 border-b border-gray-100 pb-3">
                  <input type="file" onChange={(e) => setDocFile(e.target.files?.[0] ?? null)} />
                  <input
                    className="w-full rounded-sm border border-gray-200 px-2 py-1 text-sm"
                    placeholder="Title"
                    value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)}
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={docPriv} onChange={(e) => setDocPriv(e.target.checked)} /> Privileged
                    (Owner/Admin only)
                  </label>
                  <Button size="sm" disabled={uploadMut.isPending || !docFile} onClick={() => void uploadMut.mutate()}>
                    Upload
                  </Button>
                </div>
              ) : null}
              <ul className="space-y-2">
                {(detailQuery.data.documents ?? []).map((d: LegalMatterDocument) => {
                  const privileged = Boolean(d.privileged_mask);
                  return (
                    <li key={String(d.id ?? "")} className="flex items-center justify-between gap-2 text-sm">
                      <span>
                        {privileged ? "Privileged — Owner access only" : String(d.title ?? "")}
                        {d.is_privileged && !privileged ? " (privileged)" : ""}
                      </span>
                      {!privileged ? (
                        <Button size="sm" variant="secondary" type="button" onClick={() => void downloadDoc(String(d.id ?? ""))}>
                          Download
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {tab === "deadlines" ? (
            <div className="space-y-3 rounded-sm border border-gray-200 bg-white p-4">
              {admin ? (
                <div className="grid gap-2 border-b border-gray-100 pb-3 md:grid-cols-2">
                  <SelectCombobox className="rounded-sm border border-gray-200 px-2 py-1 text-sm" value={dlType} onChange={(e) => setDlType(e.target.value)}>
                    {["statute_of_limitations", "response", "hearing", "filing", "other"].map((t) => (
                      <option key={t} value={t}>
                        {properEnumOrFilterLabel(t)}
                      </option>
                    ))}
                  </SelectCombobox>
                  <input
                    className="rounded-sm border border-gray-200 px-2 py-1 text-sm"
                    placeholder="Title"
                    value={dlTitle}
                    onChange={(e) => setDlTitle(e.target.value)}
                  />
                  <DateTimePicker
                    aria-label="Deadline date and time"
                    value={dlAt}
                    onChange={setDlAt}
                  />
                  <input
                    className="rounded-sm border border-gray-200 px-2 py-1 text-sm"
                    placeholder="reminder emails comma-separated"
                    value={dlEmails}
                    onChange={(e) => setDlEmails(e.target.value)}
                  />
                  <Button size="sm" disabled={addDlMut.isPending || !dlTitle || !dlAt} onClick={() => void addDlMut.mutate()}>
                    Create deadline
                  </Button>
                </div>
              ) : null}
              <ul className="space-y-2 text-sm">
                {(detailQuery.data.deadlines ?? []).map((d: LegalMatterDeadline) => (
                  <li key={String(d.id ?? "")} className="flex flex-wrap items-center justify-between gap-2 rounded-sm bg-gray-50 px-2 py-2">
                    <div>
                      <div className="font-semibold">{String(d.title ?? "")}</div>
                      <div className="text-xs text-gray-600">
                        {/* LEGAL-MATTER-DEADLINE-RAW-TIMESTAMP-DISPLAY: this rendered the raw ISO
                            instant verbatim (e.g. "2026-09-01T04:00:00.000Z" for an 11 PM CT
                            deadline) instead of formatting it — every sibling date field on this
                            page already goes through formatDateTimeUS/formatDateUS a few lines
                            up. */}
                        {properEnumOrFilterLabel(d.deadline_type)} · {formatDateTimeUS(d.deadline_at as string)}
                      </div>
                    </div>
                    {admin && !d.completed_at ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        type="button"
                        onClick={() => void completeDlMut.mutate(String(d.id ?? ""))}
                      >
                        Mark done
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {tab === "notes" ? (
            <div className="rounded-sm border border-gray-200 bg-white p-4 text-sm text-gray-700 whitespace-pre-wrap">
              {String(matter?.internal_notes ?? "") || "No internal notes."}
            </div>
          ) : null}
        </>
      )}
      {companyId && id ? (
        <CreateBillModal
          open={createBillOpen}
          operatingCompanyId={companyId}
          linkedLegalMatterId={id}
          onClose={() => setCreateBillOpen(false)}
          onCreated={() => {
            void qc.invalidateQueries({ queryKey: ["accounting", "legal-matter-linked-costs", companyId, id] });
            void qc.invalidateQueries({ queryKey: ["accounting", "bills"] });
          }}
        />
      ) : null}
    </div>
  );
}
