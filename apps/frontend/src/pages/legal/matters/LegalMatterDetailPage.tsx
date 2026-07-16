import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
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
import { EntityLink } from "../../../components/shared/EntityLink";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { LegalModuleTabs } from "../LegalModuleTabs";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { formatDateUS, formatDateTimeUS } from "../../../lib/formatDate";
import { formatUsd, formatUsdCents } from "../../../lib/money";

type Tab = "overview" | "timeline" | "documents" | "deadlines" | "notes";

function fieldOrDash(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

export function LegalMatterDetailPage() {
  const { id = "" } = useParams();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { user } = useAuth();
  const qc = useQueryClient();
  const admin = user?.role === "Owner" || user?.role === "Administrator";
  const [tab, setTab] = useState<Tab>("overview");
  const [eventType, setEventType] = useState("note");
  const [eventBody, setEventBody] = useState("{}");
  const [dlType, setDlType] = useState("response");
  const [dlTitle, setDlTitle] = useState("");
  const [dlAt, setDlAt] = useState("");
  const [dlEmails, setDlEmails] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [docTitle, setDocTitle] = useState("");
  const [docPriv, setDocPriv] = useState(false);
  const [docFile, setDocFile] = useState<File | null>(null);

  const detailQuery = useQuery({
    queryKey: ["legal", "matter", companyId, id],
    queryFn: () => legalMattersApi.get(companyId, id),
    enabled: Boolean(companyId && id),
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["legal", "matter", companyId, id] });

  const addEventMut = useMutation({
    mutationFn: () =>
      legalMattersApi.addEvent(companyId, id, {
        event_type: eventType,
        event_body: JSON.parse(eventBody || "{}") as Record<string, unknown>,
      }),
    onSuccess: () => {
      invalidate();
      setEventBody("{}");
    },
  });

  const addDlMut = useMutation({
    mutationFn: () =>
      legalMattersApi.addDeadline(companyId, id, {
        deadline_type: dlType,
        title: dlTitle,
        deadline_at: new Date(dlAt).toISOString(),
        reminder_recipients: dlEmails.split(",").map((s) => s.trim()).filter(Boolean),
      }),
    onSuccess: () => {
      invalidate();
      setDlTitle("");
      setDlAt("");
    },
  });

  const closeMut = useMutation({
    mutationFn: () => legalMattersApi.close(companyId, id, { outcome_summary: closeNotes.trim() }),
    onSuccess: invalidate,
  });

  const completeDlMut = useMutation({
    mutationFn: (deadlineId: string) => legalMattersApi.completeDeadline(companyId, id, deadlineId),
    onSuccess: invalidate,
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
  });

  const matter = detailQuery.data?.matter;

  async function downloadDoc(documentId: string) {
    const path = legalMattersApi.documentDownloadUrl(companyId, id, documentId);
    const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
    const url = API_BASE_URL ? `${API_BASE_URL.replace(/\/$/, "")}${path}` : new URL(path, window.location.origin).toString();
    const res = await fetch(url, { credentials: "include" });
    const json = (await res.json()) as { download_url?: string; error?: string };
    if (!res.ok || !json.download_url) return;
    window.open(json.download_url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-3">
      <PageHeader
        breadcrumb={["Legal", "Matters"]}
        title={matter ? String(matter.matter_number ?? "Matter") : "Matter"}
        subtitle={matter ? String(matter.type ?? "") : ""}
        actions={
          <Link to="/legal/matters">
            <Button variant="secondary">Back to list</Button>
          </Link>
        }
      />
      <LegalModuleTabs activeTabId="matters" />
      {!companyId || !id ? (
        <p className="text-sm text-gray-600">Missing company or matter.</p>
      ) : detailQuery.isLoading ? (
        <p className="text-sm text-gray-600">Loading…</p>
      ) : detailQuery.isError || !detailQuery.data ? (
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

          {tab === "overview" ? (
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
                    <EntityLink kind="driver" id={String(matter.related_driver_id)} label="Open driver" />
                  ) : (
                    "—"
                  )}
                </div>
                <div>
                  <strong>Insurance claim:</strong>{" "}
                  {matter?.insurance_claim_id ? (
                    <EntityLink
                      kind="claim"
                      id={String(matter.insurance_claim_id)}
                      label={String(matter.insurance_claim_id).slice(0, 8)}
                    />
                  ) : (
                    "—"
                  )}
                </div>
                <div>
                  <strong>Unit:</strong>{" "}
                  {matter?.unit_id ? (
                    <EntityLink kind="unit" id={String(matter.unit_id)} label={String(matter.unit_id).slice(0, 8)} />
                  ) : (
                    "—"
                  )}
                </div>
                <div>
                  <strong>Incident:</strong>{" "}
                  {matter?.incident_id ? (
                    <Link className="text-slate-700 underline" to={`/safety/accidents`}>
                      {String(matter.incident_id).slice(0, 8)}
                    </Link>
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
                    onClick={() => void closeMut.mutate()}
                  >
                    Close matter
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {tab === "timeline" ? (
            <div className="space-y-3 rounded-sm border border-gray-200 bg-white p-4">
              {admin ? (
                <div className="space-y-2 border-b border-gray-100 pb-3">
                  <input
                    className="w-full rounded-sm border border-gray-200 px-2 py-1 text-sm"
                    placeholder="event_type"
                    value={eventType}
                    onChange={(e) => setEventType(e.target.value)}
                  />
                  <textarea
                    className="w-full rounded-sm border border-gray-200 px-2 py-1 text-sm"
                    placeholder='event_body JSON e.g. {"note":"..."}'
                    value={eventBody}
                    onChange={(e) => setEventBody(e.target.value)}
                  />
                  <Button size="sm" disabled={addEventMut.isPending} onClick={() => void addEventMut.mutate()}>
                    Create event
                  </Button>
                </div>
              ) : null}
              <ul className="space-y-2 text-sm">
                {(detailQuery.data.events ?? []).map((ev: LegalMatterEvent) => (
                  <li key={String(ev.id ?? Math.random())} className="rounded-sm bg-gray-50 px-2 py-1">
                    <span className="font-semibold">{String(ev.event_type ?? "")}</span>{" "}
                    <span className="text-xs text-gray-500">{String(ev.created_at ?? "")}</span>
                    <pre className="mt-1 overflow-x-auto text-xs">{JSON.stringify(ev.event_body, null, 2)}</pre>
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
                        {t}
                      </option>
                    ))}
                  </SelectCombobox>
                  <input
                    className="rounded-sm border border-gray-200 px-2 py-1 text-sm"
                    placeholder="Title"
                    value={dlTitle}
                    onChange={(e) => setDlTitle(e.target.value)}
                  />
                  <input
                    type="datetime-local"
                    className="rounded-sm border border-gray-200 px-2 py-1 text-sm"
                    value={dlAt}
                    onChange={(e) => setDlAt(e.target.value)}
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
                        {String(d.deadline_type ?? "")} · {String(d.deadline_at ?? "")}
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
    </div>
  );
}
