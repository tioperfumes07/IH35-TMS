import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { type LoadDetail, updateLoad, useDispatchLoad, useLoad, useLoadAudit, useRemintDriverBill, useUpdateLoadStatus } from "../../api/loads";
import { createInvoiceFromLoad, listLoadExpenses, listLoadInvoices } from "../../api/accounting";
import { cancelDispatchLoad, distributeLoadInstructions, getDispatchAssignmentHistory, getRecentAutoStatusSwitches } from "../../api/dispatch";
import { AutoStatusSwitchedBadge } from "./AutoStatusSwitchedBadge";
import { resolveApiUrl } from "../../api/client";
import { openPrintableDocument } from "../../lib/openPrintableDocument";
import { useToast } from "../Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { Button } from "../Button";
import { ListErrorState } from "../ListErrorState";
import { FlatFieldGrid } from "../layout/FlatFieldGrid";
import { DocumentsTab } from "../documents/DocumentsTab";
import { getDownloadUrl, listAllFiles } from "../../api/docs";
import { CancelLoadModal } from "./CancelLoadModal";
import { LoadBolPanel } from "./LoadBolPanel";
import { LoadDetailDriverPayTab } from "./LoadDetailDriverPayTab";
import { LoadDetailSettlementTab } from "./LoadDetailSettlementTab";
import { LoadDetailGeofenceTimelineTab } from "./LoadDetailGeofenceTimelineTab";
import { EntityAuditHistoryTab } from "../audit/EntityAuditHistoryTab";
import { STATUS_LABEL, formatMoneyCents } from "./constants";
import { LoadReassignModal } from "../../pages/dispatch/LoadReassignModal";
import { MultiStopEditor } from "../../pages/dispatch/MultiStopEditor";
import { LoadTemplateLibrary, SaveLoadTemplateModal, templateJsonFromLoadDetail } from "../../pages/dispatch/LoadTemplateLibrary";
import { AbandonmentReportModal } from "../../pages/loads/AbandonmentReportModal";
import { PreSettlementPanel } from "./PreSettlementPanel";
import { CustomsTab } from "./drawer-tabs/CustomsTab";
import { FactoringTab } from "./tabs/FactoringTab";
import { FinesDeductionsCard } from "./tabs/FinesDeductionsCard";
import { SettlementProfitabilityCard } from "./tabs/SettlementProfitabilityCard";
import { InsuranceClaimsReverseSection } from "../insurance/InsuranceClaimsReverseSection";
import { LoadSafetyReverseSection } from "../safety/LoadSafetyReverseSection";
import { LoadWorkOrdersReverseSection } from "./LoadWorkOrdersReverseSection";
import { LoadQualityEventsReverseSection } from "./LoadQualityEventsReverseSection";
import { LoadDetentionReverseSection } from "./LoadDetentionReverseSection";
import { LoadInTransitIssuesReverseSection } from "./LoadInTransitIssuesReverseSection";
import { LoadDriverReportsReverseSection } from "../maintenance/LoadDriverReportsReverseSection";
import { FuelTransactionsReverseSection } from "../fuel/FuelTransactionsReverseSection";
import { ExpensesReverseSection } from "../accounting/ExpensesReverseSection";
import { BillsReverseSection } from "../accounting/BillsReverseSection";
import { InvoicesReverseSection } from "../accounting/InvoicesReverseSection";
import { BookLoadModalV4 } from "../../pages/dispatch/components/BookLoadModalV4";
import { CargoSensorTimeline } from "../../pages/dispatch/cargo-sensors/CargoSensorTimeline";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
import { entityLabel } from "../../lib/entity-label";
import { listDispatchFlagColors } from "../../api/catalogs";
import { ReferenceSelect } from "../parity/ReferenceSelect";
import { getOfficeTransitionButtons } from "@ih35/shared-types";

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
  "Cargo Sensors",
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
    <section className="rounded-sm border border-gray-200">
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

  // Prefer entity-scoped dispatch GET (fuller payload). ALWAYS race mdata GET in parallel —
  // do not wait for dispatchFailed. A slow-but-not-failed dispatch GET left customers→load
  // reverse drills on "Loading load overview..." for 20s+ while mdata would have settled in
  // ~160ms (LV-CUSTOMERS-LOADS-DRAWER-INDEFINITE-LOADING). When dispatch 404s (historically:
  // INNER JOIN on a deactivated customer — LV-SYSTEM-AUDIT-LOAD-LINK-DEAD-END), mdata still
  // fills the drawer.
  const dispatchLoadQuery = useDispatchLoad(loadId, operatingCompanyId);
  const mdataLoadQuery = useLoad(loadId, operatingCompanyId);
  const load = (dispatchLoadQuery.data ?? mdataLoadQuery.data) as LoadDetail | undefined;
  const loadQueryIsLoading =
    !load && (mdataLoadQuery.isLoading || Boolean(operatingCompanyId && dispatchLoadQuery.isLoading));
  const loadQueryIsError =
    !load &&
    !loadQueryIsLoading &&
    mdataLoadQuery.isError &&
    (!operatingCompanyId || dispatchLoadQuery.isError);
  const loadQueryError = (dispatchLoadQuery.error ?? mdataLoadQuery.error) as Error | undefined;
  const refetchLoad = () => {
    void dispatchLoadQuery.refetch();
    void mdataLoadQuery.refetch();
  };
  const auditQuery = useLoadAudit(loadId, operatingCompanyId);
  const statusMutation = useUpdateLoadStatus(load?.operating_company_id ?? operatingCompanyId ?? null);
  const remintDriverBillMutation = useRemintDriverBill(load?.operating_company_id ?? operatingCompanyId ?? null);
  const updateMutation = useMutation({
    mutationFn: ({ id, operatingCompanyId, body }: { id: string; operatingCompanyId: string; body: Record<string, unknown> }) =>
      updateLoad(id, operatingCompanyId, body),
    // DISP-F6320: every caller (dispatch flag select, factoring-package generate/email/mark-uploaded)
    // did `void updateMutation.mutateAsync(...).then(...)` with no `.catch()` and no onError here — a
    // failed PATCH silently did nothing: no toast, no revert explanation, .then()'s refetch/toast
    // never ran. Surface it once, for every caller, instead of a silent no-op.
    onError: (err) => pushToast(userFacingApiError(err, "Update failed"), "error"),
  });
  const createInvoiceMutation = useMutation({
    mutationFn: ({ operatingCompanyId, loadId }: { operatingCompanyId: string; loadId: string }) =>
      createInvoiceFromLoad(operatingCompanyId, { load_id: loadId }),
    // DISP-F6320: "Create / View Invoice" awaited this with no try/catch and no onError — a failed
    // create silently did nothing (unhandled promise rejection, no user feedback).
    onError: (err) => pushToast(userFacingApiError(err, "Create invoice failed"), "error"),
  });
  const distributeMutation = useMutation({
    mutationFn: ({ loadId, operatingCompanyId }: { loadId: string; operatingCompanyId: string }) =>
      distributeLoadInstructions(loadId, operatingCompanyId),
    onSuccess: () => pushToast("Driver instructions distributed", "success"),
    // DISP-LOAD-DRAWER-RESEND-SILENT-FAILURE: Resend is an operator action, so a rejected
    // distribution must be visible instead of ending as an unexplained no-op.
    onError: (err) => pushToast(userFacingApiError(err, "Driver instruction distribution failed"), "error"),
  });

  const flagColorsQuery = useQuery({
    queryKey: ["dispatch-flag-colors", load?.operating_company_id],
    queryFn: () => listDispatchFlagColors(load!.operating_company_id),
    enabled: Boolean(load?.operating_company_id && activeTab === "Overview"),
  });
  // d-02: Cancel Load is only for persisted, non-cancelled loads — unsaved/loading/not-found get plain Close.
  const canCancelPersistedLoad = Boolean(load && load.status !== "cancelled");
  const assignmentHistoryQuery = useQuery({
    queryKey: ["dispatch", "assignment-history", loadId, load?.operating_company_id],
    queryFn: () => getDispatchAssignmentHistory(loadId as string, load?.operating_company_id as string),
    enabled: Boolean(loadId && load?.operating_company_id && activeTab === "Assignment History"),
  });
  const [autogeneratedForLoadId, setAutogeneratedForLoadId] = useState<string | null>(null);
  // GAP-56 / CAP-4 — badge the Status field when this load's current status was the result of an
  // automatic GPS-drift correction rather than a manual dispatcher change.
  const autoStatusSwitchQuery = useQuery({
    queryKey: ["dispatch", "auto-status-switch-recent", load?.operating_company_id],
    queryFn: () => getRecentAutoStatusSwitches(load!.operating_company_id, 100),
    enabled: Boolean(load?.operating_company_id && activeTab === "Overview"),
    staleTime: 60_000,
  });
  const autoStatusSwitchForLoad = useMemo(
    () => autoStatusSwitchQuery.data?.events?.find((event) => event.load_uuid === load?.id) ?? null,
    [autoStatusSwitchQuery.data, load?.id]
  );

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
    // DISP-F6XXX (breakdown-relay hop.invoice) — the real, authorized write path for a delivered load
    // is PATCH /api/v1/dispatch/loads/:id/transition (LV-TXN-004 / WIRE-07), whose DispatchStatus enum
    // has NO plain "delivered" value — it only ever lands a load on "delivered_pending_docs" or
    // "completed_docs_received" (apps/frontend/src/api/dispatch.ts). The bare "delivered" LoadStatus
    // value is reachable only through the forbidden mdata /status shortcut, so this gate was checking a
    // status the correct flow can never produce — every load delivered the right way hit a permanently
    // disabled "Create / View Invoice" button with zero network requests on click. The backend
    // /accounting/invoices/from-load route itself has no status gate at all (only load_not_found /
    // load_has_no_rate), so this FE check was strictly narrower than the real business rule.
    return ["delivered", "delivered_pending_docs", "completed_docs_received", "invoiced", "paid", "closed"].includes(load.status);
  }, [load]);
  // ACCT-F10164 — matches the backend's own loadStatusRequiresDeliveryDepartureStamp gate exactly
  // (delivery-evidence-status.ts), the same predicate the status-PATCH route uses to decide whether
  // ensureDriverBillArtifactsForLoad should even run.
  const canRemintDriverBill = useMemo(() => {
    if (!load) return false;
    return ["delivered_pending_docs", "completed_docs_received"].includes(load.status);
  }, [load]);
  const packageState = useMemo(() => parseFactoringPackageNotes(load?.notes), [load?.notes]);
  const loadDocsQuery = useQuery({
    queryKey: ["docs-files", "load-factoring-package", load?.operating_company_id, load?.id],
    queryFn: () => listAllFiles({ operating_company_id: load!.operating_company_id, entity_type: "load", entity_id: load!.id }).then((res) => res.files),
    enabled: Boolean(load?.id && load?.operating_company_id && activeTab === "Documents"),
  });
  const loadInvoicesQuery = useQuery({
    queryKey: ["factoring-package", "load-invoices", load?.id, load?.operating_company_id],
    // WAVE-H2: server-side source_load_id filter (not customer_id + client filter).
    queryFn: () => listLoadInvoices(load!.operating_company_id, load!.id, { limit: 50 }),
    // LV-INVOICE-RATE-SNAPSHOT: also needed on Overview, where the Create/View Invoice button lives —
    // the button must distinguish "no invoice yet" (creating one at rate 0 is unrecoverable) from
    // "invoice exists" (viewing it must keep working).
    enabled: Boolean(load?.id && load?.operating_company_id && (activeTab === "Documents" || activeTab === "Overview")),
  });
  const loadExpensesQuery = useQuery({
    queryKey: ["load-expenses", load?.id, load?.operating_company_id],
    queryFn: () => listLoadExpenses(load!.operating_company_id, load!.id, { limit: 1 }),
    enabled: Boolean(load?.id && load?.operating_company_id && activeTab === "Overview"),
  });
  const linkedInvoice = useMemo(() => {
    const rows = loadInvoicesQuery.data?.invoices ?? [];
    return rows[0] ?? null;
  }, [loadInvoicesQuery.data?.invoices]);
  // DSP-MONEY-F7175: absent cache is not "no invoice". A failed/in-flight listLoadInvoices
  // must not enable createInvoiceFromLoad (duplicate) or treat missing invoice.id as a silent View.
  const invoiceLookupUnresolved =
    loadInvoicesQuery.isLoading || (loadInvoicesQuery.isFetching && loadInvoicesQuery.data === undefined);
  const invoiceLookupFailed = loadInvoicesQuery.isError;
  const invoiceDocsQuery = useQuery({
    queryKey: ["docs-files", "invoice-factoring-package", load?.operating_company_id, linkedInvoice?.id],
    queryFn: () => listAllFiles({ operating_company_id: load!.operating_company_id, entity_type: "invoice", entity_id: linkedInvoice!.id }).then((res) => res.files),
    enabled: Boolean(load?.operating_company_id && linkedInvoice?.id && activeTab === "Documents"),
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
    if (!loadId || !load?.operating_company_id) return;
    await updateMutation.mutateAsync({
      id: loadId,
      operatingCompanyId: load.operating_company_id,
      body: {
        notes: serializeFactoringPackageNotes(nextMeta, packageState.visibleNotes),
      },
    });
    refetchLoad();
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
    // DSP-MONEY-F7264 — window.open() returning null (popup blocked) used to be silently ignored:
    // persistPackageMeta stamped generated_at and the success toast fired regardless of whether the
    // package window ever actually opened. A blocked popup therefore recorded and announced a
    // package that was never presented to the user. Only stamp/announce success when a real window
    // was returned; otherwise bail out honestly without touching persisted state.
    const win = window.open("", "_blank", "noopener,noreferrer,width=1000,height=800");
    if (!win) {
      if (!auto) pushToast("Factoring package popup was blocked — allow popups for this site and try again", "error");
      return;
    }
    win.document.write(html);
    win.document.close();
    // DSP-MONEY-F7276 — persistPackageMeta's mutateAsync was awaited with no rejection handler here,
    // and both the auto-effect and the manual button called this function with `void`/`.then()` and
    // no `.catch()` of their own. A real package window could open, then the metadata PATCH could
    // fail (network/RLS/validation), and the operator got an unhandled promise rejection instead of
    // any failure signal or retry path. Catch here so both call sites are covered by one fix.
    try {
      await persistPackageMeta({
        generated_at: new Date().toISOString(),
        emailed_at: packageState.meta.emailed_at,
        uploaded_at: packageState.meta.uploaded_at,
        invoice_id: linkedInvoice?.id ?? null,
      });
    } catch (error) {
      if (!auto) pushToast(userFacingApiError(error, "Factoring package could not be saved"), "error");
      return;
    }
    if (!auto) pushToast("Factoring package generated", "success");
  }

  async function openDriverInstructionsFile() {
    if (!load?.driver_instructions_file_id) return;
    try {
      const result = await getDownloadUrl(load.driver_instructions_file_id);
      const popup = window.open(result.presigned_url, "_blank", "noopener,noreferrer");
      if (!popup) throw new Error("Your browser blocked the driver instructions window. Allow pop-ups and retry.");
    } catch (error) {
      pushToast(userFacingApiError(error, "Driver instructions download failed"), "error");
    }
  }

  useEffect(() => {
    if (!isPackageEligible || activeTab !== "Documents" || packageState.meta.generated_at || autogeneratedForLoadId === loadId) return;
    if (!loadId) return;
    void generateFactoringPackage(true).then(() => setAutogeneratedForLoadId(loadId));
  }, [activeTab, autogeneratedForLoadId, isPackageEligible, loadId, packageState.meta.generated_at]);

  if (!isOpen || !loadId) return null;

  // LV-WO-LOAD-DRAWER: portal to document.body so parent overflow/transform cannot clip the fixed panel
  // (Devin Live FAIL: WO→load reached /dispatch/loads/:id?view=list with no visible drawer).
  return createPortal(
    <>
      <div className="fixed inset-0 z-[200] bg-black/30" onClick={onClose} data-testid="load-detail-drawer-backdrop" />
      <aside
        className="fixed right-0 top-0 z-[210] flex h-full w-full flex-col overflow-hidden bg-white shadow-xl md:w-[600px]"
        data-testid="load-detail-drawer"
        data-load-id={loadId}
        role="dialog"
        aria-modal="true"
      >
        {/* The header is outside the only vertical scroller. A sticky child of the
            scrolling aside still left the live tab strip off-screen/intercepted;
            a fixed flex region makes pointer reachability structural. */}
        <header className="z-20 shrink-0 border-b border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Load{" "}
                <EntityLinkOrTombstone kind="load" id={load?.id ?? loadId} name={load?.load_number} noun="Load" />
              </h2>
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

        <div className="min-h-0 flex-1 overflow-y-auto p-4" data-testid="load-detail-drawer-scroll-body">
          {activeTab === "Overview" ? (
            load ? (
              <div className="space-y-3 text-sm">
                {/* §A — Customer · Invoice · Charges (charges = single total; line-item split is the gated
                    charge line-items block, NOT fabricated here). */}
                <OverviewWizardSection title="Customer · Invoice · Charges" canEdit={canEdit} onEdit={() => setEditWizardOpen(true)}>
                  <FlatFieldGrid
                    columns={2}
                    fields={[
                      {
                        label: "Customer",
                        value: (
                          <EntityLinkOrTombstone
                            kind="customer"
                            id={load.customer_id}
                            name={load.customer_name}
                            noun="Customer"
                            tombstoneTestId="load-detail-customer-tombstone"
                          />
                        ),
                      },
                      {
                        label: "Status",
                        value: (
                          <span className="inline-flex flex-wrap items-center gap-1.5">
                            {STATUS_LABEL[load.status]}
                            {autoStatusSwitchQuery.isError ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-700">
                                Auto-status audit unavailable
                                <button
                                  type="button"
                                  className="underline"
                                  onClick={() => void autoStatusSwitchQuery.refetch()}
                                >
                                  Retry
                                </button>
                              </span>
                            ) : null}
                            {autoStatusSwitchForLoad ? (
                              <AutoStatusSwitchedBadge
                                reason={autoStatusSwitchForLoad.reason}
                                caseId={autoStatusSwitchForLoad.case_id}
                              />
                            ) : null}
                          </span>
                        ),
                      },
                      {
                        label: "Dispatch flag",
                        value: canEdit ? (
                          <div className="space-y-2">
                            {flagColorsQuery.isError ? (
                              <ListErrorState
                                title="Couldn't load dispatch flags"
                                status={(flagColorsQuery.error as { status?: number } | null)?.status ?? 0}
                                message={userFacingApiError(flagColorsQuery.error, "Dispatch flag catalog failed")}
                                onRetry={() => void flagColorsQuery.refetch()}
                              />
                            ) : null}
                            <ReferenceSelect
                              value={load.dispatch_flag_color_id}
                              onChange={(value) => {
                                if (!value) return;
                                void updateMutation.mutateAsync({ id: load.id, operatingCompanyId: load.operating_company_id, body: { dispatch_flag_color_id: value } }).then(() => {
                                  refetchLoad();
                                  void queryClient.invalidateQueries({ queryKey: ["loads"] });
                                });
                              }}
                              options={(flagColorsQuery.data?.flags ?? []).map((flag) => ({ value: flag.id, label: flag.display_name }))}
                              createKind="dispatch_flag_color"
                              operatingCompanyId={load.operating_company_id}
                              addNewLabel="+ Add new dispatch flag"
                              disabled={flagColorsQuery.isLoading || flagColorsQuery.isError}
                              loading={flagColorsQuery.isLoading}
                              onOptionCreated={() => void flagColorsQuery.refetch()}
                            />
                          </div>
                        ) : (load.flag_display_name ?? load.flag_code),
                      },
                      { label: "Customer WO #", value: load.customer_wo_number ?? "—" },
                      { label: "Pickup #", value: load.pickup_number ?? "—" },
                      { label: "Total customer invoice", value: formatMoneyCents(load.rate_total_cents, load.currency_code) },
                      { label: "Created", value: new Date(load.created_at).toLocaleString() },
                      { label: "Miles (practical)", value: load.miles_practical != null ? load.miles_practical.toLocaleString() : "—" },
                      { label: "Miles (shortest)", value: load.miles_shortest != null ? load.miles_shortest.toLocaleString() : "—" },
                      { label: "Deadhead miles", value: load.miles_deadhead != null ? load.miles_deadhead.toLocaleString() : "—" },
                    ]}
                  />
                  <p className="mt-1 text-[10px] text-gray-400">Single customer total. Linehaul / fuel / accessorial breakdown arrives with the charge line-items block.</p>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600" data-testid="load-money-reverse-links">
                    <span>
                      Linked expenses:{" "}
                      {loadExpensesQuery.isLoading
                        ? "…"
                        : loadExpensesQuery.isError
                          ? "unavailable"
                          : (loadExpensesQuery.data?.total ?? 0)}
                    </span>
                    {load.operating_company_id ? (
                      <button
                        type="button"
                        className="text-slate-700 underline"
                        onClick={() =>
                          navigate(
                            `/accounting/expenses?load_id=${encodeURIComponent(load.id)}&operating_company_id=${encodeURIComponent(load.operating_company_id)}`
                          )
                        }
                      >
                        Open expenses
                      </button>
                    ) : null}
                  </div>
                </OverviewWizardSection>

                {/* §B — Equipment · Driver · Trailer. The trailer is resolved from the canonical
                    load_assignment_history.new_trailer_id link. Driver pay rate stays "—"
                    (the load-specific rate isn't persisted on the load — not fabricated). */}
                <OverviewWizardSection title="Equipment · Driver · Trailer" canEdit={canEdit} onEdit={() => setEditWizardOpen(true)}>
                  <FlatFieldGrid
                    columns={2}
                    fields={[
                      { label: "Trip Type", value: load.trip_type ? (TRIP_TYPE_LABEL[load.trip_type] ?? load.trip_type) : "—" },
                      { label: "Trailer type", value: load.trailer_equipment_type ?? "—" },
                      {
                        label: "Truck unit",
                        value: (
                          <EntityLinkOrTombstone kind="unit" id={load.assigned_unit_id} name={load.assigned_unit_number} noun="Unit" />
                        ),
                      },
                      {
                        label: "Trailer unit",
                        value: load.trailer_id ? (
                          <EntityLinkOrTombstone kind="trailer" id={load.trailer_id} name={load.trailer_number} noun="Trailer" />
                        ) : (
                          entityLabel(load.trailer_number, load.trailer_id, "Trailer")
                        ),
                      },
                      {
                        label: "Driver",
                        value: load.assigned_primary_driver_id ? (
                          <EntityLinkOrTombstone kind="driver" id={load.assigned_primary_driver_id} name={load.assigned_primary_driver_name} noun="Driver" />
                        ) : (
                          entityLabel(load.assigned_primary_driver_name, load.assigned_primary_driver_id, "Driver")
                        ),
                      },
                      {
                        label: "Team driver",
                        value: load.assigned_secondary_driver_id ? (
                          <EntityLinkOrTombstone kind="driver" id={load.assigned_secondary_driver_id} name={load.assigned_secondary_driver_name} noun="Driver" />
                        ) : (
                          "Solo"
                        ),
                      },
                      { label: "Driver pay rate / mi", value: "—" },
                    ]}
                  />
                  <p className="mt-1 text-[10px] text-gray-400">Trailer type/unit come from the latest persisted trailer assignment. Driver pay rate is the load-specific rate, not stored on the load yet.</p>
                </OverviewWizardSection>

                <OverviewWizardSection title="Miles" canEdit={canEdit} onEdit={() => setEditWizardOpen(true)}>
                  <FlatFieldGrid
                    columns={2}
                    fields={[
                      {
                        label: "Practical",
                        value: load.miles_practical != null ? load.miles_practical.toLocaleString() : "—",
                      },
                      {
                        label: "Shortest",
                        value: load.miles_shortest != null ? load.miles_shortest.toLocaleString() : "—",
                      },
                      {
                        label: "Loaded",
                        value: load.loaded_miles != null ? load.loaded_miles.toLocaleString() : "—",
                      },
                      {
                        label: "Deadhead",
                        value: load.miles_deadhead != null ? load.miles_deadhead.toLocaleString() : "—",
                      },
                    ]}
                  />
                </OverviewWizardSection>

                {/* §C — Stops · PC*MILER Routing (per-stop, from the live payload). */}
                <OverviewWizardSection title="Stops · PC*MILER Routing" canEdit={canEdit} onEdit={() => setEditWizardOpen(true)}>
                  <div className="space-y-2">
                    {(load.stops ?? []).map((stop) => (
                      <div key={stop.id} className="rounded-sm border border-gray-100 p-2">
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
                    {canEdit && load
                      ? getOfficeTransitionButtons(load.status).map((transition) => (
                          <Button
                            key={transition.target}
                            type="button"
                            variant="primary"
                            size="sm"
                            loading={statusMutation.isPending}
                            data-testid={transition.testId}
                            onClick={async () => {
                              try {
                                await statusMutation.mutateAsync({
                                  id: load.id,
                                  body: { new_status: transition.target },
                                });
                                pushToast(`Load ${load.load_number} — ${transition.label}`, "success");
                                refetchLoad();
                                void queryClient.invalidateQueries({ queryKey: ["loads"] });
                              } catch (err) {
                                pushToast(userFacingApiError(err, `Could not transition load (${transition.label})`), "error");
                              }
                            }}
                          >
                            {transition.label}
                          </Button>
                        ))
                      : null}
                    {canEdit && canRemintDriverBill ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        loading={remintDriverBillMutation.isPending}
                        data-testid="load-remint-driver-bill-button"
                        onClick={async () => {
                          // LAW-EDITABLE-BY-PERMISSION-ALWAYS-TRACEABLE-2026-09-01: every edit is
                          // traceable to why — this mints a real driver payable, so a reason is
                          // required, not optional.
                          const reason = window.prompt("Reason for reminting this driver bill (required, logged):");
                          if (!reason || !reason.trim()) return;
                          try {
                            const res = await remintDriverBillMutation.mutateAsync({ id: load.id, reason: reason.trim() });
                            const outcome = "outcome" in res ? res.outcome.outcome : "error";
                            const messages: Record<string, string> = {
                              minted: "Driver bill minted",
                              already_exists: "Driver bill already exists — nothing to remint",
                              skipped_no_pay_rate: "Still no pay rate/miles for this driver — recorded a durable skip",
                              not_applicable: "No driver assigned to this load",
                            };
                            pushToast(messages[outcome] ?? `Remint outcome: ${outcome}`, outcome === "minted" ? "success" : "info");
                            refetchLoad();
                            void queryClient.invalidateQueries({ queryKey: ["loads"] });
                          } catch (err) {
                            pushToast(userFacingApiError(err, "Could not remint driver bill"), "error");
                          }
                        }}
                      >
                        Remint driver bill
                      </Button>
                    ) : null}
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
                        openPrintableDocument(
                          `/api/v1/dispatch/loads/${encodeURIComponent(loadId)}/dispatch-sheet.html?operating_company_id=${encodeURIComponent(
                            load.operating_company_id
                          )}`
                        )
                      }
                    >
                      Print dispatch sheet
                    </Button>
                    {canEdit ? (
                      <Button type="button" variant="secondary" size="sm" onClick={() => setAbandonmentOpen(true)}>
                        Report abandonment
                      </Button>
                    ) : null}
                  </div>
                ) : null}

                {(
                  <div className="space-y-2 rounded-sm border border-gray-200 p-3">
                    <div>
                      <div className="text-xs text-gray-600">Notes</div>
                      <div className="mt-1 text-sm text-gray-800">{packageState.visibleNotes || "-"}</div>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t border-gray-100 pt-2">
                      <div>
                        <div className="text-xs font-semibold text-gray-700">Invoice</div>
                        <div className="text-[11px] text-gray-500">
                          {invoiceLookupFailed
                            ? "Could not load invoices for this load. Retry before creating."
                            : canInvoiceFromLoad
                              ? "Delivered loads can create/view invoice."
                              : "Invoice creation is available once load is delivered."}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={async () => {
                          if (!load) return;
                          if (invoiceLookupFailed) {
                            pushToast("Could not confirm existing invoices for this load. Retry the lookup before creating.", "error");
                            void loadInvoicesQuery.refetch();
                            return;
                          }
                          if (invoiceLookupUnresolved) {
                            pushToast("Invoice lookup is still running. Wait before creating.", "error");
                            return;
                          }
                          // LV-INVOICE-RATE-SNAPSHOT-NEVER-RESYNCS — the invoice snapshots the load's rate
                          // ONCE, at build time (accounting/from-load.ts:186 `lineTotal =
                          // load.rate_total_cents`), and NOTHING in the backend ever re-syncs it:
                          // update-load.service.ts computes a `rateChanged` flag and spends it on an audit
                          // field only. So invoicing a load whose rate is still 0 mints a $0 invoice that no
                          // code path can correct — exactly L-0087 ($3,210 load / $0 invoice). This gate is
                          // the CREATE side only: if an invoice already exists we still navigate to it, so
                          // "View" keeps working and an already-broken invoice stays reachable.
                          const existingInvoiceId = loadInvoicesQuery.data?.invoices?.[0]?.id;
                          if (existingInvoiceId) {
                            navigate(`/accounting/invoices/${existingInvoiceId}`);
                            return;
                          }
                          if (!Number(load.rate_total_cents ?? 0)) {
                            pushToast(
                              "This load has no rate yet. Invoicing it now would create a $0 invoice that cannot be corrected later — set the load rate first.",
                              "error",
                            );
                            return;
                          }
                          const result = await createInvoiceMutation.mutateAsync({
                            operatingCompanyId: load.operating_company_id,
                            loadId: load.id,
                          });
                          const invoiceId = result.invoice?.id;
                          if (!invoiceId) {
                            pushToast("Invoice create did not return an id. Nothing to open.", "error");
                            return;
                          }
                          navigate(`/accounting/invoices/${invoiceId}`);
                        }}
                        loading={createInvoiceMutation.isPending || invoiceLookupUnresolved}
                        disabled={!canInvoiceFromLoad || invoiceLookupFailed || invoiceLookupUnresolved}
                      >
                        Create / View Invoice
                      </Button>
                    </div>
                  </div>
                )}

                {load.operating_company_id ? (
                  <InsuranceClaimsReverseSection
                    operatingCompanyId={load.operating_company_id}
                    filter={{ load_id: load.id }}
                    contextLabel="this load"
                    data-testid="load-detail-insurance-claims"
                  />
                ) : null}
                {load.operating_company_id ? (
                  <LoadSafetyReverseSection
                    operatingCompanyId={load.operating_company_id}
                    loadId={load.id}
                    data-testid="load-detail-safety-records"
                  />
                ) : null}
                {load.operating_company_id ? (
                  <LoadInTransitIssuesReverseSection
                    operatingCompanyId={load.operating_company_id}
                    loadId={load.id}
                    data-testid="load-detail-intransit-issues"
                  />
                ) : null}
                {load.operating_company_id ? (
                  <LoadDriverReportsReverseSection operatingCompanyId={load.operating_company_id} loadId={load.id} />
                ) : null}
                {load.operating_company_id ? (
                  <LoadWorkOrdersReverseSection
                    operatingCompanyId={load.operating_company_id}
                    loadId={load.id}
                    data-testid="load-detail-work-orders"
                  />
                ) : null}
                {load.operating_company_id && load.customer_id ? (
                  <LoadQualityEventsReverseSection
                    operatingCompanyId={load.operating_company_id}
                    customerId={load.customer_id}
                    loadId={load.id}
                    data-testid="load-detail-quality-events"
                  />
                ) : null}
                {load.operating_company_id ? (
                  <LoadDetentionReverseSection
                    operatingCompanyId={load.operating_company_id}
                    loadId={load.id}
                    data-testid="load-detail-detention"
                  />
                ) : null}
                {load.operating_company_id ? (
                  <FuelTransactionsReverseSection
                    operatingCompanyId={load.operating_company_id}
                    filter={{ load_id: load.id }}
                    contextLabel="this load"
                    data-testid="load-detail-fuel-transactions"
                  />
                ) : null}
                {load.operating_company_id ? (
                  <ExpensesReverseSection
                    operatingCompanyId={load.operating_company_id}
                    filter={{ load_id: load.id }}
                    contextLabel="this load"
                    data-testid="load-detail-expenses-reverse"
                  />
                ) : null}
                {load.operating_company_id ? (
                  <BillsReverseSection
                    operatingCompanyId={load.operating_company_id}
                    filter={{ load_id: load.id }}
                    contextLabel="this load"
                    data-testid="load-detail-bills-reverse"
                  />
                ) : null}
                {load.operating_company_id ? (
                  <InvoicesReverseSection
                    operatingCompanyId={load.operating_company_id}
                    filter={{ source_load_id: load.id }}
                    contextLabel="this load"
                    data-testid="load-detail-invoices-reverse"
                  />
                ) : null}
              </div>
            ) : loadQueryIsError ? (
              // BUG 1: never hang silently — surface the error + a retry instead of an endless "Loading…".
              <div className="space-y-2 text-sm">
                <div className="text-red-700">Couldn't load this load’s overview.</div>
                <div className="text-xs text-gray-500">{String(loadQueryError?.message ?? "Request failed")}</div>
                <Button size="sm" variant="secondary" onClick={() => refetchLoad()}>
                  Retry
                </Button>
              </div>
            ) : loadQueryIsLoading ? (
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
                    <div key={stop.id} className="rounded-sm border border-gray-200 p-3 text-sm">
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
                <div className="rounded-sm border border-slate-200 bg-slate-100 p-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs text-slate-700">
                      Factoring package (rate confirmation + POD/BOL + invoice)
                      <div className="mt-1 text-[11px] text-slate-700">
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
                          // DSP-MONEY-F7276 — this call had no .catch(): a failed metadata PATCH
                          // (network/RLS/validation) became an unhandled promise rejection with no
                          // failure signal shown to the operator at all.
                          void persistPackageMeta({
                            ...packageState.meta,
                            emailed_at: new Date().toISOString(),
                          })
                            .then(() => pushToast("Marked as emailed to factoring company", "success"))
                            .catch((error) => pushToast(userFacingApiError(error, "Could not mark package as emailed"), "error"))
                        }
                        disabled={!packageState.meta.generated_at}
                      >
                        Email package
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          // DSP-MONEY-F7276 — same unhandled-rejection gap as the Email button above.
                          void persistPackageMeta({
                            ...packageState.meta,
                            uploaded_at: new Date().toISOString(),
                          })
                            .then(() => pushToast("Marked as uploaded to factoring portal", "success"))
                            .catch((error) => pushToast(userFacingApiError(error, "Could not mark package as uploaded"), "error"))
                        }
                        disabled={!packageState.meta.generated_at}
                      >
                        Mark uploaded
                      </Button>
                    </div>
                  </div>
                  {!isPackageEligible ? <div className="mt-1 text-[11px] text-slate-700">Package auto-generates once load is delivered/closed.</div> : null}
                </div>
                <div className="rounded-sm border border-slate-300 bg-slate-100 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-slate-700">Driver Instructions PDF + Portal/SMS/WhatsApp distribution</div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!load.driver_instructions_file_id}
                        onClick={() => void openDriverInstructionsFile()}
                      >
                        Preview
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!load.driver_instructions_file_id}
                        onClick={() => void openDriverInstructionsFile()}
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
                {/* CLS-DISP-WIRE-09 — BOL generate on the canonical load drawer (EntityLink path),
                    not only /dispatch/pod-review. Same LoadBolPanel as Pod Review. */}
                <LoadBolPanel loadId={load.id} companyId={load.operating_company_id} />
                <DocumentsTab entityType="load" entityId={load.id} entityName={load.load_number} operatingCompanyId={load.operating_company_id} />
              </div>
            ) : (
              <div className="text-sm text-gray-500">Loading...</div>
            )
          ) : null}

          {activeTab === "Audit" && load ? (
            <EntityAuditHistoryTab operatingCompanyId={load.operating_company_id} entityType="load" entityId={load.id} />
          ) : null}
          {activeTab === "Assignment History" ? (
            <div className="space-y-3">
              {assignmentHistoryQuery.isLoading ? <div className="text-sm text-gray-500">Loading assignment history…</div> : null}
              {assignmentHistoryQuery.isError ? (
                <ListErrorState
                  title="Couldn't load assignment history"
                  status={(assignmentHistoryQuery.error as { status?: number } | null)?.status ?? 0}
                  message={userFacingApiError(assignmentHistoryQuery.error, "Assignment history failed")}
                  onRetry={() => void assignmentHistoryQuery.refetch()}
                />
              ) : null}
              {(assignmentHistoryQuery.isError ? [] : assignmentHistoryQuery.data?.rows ?? []).map((row) => {
                const r = row as Record<string, unknown>;
                const id = String(r.id ?? "");
                const at = r.assigned_at ? new Date(String(r.assigned_at)).toLocaleString() : "";
                const method = String(r.assignment_method ?? "");
                const reason = r.reason_code != null ? String(r.reason_code) : "";
                const notes = r.notes != null ? String(r.notes) : "";
                // CLS-UUID-LABEL + Exact Leaves load.drawer.assignment_history:reverse_link —
                // names resolve entity-scoped from getAssignmentHistory; drill with EntityLinkOrTombstone
                // (sibling AssignmentHistoryPage). Id null → Unassigned; id+no name → honest tombstone.
                const prevId = r.previous_driver_id != null ? String(r.previous_driver_id) : null;
                const nextId = r.new_driver_id != null ? String(r.new_driver_id) : null;
                const prevUnitId = r.previous_unit_id != null ? String(r.previous_unit_id) : null;
                const nextUnitId = r.new_unit_id != null ? String(r.new_unit_id) : null;
                const prevTrailerId = r.previous_trailer_id != null ? String(r.previous_trailer_id) : null;
                const nextTrailerId = r.new_trailer_id != null ? String(r.new_trailer_id) : null;
                return (
                  <div key={id || at + method} className="relative border-l-2 border-slate-300 pl-3">
                    <div className="absolute left-[-5px] top-1 h-2 w-2 rounded-full bg-slate-1000" />
                    <div className="text-xs text-gray-500">{at}</div>
                    <div className="text-sm font-semibold text-gray-800">{method.replace(/_/g, " ")}</div>
                    <div className="text-xs text-gray-600" data-testid="load-drawer-assignment-history-driver-links">
                      Driver{" "}
                      {prevId ? (
                        <EntityLinkOrTombstone
                          kind="driver"
                          id={prevId}
                          name={r.previous_driver_name}
                          noun="Driver"
                          data-testid="load-drawer-assignment-prev-driver-link"
                        />
                      ) : (
                        <span className="text-slate-400">Unassigned</span>
                      )}{" "}
                      →{" "}
                      {nextId ? (
                        <EntityLinkOrTombstone
                          kind="driver"
                          id={nextId}
                          name={r.new_driver_name}
                          noun="Driver"
                          data-testid="load-drawer-assignment-new-driver-link"
                        />
                      ) : (
                        <span className="text-slate-400">Unassigned</span>
                      )}
                    </div>
                    {prevUnitId || nextUnitId ? (
                      <div className="text-xs text-gray-600" data-testid="load-drawer-assignment-history-unit-links">
                        Unit{" "}
                        {prevUnitId ? (
                          <EntityLinkOrTombstone
                            kind="unit"
                            id={prevUnitId}
                            name={r.previous_unit_number}
                            noun="Unit"
                            data-testid="load-drawer-assignment-prev-unit-link"
                          />
                        ) : (
                          <span className="text-slate-400">Unassigned</span>
                        )}{" "}
                        →{" "}
                        {nextUnitId ? (
                          <EntityLinkOrTombstone
                            kind="unit"
                            id={nextUnitId}
                            name={r.new_unit_number}
                            noun="Unit"
                            data-testid="load-drawer-assignment-new-unit-link"
                          />
                        ) : (
                          <span className="text-slate-400">Unassigned</span>
                        )}
                      </div>
                    ) : null}
                    {prevTrailerId || nextTrailerId ? (
                      <div className="text-xs text-gray-600" data-testid="load-drawer-assignment-history-trailer-links">
                        Trailer{" "}
                        {prevTrailerId ? (
                          <EntityLinkOrTombstone
                            kind="trailer"
                            id={prevTrailerId}
                            name={r.previous_trailer_number}
                            noun="Trailer"
                            data-testid="load-drawer-assignment-prev-trailer-link"
                          />
                        ) : (
                          <span className="text-slate-400">Unassigned</span>
                        )}{" "}
                        →{" "}
                        {nextTrailerId ? (
                          <EntityLinkOrTombstone
                            kind="trailer"
                            id={nextTrailerId}
                            name={r.new_trailer_number}
                            noun="Trailer"
                            data-testid="load-drawer-assignment-new-trailer-link"
                          />
                        ) : (
                          <span className="text-slate-400">Unassigned</span>
                        )}
                      </div>
                    ) : null}
                    {reason ? <div className="mt-1 text-xs text-gray-700">Reason: {reason}</div> : null}
                    {notes ? <div className="mt-1 text-xs text-gray-600">Notes: {notes}</div> : null}
                  </div>
                );
              })}
              {!assignmentHistoryQuery.isLoading && !assignmentHistoryQuery.isError && (assignmentHistoryQuery.data?.rows ?? []).length === 0 ? (
                <div className="text-sm text-gray-500">No assignment events yet.</div>
              ) : null}
            </div>
          ) : null}

          {activeTab === "Pre-Settlement" ? (
            load?.assigned_primary_driver_id ? (
              <PreSettlementPanel
                driverId={load.assigned_primary_driver_id}
                operatingCompanyId={load.operating_company_id}
                onSettled={() => refetchLoad()}
              />
            ) : (
              <div className="text-sm text-gray-500">No driver assigned to this load.</div>
            )
          ) : null}

          {/* Block 7 — Factoring packet tab (wired to the real per-load packet/submit-to-FARO UI;
              the dead duplicate drawer-tabs/FactoringTab.tsx stub was deleted, orphan-triage F1). */}
          {activeTab === "Factoring" && load ? (
            <FactoringTab
              loadId={load.id}
              operatingCompanyId={load.operating_company_id}
              canEdit={canEdit}
              onPacketUpdated={() => refetchLoad()}
            />
          ) : null}

          {/* Block 8 — Customs/border compliance tab (stub; hidden for domestic loads) */}
          {activeTab === "Customs" && load && showCustomsTab ? (
            <CustomsTab loadId={load.id} operatingCompanyId={load.operating_company_id} canEdit={canEdit} />
          ) : null}

          {/* Block 8.5 — Cargo sensor timeline tab */}
          {activeTab === "Cargo Sensors" && load ? (
            <CargoSensorTimeline loadId={load.id} operatingCompanyId={load.operating_company_id} />
          ) : null}

          {/* Block 9 — Settlement profitability card (DISP-PROFIT: wired to the real per-load
              profitability breakdown; the dead duplicate drawer-tabs stub was deleted, orphan-triage F1). */}
          {activeTab === "Settlement" && load ? (
            <div className="mt-3">
              <SettlementProfitabilityCard loadId={load.id} operatingCompanyId={load.operating_company_id} currencyCode={load.currency_code} />
            </div>
          ) : null}

          {/* Block 13 — Fines & deductions confirm/defer card (wired to the real Lane A Block 13 card;
              the dead duplicate drawer-tabs stub was deleted, orphan-triage F1). */}
          {activeTab === "Settlement" && load ? (
            <div className="mt-3">
              <FinesDeductionsCard loadId={load.id} operatingCompanyId={load.operating_company_id} canEdit={canEdit} />
            </div>
          ) : null}
        </div>

        <footer className="shrink-0 flex items-center justify-between border-t border-gray-200 bg-white p-4">
          {canCancelPersistedLoad ? (
            <Button type="button" variant="danger" size="sm" onClick={() => setCancelOpen(true)}>
              Cancel Load
            </Button>
          ) : (
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
          )}
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
            refetchLoad();
          }}
        />
      ) : null}

      {load ? (
        <LoadReassignModal
          open={reassignOpen}
          onClose={() => {
            setReassignOpen(false);
            refetchLoad();
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
          loadId={load.id}
          loadNumber={load.load_number}
          customerId={load.customer_id}
          customerName={load.customer_name}
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
          loadNumber={load.load_number}
          operatingCompanyId={load.operating_company_id}
          defaultDriverId={load.assigned_primary_driver_id ?? load.assigned_secondary_driver_id}
          defaultDriverLabel={load.assigned_primary_driver_name ?? load.assigned_secondary_driver_name}
          onClose={() => setAbandonmentOpen(false)}
          onRecorded={() => refetchLoad()}
        />
      ) : null}

      {load ? (
        <CancelLoadModal
          open={cancelOpen}
          operatingCompanyId={load.operating_company_id}
          loadId={load.id}
          loadNumber={load.load_number}
          onClose={() => setCancelOpen(false)}
          onSubmit={async (payload) => {
            const result = await cancelDispatchLoad(load.id, {
              operating_company_id: load.operating_company_id,
              ...payload,
            });
            const cancelStatus = String((result as { status?: string }).status ?? "");
            pushToast(
              cancelStatus === "pending_owner_approval"
                ? "Cancellation submitted for Owner approval"
                : "Load cancelled",
              "success"
            );
            setCancelOpen(false);
            refetchLoad();
            void auditQuery.refetch();
          }}
        />
      ) : null}
    </>,
    document.body
  );
}

export {
  loadCanMarkCompletedDocsReceived,
  loadCanMarkDeliveredPendingDocs,
  loadCanMarkInTransit,
} from "@ih35/shared-types";
