import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { type LoadDetail, updateLoad, useCancelLoad, useDispatchLoad, useLoad, useLoadAudit } from "../../api/loads";
import { createInvoiceFromLoad, listInvoices } from "../../api/accounting";
import { cancelDispatchLoad, distributeLoadInstructions, getDispatchAssignmentHistory } from "../../api/dispatch";
import { resolveApiUrl } from "../../api/client";
import { useToast } from "../Toast";
import { Button } from "../Button";
import { FlatFieldGrid } from "../layout/FlatFieldGrid";
import { DocumentsTab } from "../documents/DocumentsTab";
import { listFiles } from "../../api/docs";
import { CancelLoadModal } from "./CancelLoadModal";
import { LoadDetailDriverPayTab } from "./LoadDetailDriverPayTab";
import { LoadDetailSettlementTab } from "./LoadDetailSettlementTab";
import { LoadDetailGeofenceTimelineTab } from "./LoadDetailGeofenceTimelineTab";
import { STATUS_LABEL, formatMoneyCents } from "./constants";
import { LoadReassignModal } from "../../pages/dispatch/LoadReassignModal";
import { MultiStopEditor } from "../../pages/dispatch/MultiStopEditor";
import { LoadTemplateLibrary, SaveLoadTemplateModal, templateJsonFromLoadDetail } from "../../pages/dispatch/LoadTemplateLibrary";
import { AbandonmentReportModal } from "../../pages/loads/AbandonmentReportModal";
import { PreSettlementPanel } from "./PreSettlementPanel";
import { CustomsTab } from "./drawer-tabs/CustomsTab";
import { FactoringTab } from "./drawer-tabs/FactoringTab";
import { FinesDeductionsCard } from "./tabs/FinesDeductionsCard";
import { SettlementProfitabilityCard } from "./tabs/SettlementProfitabilityCard";
import { BookLoadModalV4 } from "../../pages/dispatch/components/BookLoadModalV4";

type Props = {
  loadId: string | null;
  isOpen: boolean;
  canEdit: boolean;
  operatingCompanyId?: string;
  onClose: () => void;
};

const tabs = [
  "Overview",
  "Stops",
  "Driver Pay",
  "Documents",
  "Factoring",
  "Customs",
  "Settlement",
  "Geofence Timeline",
  "Assignment History",
  "Audit",
  "Pre-Settlement",
] as const;
type DrawerTab = (typeof tabs)[number];

// RENDER-load-side-panel B1a: the Overview mirrors the Book Load wizard sections (read-only) so the
// dispatcher sees the load the way it was booked, with a per-section "Edit ▸" into the prefilled wizard.
const TRIP_TYPE_LABEL: Record<string, string> = {
  NB: "NB · Northbound",
  TR: "TR · Triangulation",
  SB: "SB · Southbound",
};

function OverviewWizardSection({ title, canEdit, onEdit, children }: { title: string; canEdit: boolean; onEdit: () => void; children: ReactNode }) {
  return (
    <section className="rounded border border-gray-200">
      <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-3 py-1.5">
        <span className="text-[11px] font-semibold text-gray-700">{title}</span>
        {canEdit ? (
          <button type="button" onClick={onEdit} className="text-[11px] font-semibold text-[#1f2a44] hover:underline">
            Edit ▸
          </button>
        ) : null}
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

function loadHasCrossBorder(load: LoadDetail): boolean {
  return (load.stops ?? []).some(
    (stop) =>
      stop.stop_type === "border" ||
      Boolean(stop.country && !["US", "USA", "United States"].includes(String(stop.country)))
  );
}
const FACTORING_PACKAGE_META_PREFIX = "IH35_FACTORING_PACKAGE_V1::";

type FactoringPackageMeta = {
  generated_at: string | null;
  emailed_at: string | null;
  uploaded_at: string | null;
  invoice_id: string | null;
};

function parseFactoringPackageNotes(notes: string | null | undefined): { visibleNotes: string; meta: FactoringPackageMeta } {
  const raw = String(notes ?? "");
  if (!raw.startsWith(FACTORING_PACKAGE_META_PREFIX)) {
    return { visibleNotes: raw, meta: { generated_at: null, emailed_at: null, uploaded_at: null, invoice_id: null } };
  }
  const newline = raw.indexOf("\n");
  const jsonChunk = newline >= 0 ? raw.slice(FACTORING_PACKAGE_META_PREFIX.length, newline) : raw.slice(FACTORING_PACKAGE_META_PREFIX.length);
  const visibleNotes = newline >= 0 ? raw.slice(newline + 1) : "";
  try {
    const parsed = JSON.parse(jsonChunk) as Partial<FactoringPackageMeta>;
    return {
      visibleNotes,
      meta: {
        generated_at: parsed.generated_at ?? null,
        emailed_at: parsed.emailed_at ?? null,
        uploaded_at: parsed.uploaded_at ?? null,
        invoice_id: parsed.invoice_id ?? null,
      },
    };
  } catch {
    return { visibleNotes: raw, meta: { generated_at: null, emailed_at: null, uploaded_at: null, invoice_id: null } };
  }
}

function serializeFactoringPackageNotes(meta: FactoringPackageMeta, visibleNotes: string) {
  return `${FACTORING_PACKAGE_META_PREFIX}${JSON.stringify(meta)}\n${visibleNotes.trim()}`.trim();
}

export function LoadDetailDrawer({ loadId, isOpen, canEdit, operatingCompanyId, onClose }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<DrawerTab>("Overview");
  // Block 7 — Edit opens the FULL Book/Edit wizard (BookLoadModalV4) pre-filled, replacing the old
  // rate+notes inline stub (which could only edit those two fields). The wizard is a superset.
  const [editWizardOpen, setEditWizardOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateLibraryOpen, setTemplateLibraryOpen] = useState(false);
  const [abandonmentOpen, setAbandonmentOpen] = useState(false);
  const { pushToast } = useToast();

  // BUG 1 fix: the side panel reads via the entity-scoped dispatch endpoint (operating_company_id passed) so
  // the Overview can't hang on an RLS-null / unscoped read; falls back to the mdata read if no company id.
  const dispatchLoadQuery = useDispatchLoad(loadId, operatingCompanyId);
  const mdataLoadQuery = useLoad(operatingCompanyId ? null : loadId);
  const loadQuery = operatingCompanyId ? dispatchLoadQuery : mdataLoadQuery;
  const auditQuery = useLoadAudit(loadId);
  const cancelMutation = useCancelLoad();
  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => updateLoad(id, body),
  });
  const createInvoiceMutation = useMutation({
    mutationFn: ({ operatingCompanyId, loadId }: { operatingCompanyId: string; loadId: string }) =>
      createInvoiceFromLoad(operatingCompanyId, { load_id: loadId }),
  });
  const distributeMutation = useMutation({
    mutationFn: ({ loadId, operatingCompanyId }: { loadId: string; operatingCompanyId: string }) =>
      distributeLoadInstructions(loadId, operatingCompanyId),
    onSuccess: () => pushToast("Driver instructions distributed", "success"),
  });

  const load = loadQuery.data;
  const assignmentHistoryQuery = useQuery({
    queryKey: ["dispatch", "assignment-history", loadId, load?.operating_company_id],
    queryFn: () => getDispatchAssignmentHistory(loadId as string, load?.operating_company_id as string),
    enabled: Boolean(loadId && load?.operating_company_id && activeTab === "Assignment History"),
  });
  const [autogeneratedForLoadId, setAutogeneratedForLoadId] = useState<string | null>(null);

  const routeSummary = useMemo(() => {
    if (!load) return "-";
    // FIX-2: derive origin/destination from the actual stops (first → last). first_pickup_city /
    // first_delivery_city are often null on the detail payload, which made toRouteSummary print
    // "Unknown origin -> Unknown destination" while the stops carried real cities. Show "—" when a
    // stop city is genuinely empty — never "Unknown".
    const stops = load.stops ?? [];
    const fmt = (s?: { city: string | null; state: string | null }) => (s ? [s.city, s.state].filter(Boolean).join(", ") : "");
    const origin = fmt(stops[0]) || load.first_pickup_city || "—";
    const dest = fmt(stops[stops.length - 1]) || load.first_delivery_city || "—";
    return `${origin} -> ${dest}`;
  }, [load]);
  const canInvoiceFromLoad = useMemo(() => {
    if (!load) return false;
    return ["delivered", "invoiced", "paid", "closed"].includes(load.status);
  }, [load]);
  const packageState = useMemo(() => parseFactoringPackageNotes(load?.notes), [load?.notes]);
  const loadDocsQuery = useQuery({
    queryKey: ["docs-files", "load-factoring-package", load?.id],
    queryFn: () => listFiles({ entity_type: "load", entity_id: load!.id, limit: 200, offset: 0 }).then((res) => res.files),
    enabled: Boolean(load?.id && activeTab === "Documents"),
  });
  const loadInvoicesQuery = useQuery({
    queryKey: ["factoring-package", "load-invoices", load?.id, load?.operating_company_id],
    queryFn: () => listInvoices(load!.operating_company_id, { customer_id: load!.customer_id }),
    enabled: Boolean(load?.id && load?.operating_company_id && activeTab === "Documents"),
  });
  const linkedInvoice = useMemo(() => {
    const rows = loadInvoicesQuery.data?.invoices ?? [];
    return rows.find((invoice) => invoice.source_load_id === load?.id) ?? null;
  }, [load?.id, loadInvoicesQuery.data?.invoices]);
  const invoiceDocsQuery = useQuery({
    queryKey: ["docs-files", "invoice-factoring-package", linkedInvoice?.id],
    queryFn: () => listFiles({ entity_type: "invoice", entity_id: linkedInvoice!.id, limit: 200, offset: 0 }).then((res) => res.files),
    enabled: Boolean(linkedInvoice?.id && activeTab === "Documents"),
  });
  const isPackageEligible = Boolean(load && ["delivered", "invoiced", "paid", "closed"].includes(load.status));
  const showCustomsTab = Boolean(load && loadHasCrossBorder(load));
  const visibleTabs = useMemo(
    () => tabs.filter((tab) => tab !== "Customs" || showCustomsTab),
    [showCustomsTab]
  );
  useEffect(() => {
    if (activeTab === "Customs" && !showCustomsTab) {
      setActiveTab("Overview");
    }
  }, [activeTab, showCustomsTab]);

  async function persistPackageMeta(nextMeta: FactoringPackageMeta) {
    if (!loadId) return;
    await updateMutation.mutateAsync({
      id: loadId,
      body: {
        notes: serializeFactoringPackageNotes(nextMeta, packageState.visibleNotes),
      },
    });
    void loadQuery.refetch();
  }

  async function generateFactoringPackage(auto = false) {
    if (!load || !isPackageEligible) return;
    const docs = loadDocsQuery.data ?? [];
    const rateConf = docs.filter((f) => f.category_code === "rate_confirmation");
    const signedDelivery = docs.filter((f) => f.category_code === "pod" || f.category_code === "bol");
    const invoiceFile = (invoiceDocsQuery.data ?? []).find((f) => f.mime_type.includes("pdf")) ?? null;
    const invoiceLink = linkedInvoice
      ? resolveApiUrl(`/api/v1/accounting/invoices/${encodeURIComponent(linkedInvoice.id)}.html?operating_company_id=${encodeURIComponent(load.operating_company_id)}`)
      : null;
    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Factoring Package - ${load.load_number}</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#111}h1{font-size:20px;margin:0 0 6px}h2{font-size:15px;margin:16px 0 6px}ol{padding-left:18px}li{margin:6px 0}.meta{font-size:12px;color:#555}</style></head><body><h1>Factoring Package</h1><div class="meta">Load ${load.load_number} · ${new Date().toLocaleString()}</div><h2>1) Customer rate confirmation</h2><ol>${rateConf.map((f) => `<li>${f.original_filename}</li>`).join("") || "<li>Missing rate confirmation document.</li>"}</ol><h2>2) Signed delivery documents / BOL</h2><ol>${signedDelivery.map((f) => `<li>${f.original_filename}</li>`).join("") || "<li>Missing POD/BOL documents.</li>"}</ol><h2>3) Our invoice</h2><ol>${linkedInvoice ? `<li>${linkedInvoice.display_id}${invoiceFile ? ` · ${invoiceFile.original_filename}` : ""}</li>` : "<li>Missing invoice for this load.</li>"}</ol>${invoiceLink ? `<p><a href="${invoiceLink}" target="_blank">Open invoice document</a></p>` : ""}</body></html>`;
    const win = window.open("", "_blank", "noopener,noreferrer,width=1000,height=800");
    if (win) {
      win.document.write(html);
      win.document.close();
    }
    await persistPackageMeta({
      generated_at: new Date().toISOString(),
      emailed_at: packageState.meta.emailed_at,
      uploaded_at: packageState.meta.uploaded_at,
      invoice_id: linkedInvoice?.id ?? null,
    });
    if (!auto) pushToast("Factoring package generated", "success");
  }

  useEffect(() => {
    if (!isPackageEligible || activeTab !== "Documents" || packageState.meta.generated_at || autogeneratedForLoadId === loadId) return;
    if (!loadId) return;
    void generateFactoringPackage(true).then(() => setAutogeneratedForLoadId(loadId));
  }, [activeTab, autogeneratedForLoadId, isPackageEligible, loadId, packageState.meta.generated_at]);

  if (!isOpen || !loadId) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <aside className="fixed right-0 top-0 z-50 h-full w-full overflow-y-auto bg-white shadow-xl md:w-[600px]">
        <header className="sticky top-0 border-b border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Load {load?.load_number ?? loadId}</h2>
              <p className="text-xs text-gray-500">{routeSummary}</p>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {visibleTabs.map((tab) => (
              <Button key={tab} type="button" size="sm" variant={activeTab === tab ? "primary" : "secondary"} onClick={() => setActiveTab(tab)} style={{ whiteSpace: "nowrap" }}>
                {tab}
              </Button>
            ))}
          </div>
        </header>

        <div className="p-4">
          {activeTab === "Overview" ? (
            load ? (
              <div className="space-y-3 text-sm">
                {/* §A — Customer · Invoice · Charges (charges = single total; line-item split is the gated
                    charge line-items block, NOT fabricated here). */}
                <OverviewWizardSection title="Customer · Invoice · Charges" canEdit={canEdit} onEdit={() => setEditWizardOpen(true)}>
                  <FlatFieldGrid
                    columns={2}
                    fields={[
                      { label: "Customer", value: load.customer_name ?? "—" },
                      { label: "Status", value: STATUS_LABEL[load.status] },
                      { label: "Customer WO #", value: load.customer_wo_number ?? "—" },
                      { label: "Pickup #", value: load.pickup_number ?? "—" },
                      { label: "Total customer invoice", value: formatMoneyCents(load.rate_total_cents, load.currency_code) },
                      { label: "Created", value: new Date(load.created_at).toLocaleString() },
                    ]}
                  />
                  <p className="mt-1 text-[10px] text-gray-400">Single customer total. Linehaul / fuel / accessorial breakdown arrives with the charge line-items block.</p>
                </OverviewWizardSection>

                {/* §B — Equipment · Driver · Trailer. W-FIX-3a surfaces team-driver name (join) + trailer
                    type/unit (loads.trailer_id → equipment) via read-only joins. Driver pay rate stays "—"
                    (the load-specific rate isn't persisted on the load — not fabricated). */}
                <OverviewWizardSection title="Equipment · Driver · Trailer" canEdit={canEdit} onEdit={() => setEditWizardOpen(true)}>
                  <FlatFieldGrid
                    columns={2}
                    fields={[
                      { label: "Trip Type", value: load.trip_type ? (TRIP_TYPE_LABEL[load.trip_type] ?? load.trip_type) : "—" },
                      { label: "Trailer type", value: load.trailer_equipment_type ?? "—" },
                      { label: "Truck unit", value: load.assigned_unit_number ?? "—" },
                      { label: "Trailer unit", value: load.trailer_number ?? "—" },
                      { label: "Driver", value: load.assigned_primary_driver_name ?? "Unassigned" },
                      { label: "Team driver", value: load.assigned_secondary_driver_name ?? (load.assigned_secondary_driver_id ? "—" : "Solo") },
                      { label: "Driver pay rate / mi", value: "—" },
                    ]}
                  />
                  <p className="mt-1 text-[10px] text-gray-400">Trailer type/unit show when a trailer is assigned (loads.trailer_id). Driver pay rate is the load-specific rate, not stored on the load yet.</p>
                </OverviewWizardSection>

                {/* §C — Stops · PC*MILER Routing (per-stop, from the live payload). */}
                <OverviewWizardSection title="Stops · PC*MILER Routing" canEdit={canEdit} onEdit={() => setEditWizardOpen(true)}>
                  <div className="space-y-2">
                    {(load.stops ?? []).map((stop) => (
                      <div key={stop.id} className="rounded border border-gray-100 p-2">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.4px] text-gray-500">{stop.stop_type}</div>
                        <FlatFieldGrid
                          columns={2}
                          fields={[
                            { label: "Address", value: stop.address_line1 ?? "—" },
                            { label: "City / St / Zip", value: [[stop.city, stop.state].filter(Boolean).join(", "), stop.postal_code].filter(Boolean).join(" ") || "—" },
                            { label: "Date / Time", value: stop.scheduled_arrival_at ? new Date(stop.scheduled_arrival_at).toLocaleString() : "—" },
                            { label: "Site contact", value: stop.site_contact_name ?? "—" },
                            { label: "Dock", value: stop.gate_dock_text ?? "—" },
                            { label: "Lumper amount", value: stop.lumper_amount_cents != null ? formatMoneyCents(stop.lumper_amount_cents, load.currency_code) : "—" },
                          ]}
                        />
                      </div>
                    ))}
                    {(load.stops ?? []).length === 0 ? <div className="text-xs text-gray-500">No stops on this load.</div> : null}
                  </div>
                </OverviewWizardSection>

                {load.operating_company_id ? (
                  <div className="flex flex-wrap gap-2">
                    {canEdit ? (
                      <>
                        <Button type="button" variant="secondary" size="sm" onClick={() => setReassignOpen(true)}>
                          Reassign driver
                        </Button>
                        <Button type="button" variant="secondary" size="sm" onClick={() => setSaveTemplateOpen(true)}>
                          Save as template
                        </Button>
                        <Button type="button" variant="secondary" size="sm" onClick={() => setTemplateLibraryOpen(true)}>
                          Template library
                        </Button>
                      </>
                    ) : null}
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        window.open(
                          resolveApiUrl(
                            `/api/v1/dispatch/loads/${encodeURIComponent(loadId)}/dispatch-sheet.html?operating_company_id=${encodeURIComponent(
                              load.operating_company_id
                            )}`
                          ),
                          "_blank",
                          "noopener,noreferrer"
                        )
                      }
                    >
                      View dispatch sheet
                    </Button>
                    {canEdit ? (
                      <Button type="button" variant="secondary" size="sm" onClick={() => setAbandonmentOpen(true)}>
                        Report abandonment
                      </Button>
                    ) : null}
                  </div>
                ) : null}

                {(
                  <div className="space-y-2 rounded border border-gray-200 p-3">
                    <div>
                      <div className="text-xs text-gray-600">Notes</div>
                      <div className="mt-1 text-sm text-gray-800">{packageState.visibleNotes || "-"}</div>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t border-gray-100 pt-2">
                      <div>
                        <div className="text-xs font-semibold text-gray-700">Invoice</div>
                        <div className="text-[11px] text-gray-500">
                          {canInvoiceFromLoad ? "Delivered loads can create/view invoice." : "Invoice creation is available once load is delivered."}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={async () => {
                          if (!load) return;
                          const result = await createInvoiceMutation.mutateAsync({
                            operatingCompanyId: load.operating_company_id,
                            loadId: load.id,
                          });
                          const invoiceId = result.invoice?.id;
                          if (!invoiceId) return;
                          navigate(`/accounting/invoices/${invoiceId}`);
                        }}
                        loading={createInvoiceMutation.isPending}
                        disabled={!canInvoiceFromLoad}
                      >
                        Create / View Invoice
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : loadQuery.isError ? (
              // BUG 1: never hang silently — surface the error + a retry instead of an endless "Loading…".
              <div className="space-y-2 text-sm">
                <div className="text-red-700">Couldn't load this load’s overview.</div>
                <div className="text-xs text-gray-500">{String((loadQuery.error as Error | undefined)?.message ?? "Request failed")}</div>
                <Button size="sm" variant="secondary" onClick={() => void loadQuery.refetch()}>
                  Retry
                </Button>
              </div>
            ) : loadQuery.isLoading ? (
              <div className="text-sm text-gray-500">Loading load overview...</div>
            ) : (
              <div className="text-sm text-gray-500">Load not found.</div>
            )
          ) : null}

          {activeTab === "Stops" ? (
            load ? (
              canEdit ? (
                <MultiStopEditor loadId={load.id} operatingCompanyId={load.operating_company_id} />
              ) : (
                <div className="space-y-2">
                  {load?.stops?.map((stop) => (
                    <div key={stop.id} className="rounded border border-gray-200 p-3 text-sm">
                      <div className="font-semibold text-gray-800">
                        #{stop.sequence_number} · {stop.stop_type}
                      </div>
                      <div className="text-gray-600">
                        {stop.city ?? "-"}, {stop.state ?? "-"} ({stop.country ?? "-"})
                      </div>
                      <div className="text-xs text-gray-500">
                        Scheduled: {stop.scheduled_arrival_at ? new Date(stop.scheduled_arrival_at).toLocaleString() : "-"}
                      </div>
                    </div>
                  ))}
                  {load && load.stops.length === 0 ? <div className="text-sm text-gray-500">No stops found.</div> : null}
                </div>
              )
            ) : (
              <div className="text-sm text-gray-500">Loading stops…</div>
            )
          ) : null}

          {activeTab === "Driver Pay" ? (
            load ? (
              <LoadDetailDriverPayTab
                loadId={load.id}
                operatingCompanyId={load.operating_company_id}
                currencyCode={load.currency_code}
              />
            ) : (
              <div className="text-sm text-gray-500">Loading…</div>
            )
          ) : null}

          {activeTab === "Settlement" ? (
            load ? (
              <LoadDetailSettlementTab
                loadId={load.id}
                operatingCompanyId={load.operating_company_id}
                currencyCode={load.currency_code}
              />
            ) : (
              <div className="text-sm text-gray-500">Loading…</div>
            )
          ) : null}

          {activeTab === "Geofence Timeline" ? (
            load ? (
              <LoadDetailGeofenceTimelineTab
                loadId={load.id}
                operatingCompanyId={load.operating_company_id}
              />
            ) : (
              <div className="text-sm text-gray-500">Loading…</div>
            )
          ) : null}

          {activeTab === "Documents" ? (
            load ? (
              <div className="space-y-2">
                <div className="rounded border border-emerald-200 bg-emerald-50 p-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs text-emerald-900">
                      Factoring package (rate confirmation + POD/BOL + invoice)
                      <div className="mt-1 text-[11px] text-emerald-800">
                        {packageState.meta.generated_at
                          ? `Generated ${new Date(packageState.meta.generated_at).toLocaleString()}`
                          : "Not generated yet"}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => void generateFactoringPackage()} disabled={!isPackageEligible}>
                        Generate package PDF
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          void persistPackageMeta({
                            ...packageState.meta,
                            emailed_at: new Date().toISOString(),
                          }).then(() => pushToast("Marked as emailed to factoring company", "success"))
                        }
                        disabled={!packageState.meta.generated_at}
                      >
                        Email package
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          void persistPackageMeta({
                            ...packageState.meta,
                            uploaded_at: new Date().toISOString(),
                          }).then(() => pushToast("Marked as uploaded to factoring portal", "success"))
                        }
                        disabled={!packageState.meta.generated_at}
                      >
                        Mark uploaded
                      </Button>
                    </div>
                  </div>
                  {!isPackageEligible ? <div className="mt-1 text-[11px] text-emerald-800">Package auto-generates once load is delivered/closed.</div> : null}
                </div>
                <div className="rounded border border-slate-300 bg-slate-100 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-slate-700">Driver Instructions PDF + Portal/SMS/WhatsApp distribution</div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!load.driver_instructions_file_id}
                        onClick={() => {
                          if (!load.driver_instructions_file_id) return;
                          window.open(
                            `/api/v1/docs/files/${load.driver_instructions_file_id}/download-url`,
                            "_blank",
                            "noopener,noreferrer"
                          );
                        }}
                      >
                        Preview
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!load.driver_instructions_file_id}
                        onClick={() => {
                          if (!load.driver_instructions_file_id) return;
                          window.open(
                            `/api/v1/docs/files/${load.driver_instructions_file_id}/download-url`,
                            "_blank",
                            "noopener,noreferrer"
                          );
                        }}
                      >
                        Download
                      </Button>
                      <Button
                        size="sm"
                        onClick={() =>
                          distributeMutation.mutate({ loadId: load.id, operatingCompanyId: load.operating_company_id })
                        }
                        loading={distributeMutation.isPending}
                      >
                        Resend
                      </Button>
                    </div>
                  </div>
                </div>
                <DocumentsTab entityType="load" entityId={load.id} entityName={load.load_number} />
              </div>
            ) : (
              <div className="text-sm text-gray-500">Loading...</div>
            )
          ) : null}

          {activeTab === "Audit" ? (
            <div className="space-y-2">
              {auditQuery.isLoading ? <div className="text-sm text-gray-500">Loading audit history...</div> : null}
              {(auditQuery.data ?? []).map((event) => (
                <div key={event.uuid} className="rounded border border-gray-200 p-3 text-sm">
                  <div className="font-semibold text-gray-800">{event.event_class}</div>
                  <div className="text-xs text-gray-500">{new Date(event.created_at).toLocaleString()}</div>
                  <pre className="mt-2 overflow-x-auto rounded bg-gray-50 p-2 text-xs text-gray-700">
                    {JSON.stringify(event.payload, null, 2)}
                  </pre>
                </div>
              ))}
              {!auditQuery.isLoading && (auditQuery.data ?? []).length === 0 ? <div className="text-sm text-gray-500">No audit events found.</div> : null}
            </div>
          ) : null}
          {activeTab === "Assignment History" ? (
            <div className="space-y-3">
              {assignmentHistoryQuery.isLoading ? <div className="text-sm text-gray-500">Loading assignment history…</div> : null}
              {(assignmentHistoryQuery.data?.rows ?? []).map((row) => {
                const r = row as Record<string, unknown>;
                const id = String(r.id ?? "");
                const at = r.assigned_at ? new Date(String(r.assigned_at)).toLocaleString() : "";
                const method = String(r.assignment_method ?? "");
                const reason = r.reason_code != null ? String(r.reason_code) : "";
                const notes = r.notes != null ? String(r.notes) : "";
                const prev = r.previous_driver_id != null ? String(r.previous_driver_id).slice(0, 8) : "—";
                const next = r.new_driver_id != null ? String(r.new_driver_id).slice(0, 8) : "—";
                return (
                  <div key={id || at + method} className="relative border-l-2 border-slate-300 pl-3">
                    <div className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-slate-1000" />
                    <div className="text-xs text-gray-500">{at}</div>
                    <div className="text-sm font-semibold text-gray-800">{method.replace(/_/g, " ")}</div>
                    <div className="text-xs text-gray-600">
                      Driver {prev} → {next}
                    </div>
                    {reason ? <div className="mt-1 text-xs text-gray-700">Reason: {reason}</div> : null}
                    {notes ? <div className="mt-1 text-xs text-gray-600">Notes: {notes}</div> : null}
                  </div>
                );
              })}
              {!assignmentHistoryQuery.isLoading && (assignmentHistoryQuery.data?.rows ?? []).length === 0 ? (
                <div className="text-sm text-gray-500">No assignment events yet.</div>
              ) : null}
            </div>
          ) : null}

          {activeTab === "Pre-Settlement" ? (
            load?.assigned_primary_driver_id ? (
              <PreSettlementPanel
                driverId={load.assigned_primary_driver_id}
                operatingCompanyId={load.operating_company_id}
                onSettled={() => void loadQuery.refetch()}
              />
            ) : (
              <div className="text-sm text-gray-500">No driver assigned to this load.</div>
            )
          ) : null}

          {/* Block 7 — Factoring packet tab (stub; Lane B fills content) */}
          {activeTab === "Factoring" && load ? (
            <FactoringTab loadId={load.id} operatingCompanyId={load.operating_company_id} canEdit={canEdit} />
          ) : null}

          {/* Block 8 — Customs/border compliance tab (stub; hidden for domestic loads) */}
          {activeTab === "Customs" && load && showCustomsTab ? (
            <CustomsTab loadId={load.id} operatingCompanyId={load.operating_company_id} canEdit={canEdit} />
          ) : null}

          {/* Block 9 — Settlement profitability card (DISP-PROFIT: wired to the real per-load
              profitability breakdown; the drawer-tabs stub was orphaned). */}
          {activeTab === "Settlement" && load ? (
            <div className="mt-3">
              <SettlementProfitabilityCard loadId={load.id} operatingCompanyId={load.operating_company_id} currencyCode={load.currency_code} />
            </div>
          ) : null}

          {/* Block 13 — Fines & deductions confirm/defer card (stub; Lane A Block 13 fills content) */}
          {activeTab === "Settlement" && load ? (
            <div className="mt-3">
              <FinesDeductionsCard loadId={load.id} operatingCompanyId={load.operating_company_id} canEdit={canEdit} />
            </div>
          ) : null}
        </div>

        <footer className="sticky bottom-0 flex items-center justify-between border-t border-gray-200 bg-white p-4">
          <Button type="button" variant="danger" size="sm" onClick={() => setCancelOpen(true)} disabled={!load || load.status === "cancelled"}>
            Cancel Load
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!canEdit || !load}
              onClick={() => {
                if (!load) return;
                setEditWizardOpen(true);
              }}
            >
              Edit
            </Button>
            <Button type="button" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </footer>
      </aside>

      {load ? (
        <BookLoadModalV4
          open={editWizardOpen}
          operatingCompanyId={load.operating_company_id}
          editLoadId={load.id}
          onClose={() => setEditWizardOpen(false)}
          onCreated={() => {
            setEditWizardOpen(false);
            void loadQuery.refetch();
          }}
        />
      ) : null}

      {load ? (
        <LoadReassignModal
          open={reassignOpen}
          onClose={() => {
            setReassignOpen(false);
            void loadQuery.refetch();
            void assignmentHistoryQuery.refetch();
          }}
          loadId={load.id}
          operatingCompanyId={load.operating_company_id}
          loadNumber={load.load_number}
        />
      ) : null}

      {load ? (
        <SaveLoadTemplateModal
          open={saveTemplateOpen}
          onClose={() => setSaveTemplateOpen(false)}
          operatingCompanyId={load.operating_company_id}
          initialJson={templateJsonFromLoadDetail({
            customer_id: load.customer_id,
            customer_name: load.customer_name,
            rate_total_cents: load.rate_total_cents,
            notes: load.notes,
            stops: load.stops,
          })}
          onSaved={() => {
            pushToast("Template saved", "success");
            void queryClient.invalidateQueries({ queryKey: ["load-templates", load.operating_company_id] });
          }}
        />
      ) : null}

      {load ? (
        <LoadTemplateLibrary
          open={templateLibraryOpen}
          onClose={() => setTemplateLibraryOpen(false)}
          operatingCompanyId={load.operating_company_id}
        />
      ) : null}

      {abandonmentOpen && load && load.operating_company_id ? (
        <AbandonmentReportModal
          loadId={loadId}
          operatingCompanyId={load.operating_company_id}
          defaultDriverId={load.assigned_primary_driver_id ?? load.assigned_secondary_driver_id}
          onClose={() => setAbandonmentOpen(false)}
          onRecorded={() => void loadQuery.refetch()}
        />
      ) : null}

      {load ? (
        <CancelLoadModal
          open={cancelOpen}
          operatingCompanyId={load.operating_company_id}
          onClose={() => setCancelOpen(false)}
          onSubmit={async (payload) => {
            await cancelDispatchLoad(load.id, {
              operating_company_id: load.operating_company_id,
              ...payload,
            });
            await cancelMutation.mutateAsync({ id: load.id, reasonCode: payload.reason_code, notes: payload.cancellation_notes });
            pushToast("Load cancellation submitted", "success");
            setCancelOpen(false);
            void loadQuery.refetch();
            void auditQuery.refetch();
          }}
        />
      ) : null}
    </>
  );
}
