import { entityLabel } from "../lib/entity-label";
import { formatPhoneAsTyped } from "../lib/formatPhoneAsTyped";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DatePicker } from "../components/forms/DatePicker";
import { FORM_INPUT_CLASS, FORM_TEXTAREA_CLASS } from "../components/forms/inputClass";
import { companyToday } from "../lib/businessDate";
import { History, Pencil } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { useCompanyContext } from "../contexts/CompanyContext";
import { AuditHistoryTab } from "../components/drivers/AuditHistoryTab";
import { ConfirmModal } from "../components/shared/ConfirmModal";
import { LoadHistoryTab } from "../components/drivers/LoadHistoryTab";
import { EarningsTab } from "../components/drivers/EarningsTab";
import { useAuth } from "../auth/useAuth";
import { listEquipmentTypes, listMexicoStates, listUsStates } from "../api/catalogs";
import { listMyCompanies } from "../api/org";
import {
  createSafetyEvent,
  changeDriverQualificationRate,
  listSafetyEvents,
  listTerminationReasons,
  createDriverQualification,
  deactivateDriver,
  deactivateDriverQualification,
  disableDriverPhoneLogin,
  enableDriverPhoneLogin,
  getDriver,
  resendDriverInvite,
  getDriverQualificationRateHistory,
  listDriverCompanyAuthorizations,
  listDriverReferrals,
  listDriverQualifications,
  listQboVendorLinkageHistory,
  reactivateQualification,
  voidSafetyEvent,
  upsertDriverCompanyAuthorization,
  updateDriver,
  type DriverQualificationRateHistoryItem,
} from "../api/mdata";
import { listClassesForJe } from "../api/accounting";
import { legalMattersApi } from "../api/legal-matters";
import { InsuranceClaimsReverseSection } from "../components/insurance/InsuranceClaimsReverseSection";
import { DriverSafetyReverseSection } from "../components/safety/DriverSafetyReverseSection";
import { DriverWorkOrdersReverseSection } from "../components/maintenance/DriverWorkOrdersReverseSection";
import { EntityPicker } from "../components/parity/EntityPicker";
import { DriverReportsReverseSection } from "../components/maintenance/DriverReportsReverseSection";
import { DriverTempCoverReverseSection } from "../components/safety/DriverTempCoverReverseSection";
import { DriverEquipmentTransfersReverseSection } from "../components/dispatch/DriverEquipmentTransfersReverseSection";
import { DriverHosViolationsReverseSection } from "../components/safety/DriverHosViolationsReverseSection";
import { SafetyAlertsReverseSection } from "../components/safety/SafetyAlertsReverseSection";
import { BackgroundChecksSection } from "../components/safety/BackgroundChecksSection";
import { MedicalCardsHistorySection } from "../components/safety/MedicalCardsHistorySection";
import { Button } from "../components/Button";
import { ListErrorState } from "../components/ListErrorState";
import { EntityLink } from "../components/shared/EntityLink";
import { EntityLinkOrTombstone } from "../components/shared/EntityLinkOrTombstone";
import { ParityTable, type ParityColumn } from "../components/parity/ParityTable";
import { ReferenceSelect } from "../components/parity/ReferenceSelect";
import { Combobox, type ComboboxOption } from "../components/Combobox";
import { DocumentsTab } from "../components/documents/DocumentsTab";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { PageHeader } from "../components/forms/shared/PageHeader";
import { FlatFieldGrid } from "../components/layout/FlatFieldGrid";
import { Modal } from "../components/Modal";
import { SecondaryNavTabs } from "../components/shared/SecondaryNavTabs";
import { StatusBadge } from "../components/StatusBadge";
import { MissingRequiredChip } from "../components/compliance/MissingRequiredChip";
import { useToast } from "../components/Toast";
import { QboCombobox } from "../components/forms/QboCombobox";
import { VendorLinkageModal } from "../components/qbo/VendorLinkageModal";
import { CertExpiryBadge } from "../components/safety/CertExpiryBadge";
import { EldEditHistoryTimeline } from "../components/safety/EldEditHistoryTimeline";
import { UnitDriverHistoryStrip } from "./units/UnitDriverHistoryStrip";
import { OperationsDepthNav, OPERATIONS_DEPTH_SUBVIEWS } from "../components/drivers/OperationsDepthNav";
import { DebtHistoryView } from "./drivers/operations/DebtHistoryView";
import { PayrollHistoryView } from "./drivers/operations/PayrollHistoryView";
import { EscrowHistoryView } from "./drivers/operations/EscrowHistoryView";
import { PermitHistoryView } from "./drivers/operations/PermitHistoryView";
import { AccidentHistoryView } from "./drivers/operations/AccidentHistoryView";
import { SettlementHistoryView } from "./drivers/operations/SettlementHistoryView";
import { FuelHistoryView } from "./drivers/operations/FuelHistoryView";
import { MaintenanceAssignmentsView } from "./drivers/operations/MaintenanceAssignmentsView";
import { SafetyEventsView } from "./drivers/operations/SafetyEventsView";
import { CommunicationsLogView } from "./drivers/operations/CommunicationsLogView";
import { PwaEngagementView } from "./drivers/operations/PwaEngagementView";
import { DocumentsVaultView } from "./drivers/operations/DocumentsVaultView";
import { useListState } from "../components/list-state";
import { createOnboardingSession } from "../api/onboarding";

const tabs = [
  "Profile",
  "QBO Mapping",
  "Operations",
  "Earnings & Debt",
  "Equipment Assignments",
  "Safety File",
  "Documents",
  "Audit History",
  "ELD Edits",
  "Legal Matters",
  "Load History",
] as const;
type DriverTab = (typeof tabs)[number];

const OPERATIONS_VIEW_BY_SLUG = {
  "debt-history": DebtHistoryView,
  "payroll-history": PayrollHistoryView,
  "escrow-history": EscrowHistoryView,
  "permit-history": PermitHistoryView,
  "accident-history": AccidentHistoryView,
  "settlement-history": SettlementHistoryView,
  "fuel-history": FuelHistoryView,
  "maintenance-assignments": MaintenanceAssignmentsView,
  "safety-events": SafetyEventsView,
  "communications-log": CommunicationsLogView,
  "pwa-engagement": PwaEngagementView,
  "documents-vault": DocumentsVaultView,
};

const reasonOptions = [
  { value: "raise", label: "Raise" },
  { value: "demotion", label: "Demotion" },
  { value: "contract_renegotiation", label: "Contract renegotiation" },
  { value: "annual_adjustment", label: "Annual adjustment" },
  { value: "promotion", label: "Promotion" },
  { value: "correction", label: "Correction" },
  { value: "other", label: "Other" },
] as const;
const CDL_CLASS_OPTIONS: ComboboxOption[] = ["A", "B", "C"].map((value) => ({ value, label: value }));
const DRIVER_STATUS_OPTIONS: ComboboxOption[] = ["Probation", "Active", "Inactive", "Terminated", "OnLeave"].map((value) => ({
  value,
  label: value,
}));
const PAY_BASIS_OPTIONS: ComboboxOption[] = [
  { value: "short_miles", label: "Short Miles" },
  { value: "practical_miles", label: "Practical Miles" },
];
const VISA_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "", label: "None" },
  { value: "B1", label: "B1" },
  { value: "B2", label: "B2" },
  { value: "Other", label: "Other" },
];
const SAFETY_EVENT_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "termination", label: "Termination" },
  { value: "incident", label: "Incident" },
  { value: "complaint", label: "Complaint" },
  { value: "commendation", label: "Commendation" },
  { value: "dispute", label: "Dispute" },
];
const SAFETY_SEVERITY_OPTIONS: ComboboxOption[] = [
  { value: "info", label: "Info" },
  { value: "warning", label: "Warning" },
  { value: "severe", label: "Severe" },
];
const RATE_CHANGE_REASON_OPTIONS: ComboboxOption[] = reasonOptions.map((reason) => ({ value: reason.value, label: reason.label }));

function formatDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 10);
}

function formatDateRange(from: string, to: string | null) {
  return `${formatDate(from)} - ${to ? formatDate(to) : "current"}`;
}

function formatReasonLabel(reason: string) {
  if (reason === "initial_hire") return "Initial hire agreement";
  return reason.replaceAll("_", " ");
}

export function DriverDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { selectedCompanyId, isLoading: companyLoading } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [searchParams] = useSearchParams();
  const { pushToast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const onboardingLaunchMutation = useMutation({
    mutationFn: () => createOnboardingSession({ operating_company_id: companyId, driver_id: id }),
    onSuccess: ({ session }) => navigate(`/drivers/onboarding/${session.id}`),
    onError: (error: Error) => pushToast(error.message || "Could not start driver onboarding.", "error"),
  });

  const [editMode, setEditMode] = useState(false);
  const [activeTab, setActiveTab] = useState<DriverTab>("Profile");
  const [operationsSubView, setOperationsSubView] = useState<string>(
    OPERATIONS_DEPTH_SUBVIEWS[0]?.slug ?? "debt-history"
  );
  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "settlements" || t === "earnings") {
      setActiveTab("Earnings & Debt");
    }
    // LAW OF THE LAND §9 (2026-07-22): ?tab=operations&op=<slug> deep-links straight into an
    // Operations sub-view (e.g. escrow-history) — same pattern as the settlements/earnings alias above.
    if (t === "operations") {
      setActiveTab("Operations");
      const op = searchParams.get("op");
      if (op && op in OPERATIONS_VIEW_BY_SLUG) setOperationsSubView(op);
    }
  }, [searchParams]);
  useEffect(() => {
    // Legacy /drivers/:id still forwards into the profile wizard. Retract lives on
    // DriverProfilePage.closeAssignTruck (delete assign_truck) — do not strip here or the wizard never opens.
    if (searchParams.get("assign_truck") === "1" && id) {
      navigate(`/drivers/${id}/profile?assign_truck=1`, { replace: true });
    }
  }, [searchParams, id, navigate]);
  const [enableModalOpen, setEnableModalOpen] = useState(false);
  const [deactivateConfirmOpen, setDeactivateConfirmOpen] = useState(false);
  const [addQualificationOpen, setAddQualificationOpen] = useState(false);
  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [reactivateModalOpen, setReactivateModalOpen] = useState(false);
  const [showInactiveQualifications, setShowInactiveQualifications] = useState(false);
  const [reactivateTargetQualification, setReactivateTargetQualification] = useState<{ id: string; name: string } | null>(null);
  const [selectedQualificationId, setSelectedQualificationId] = useState("");
  const [selectedLineItemId, setSelectedLineItemId] = useState("");
  const [selectedEquipmentName, setSelectedEquipmentName] = useState("");
  const [selectedLineItemName, setSelectedLineItemName] = useState("");
  const [showVoidedSafetyEvents, setShowVoidedSafetyEvents] = useState(false);
  const [addSafetyEventOpen, setAddSafetyEventOpen] = useState(false);
  const [expandedSafetyEventId, setExpandedSafetyEventId] = useState<string | null>(null);
  const [voidTargetEventId, setVoidTargetEventId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [safetyForm, setSafetyForm] = useState({
    event_type: "incident" as "termination" | "incident" | "complaint" | "commendation" | "dispute",
    event_date: companyToday(),
    severity: "warning" as "info" | "warning" | "severe",
    summary: "",
    details: "",
    termination_reason_id: "",
  });
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState<Record<string, string>>({});
  const [qboModalOpen, setQboModalOpen] = useState(false);
  const [newQualificationForm, setNewQualificationForm] = useState<Record<string, string>>({
    equipment_type_id: "",
    qualified_at: companyToday(),
    notes: "",
  });
  const [rateChangeForm, setRateChangeForm] = useState<Record<string, string>>({
    amount: "",
    // DRV-MONEY-F6959 — companyToday(), not new Date().toISOString() (UTC): a qualification-rate
    // change filed in the evening Central can otherwise become effective "tomorrow" by UTC's clock,
    // shifting when settlement economics actually start using the new rate.
    effective_from: companyToday(),
    change_reason: "raise",
    change_notes: "",
  });
  const [authorizationNotesByCompany, setAuthorizationNotesByCompany] = useState<Record<string, string>>({});
  const [qboVendorPickId, setQboVendorPickId] = useState<string | null>(null);
  const [qboVendorPickLabel, setQboVendorPickLabel] = useState("");
  const [qboClassTmsId, setQboClassTmsId] = useState("");
  // Hazmat "H" CDL endorsement (mdata.drivers.endorsement_h, migration 0301) — separate boolean state
  // since `form`/`hydratedForm` are string-keyed text-field state; reset whenever a different driver loads.
  const [endorsementH, setEndorsementH] = useState<boolean | null>(null);

  // Scope the driver lookup to the SELECTED company (+ its authorizations),
  // mirroring the DQF list and DriverProfilePage (#1882). Without this, opening
  // a driver under a non-default company 404s as "Driver not found."
  // LV-COMPLIANCE-FLEET-HOS-DRIVER-DETAIL-INFINITE-LOADING: pass RQ AbortSignal so a
  // hung aggregate cannot leave this page on "Loading driver..." forever.
  const driverQuery = useQuery({
    queryKey: ["driver", id, companyId],
    queryFn: ({ signal }) => getDriver(id, companyId, signal),
    enabled: Boolean(id && companyId),
    retry: 1,
  });

  const qualificationsQuery = useQuery({
    queryKey: ["driver-qualifications", id, companyId, showInactiveQualifications],
    queryFn: () => listDriverQualifications(id, companyId, showInactiveQualifications).then((result) => result.qualifications),
    enabled: Boolean(id && companyId),
  });

  const companiesQuery = useQuery({
    queryKey: ["my-companies"],
    queryFn: () => listMyCompanies().then((result) => result.companies),
  });

  const companyAuthQuery = useQuery({
    queryKey: ["driver-company-authorizations", id, companyId],
    queryFn: () => listDriverCompanyAuthorizations(id, companyId).then((result) => result.authorizations),
    enabled: Boolean(id && companyId),
  });

  const equipmentTypesQuery = useQuery({
    queryKey: ["equipment-types-for-driver-detail", companyId],
    queryFn: () => listEquipmentTypes(companyId, false).then((result) => result.equipment_types),
    enabled: Boolean(companyId),
  });

  const usStatesQuery = useQuery({
    queryKey: ["catalogs", "us-states"],
    queryFn: () => listUsStates().then((result) => result.states),
  });

  const mexicoStatesQuery = useQuery({
    queryKey: ["catalogs", "mexico-states"],
    queryFn: () => listMexicoStates().then((result) => result.states),
  });

  const historyQuery = useQuery({
    queryKey: ["driver-rate-history", id, companyId, selectedQualificationId, selectedLineItemId],
    queryFn: () => getDriverQualificationRateHistory(id, selectedQualificationId, companyId),
    enabled: historyModalOpen && Boolean(id) && Boolean(companyId) && Boolean(selectedQualificationId),
  });

  const driver = driverQuery.data;

  const classesJeQuery = useQuery({
    queryKey: ["list-classes-je"],
    queryFn: listClassesForJe,
    enabled: activeTab === "Profile" && Boolean(driver?.operating_company_id),
  });

  useEffect(() => {
    if (!driver) return;
    setQboVendorPickId(driver.qbo_vendor_id);
    setQboVendorPickLabel("");
    setQboClassTmsId(driver.qbo_class_id ?? "");
  }, [driver?.id, driver?.qbo_vendor_id, driver?.qbo_class_id]);

  useEffect(() => {
    if (!driver) return;
    setEndorsementH(driver.endorsement_h ?? false);
  }, [driver?.id, driver?.endorsement_h]);

  const saveDriverQboMutation = useMutation({
    mutationFn: () =>
      updateDriver(id, {
        qbo_vendor_id: qboVendorPickId || null,
        qbo_class_id: qboClassTmsId || null,
      }),
    onSuccess: (updated) => {
      // LV-DRIVER-EDIT-SAVE-DISPLAY-STALE: the read query key is ["driver", id, companyId] (L252),
      // but this wrote to the 2-part key ["driver", id] — setQueryData does an EXACT key match, so
      // that write landed in a phantom cache entry nothing reads. The save genuinely persisted
      // server-side; the screen just never refreshed. Write to the real key.
      queryClient.setQueryData(["driver", id, companyId], updated);
      pushToast("QBO fields updated", "success");
    },
    onError: () => pushToast("Failed to update QBO fields", "error"),
  });

  const canManageRates = user?.role === "Owner" || user?.role === "Administrator" || user?.role === "Manager";
  const canViewSafetyFile =
    user?.role === "Owner" || user?.role === "Administrator" || user?.role === "Manager" || user?.role === "Safety";
  const canViewDocuments =
    user?.role === "Owner" ||
    user?.role === "Administrator" ||
    user?.role === "Manager" ||
    user?.role === "Dispatcher" ||
    user?.role === "Safety" ||
    (user?.role === "Driver" && user.uuid === driver?.identity_user_id);
  const isOwner = user?.role === "Owner";
  const canViewLegalMatters = user?.role === "Owner" || user?.role === "Administrator";
  const canResendInvite = user?.role === "Owner" || user?.role === "Administrator";
  const canManageCompanyAuth =
    user?.role === "Owner" || user?.role === "Administrator" || user?.role === "Manager" || user?.role === "Safety";

  const safetyEventsQuery = useQuery({
    queryKey: ["driver-safety-events", id, companyId, showVoidedSafetyEvents],
    queryFn: () => listSafetyEvents(id, companyId, showVoidedSafetyEvents).then((result) => result.events),
    enabled: Boolean(id && companyId) && canViewSafetyFile && activeTab === "Safety File",
  });
  const terminationReasonsQuery = useQuery({
    queryKey: ["driver-termination-reasons", companyId],
    queryFn: () => listTerminationReasons(companyId, false).then((result) => result.reasons),
    enabled: canViewSafetyFile && isOwner && activeTab === "Safety File",
  });
  const qboLinkageHistoryQuery = useQuery({
    queryKey: ["qbo-linkage-history", driver?.operating_company_id, id],
    queryFn: () => listQboVendorLinkageHistory(String(driver?.operating_company_id ?? ""), "driver", id),
    enabled: activeTab === "QBO Mapping" && Boolean(driver?.operating_company_id) && Boolean(id),
  });

  const legalMattersForDriverQuery = useQuery({
    queryKey: ["legal-matters", "driver", driver?.operating_company_id, id],
    queryFn: () => legalMattersApi.list(String(driver?.operating_company_id ?? ""), { related_driver_id: id }),
    enabled: activeTab === "Legal Matters" && Boolean(driver?.operating_company_id) && Boolean(id),
  });
  const referralsQuery = useQuery({
    queryKey: ["driver-referrals", driver?.operating_company_id, id],
    queryFn: () => listDriverReferrals(id, String(driver?.operating_company_id ?? "")),
    enabled: Boolean(driver?.operating_company_id) && Boolean(id),
  });

  // FAIL-D5: never replace the whole hydrated form with a partial `form` patch.
  // First DatePicker/input onChange used to set form={cdl_expires_at:…} only; the old
  // `Object.keys(form).length > 0 ? form : defaults` path then blanked name/phone/CDL#
  // and fell Status back to Combobox default "Probation". Merge overlays instead.
  // The two branches must share ONE type. Returning a bare `{}` on the no-driver branch made TS infer a
  // UNION (`{} | {first_name: string; …}`); spreading that union gave every field an optional-undefined
  // variant and left `hydratedForm` with no index signature — which is what produced the 8 errors
  // (TS7053 on every `hydratedForm[key]` read, TS18048 on `.ine_number`/`.curp`). Annotating the memo
  // keeps FAIL-D5's merge-overlay semantics byte-for-byte and simply stops the union from forming.
  const driverFormDefaults = useMemo((): Record<string, string> => {
    if (!driver) return {};
    return {
      first_name: driver.first_name ?? "",
      last_name: driver.last_name ?? "",
      phone: driver.phone ?? "",
      email: driver.email ?? "",
      cdl_number: driver.cdl_number ?? "",
      cdl_state: driver.cdl_state ?? "",
      cdl_class: driver.cdl_class ?? "A",
      cdl_expires_at: formatDate(driver.cdl_expires_at),
      hire_date: formatDate(driver.hire_date),
      pay_basis: driver.pay_basis ?? "short_miles",
      dot_medical_expires_at: formatDate(driver.dot_medical_expires_at),
      hazmat_endorsement_expires_at: formatDate(driver.hazmat_endorsement_expires_at),
      visa_type: driver.visa_type ?? "",
      visa_number: driver.visa_number ?? "",
      visa_expires_at: formatDate(driver.visa_expires_at),
      passport_number: driver.passport_number ?? "",
      passport_expires_at: formatDate(driver.passport_expires_at),
      ine_number: driver.ine_number ?? "",
      curp: driver.curp ?? "",
      mx_address_line1: driver.mx_address_line1 ?? "",
      mx_address_line2: driver.mx_address_line2 ?? "",
      mx_city: driver.mx_city ?? "",
      mx_state: driver.mx_state ?? "",
      mx_postal_code: driver.mx_postal_code ?? "",
      emergency_contact_name: driver.emergency_contact_name ?? "",
      emergency_contact_relationship: driver.emergency_contact_relationship ?? "",
      emergency_contact_phone_primary: driver.emergency_contact_phone_primary ?? "",
      emergency_contact_phone_alternate: driver.emergency_contact_phone_alternate ?? "",
      emergency_contact_address: driver.emergency_contact_address ?? "",
      emergency_contact_notes: driver.emergency_contact_notes ?? "",
      referred_by_driver_id: driver.referred_by_driver_id ?? "",
      referral_source: driver.referral_source ?? "",
      preferred_language: driver.preferred_language ?? "en",
      // `status` is optional on the API row (`status?: string`), so this was the ONE field here without a
      // fallback — it could seed the form with `undefined`. That is the same shape as the bug FAIL-D5 was
      // fixing (Status falling back to the Combobox default), so it gets the same `?? ""` as its siblings.
      status: driver.status ?? "",
      notes: driver.notes ?? "",
    };
  }, [driver]);

  const hydratedForm = useMemo(() => {
    if (!driver) return form;
    return { ...driverFormDefaults, ...form };
  }, [driver, driverFormDefaults, form]);

  const selectedLineHistory = useMemo(() => {
    const rows = historyQuery.data?.line_items ?? [];
    return rows.find((line) => line.line_item_template_id === selectedLineItemId)?.history ?? [];
  }, [historyQuery.data, selectedLineItemId]);

  const updateMutation = useMutation({
    mutationFn: () =>
      updateDriver(id, {
        ...hydratedForm,
        email: hydratedForm.email || null,
        cdl_number: hydratedForm.cdl_number || null,
        cdl_state: hydratedForm.cdl_state || null,
        notes: hydratedForm.notes || null,
        cdl_expires_at: hydratedForm.cdl_expires_at || null,
        hire_date: hydratedForm.hire_date || null,
        pay_basis: hydratedForm.pay_basis as "short_miles" | "practical_miles",
        dot_medical_expires_at: hydratedForm.dot_medical_expires_at || null,
        hazmat_endorsement_expires_at: hydratedForm.hazmat_endorsement_expires_at || null,
        endorsement_h: endorsementH ?? driver?.endorsement_h ?? false,
        visa_type: hydratedForm.visa_type || null,
        visa_number: hydratedForm.visa_number || null,
        visa_expires_at: hydratedForm.visa_expires_at || null,
        passport_number: hydratedForm.passport_number || null,
        passport_expires_at: hydratedForm.passport_expires_at || null,
        ine_number: hydratedForm.ine_number || null,
        curp: hydratedForm.curp || null,
        mx_address_line1: hydratedForm.mx_address_line1 || null,
        mx_address_line2: hydratedForm.mx_address_line2 || null,
        mx_city: hydratedForm.mx_city || null,
        mx_state: hydratedForm.mx_state || null,
        mx_postal_code: hydratedForm.mx_postal_code || null,
        emergency_contact_name: hydratedForm.emergency_contact_name || null,
        emergency_contact_relationship: hydratedForm.emergency_contact_relationship || null,
        emergency_contact_phone_primary: hydratedForm.emergency_contact_phone_primary || null,
        emergency_contact_phone_alternate: hydratedForm.emergency_contact_phone_alternate || null,
        emergency_contact_address: hydratedForm.emergency_contact_address || null,
        emergency_contact_notes: hydratedForm.emergency_contact_notes || null,
        referred_by_driver_id: hydratedForm.referred_by_driver_id || null,
        referral_source: hydratedForm.referral_source || null,
        preferred_language: (hydratedForm.preferred_language as "en" | "es") || "en",
      }),
    onSuccess: (updated) => {
      // LV-DRIVER-EDIT-SAVE-DISPLAY-STALE: same root cause as saveDriverQboMutation above — the
      // detail page reads ["driver", id, companyId] but this wrote to ["driver", id], a phantom
      // key setQueryData's exact-match semantics never surface. Every field edited here (phone,
      // hire_date, everything) persisted correctly server-side; the screen just kept showing the
      // pre-edit value because it was never actually told the data changed.
      queryClient.setQueryData(["driver", id, companyId], updated);
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
      setForm({});
      setEditMode(false);
      pushToast("Driver updated", "success");
    },
    onError: () => pushToast("Failed to update driver", "error"),
  });

  const addQualificationMutation = useMutation({
    mutationFn: ({ driverId, body }: { driverId: string; body: Parameters<typeof createDriverQualification>[1] }) =>
      createDriverQualification(driverId, body, companyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["driver-qualifications", id] });
      setAddQualificationOpen(false);
      setNewQualificationForm({
        equipment_type_id: "",
        qualified_at: companyToday(),
        notes: "",
      });
      pushToast("Qualification added", "success");
    },
    onError: () => pushToast("Failed to add qualification", "error"),
  });

  const deactivateQualificationMutation = useMutation({
    mutationFn: ({ driverId, qualificationId }: { driverId: string; qualificationId: string }) =>
      deactivateDriverQualification(driverId, qualificationId, companyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["driver-qualifications", id] });
      pushToast("Qualification deactivated", "info");
    },
    onError: () => pushToast("Failed to deactivate qualification", "error"),
  });

  const changeRateMutation = useMutation({
    mutationFn: ({
      driverId,
      qualificationId,
      body,
    }: {
      driverId: string;
      qualificationId: string;
      body: Parameters<typeof changeDriverQualificationRate>[2];
    }) => changeDriverQualificationRate(driverId, qualificationId, body, companyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["driver-qualifications", id] });
      queryClient.invalidateQueries({ queryKey: ["driver-rate-history", id, selectedQualificationId, selectedLineItemId] });
      setRateModalOpen(false);
      pushToast("Rate changed", "success");
    },
    onError: () => pushToast("Failed to change rate", "error"),
  });

  const reactivateQualificationMutation = useMutation({
    mutationFn: ({ driverId, qualificationId }: { driverId: string; qualificationId: string }) =>
      reactivateQualification(driverId, qualificationId, companyId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["driver-qualifications", id] });
      const restoredCount = result.qualification.rates_restored.length;
      pushToast(`Qualification reactivated. ${restoredCount} rates restored.`, "success");
      setReactivateModalOpen(false);
      setReactivateTargetQualification(null);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 400) {
        pushToast("Qualification is already active", "info");
        return;
      }
      pushToast("Failed to reactivate qualification", "error");
    },
  });

  const upsertCompanyAuthMutation = useMutation({
    mutationFn: ({ driverId, body }: { driverId: string; body: Parameters<typeof upsertDriverCompanyAuthorization>[1] }) =>
      upsertDriverCompanyAuthorization(driverId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["driver-company-authorizations", id] });
      pushToast("Authorization updated", "success");
    },
    onError: () => pushToast("Failed to update authorization", "error"),
  });

  const deactivateMutation = useMutation({
    mutationFn: () => deactivateDriver(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["driver", id] });
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
      pushToast("Driver deactivated", "info");
    },
    onError: () => pushToast("Failed to deactivate driver", "error"),
  });

  const enablePhoneLoginMutation = useMutation({
    mutationFn: () => enableDriverPhoneLogin(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["driver", id] });
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
      setEnableModalOpen(false);
      pushToast("Phone login enabled", "success");
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        pushToast("Phone login is already enabled", "info");
        return;
      }
      pushToast("Failed to enable phone login", "error");
    },
  });

  const disablePhoneLoginMutation = useMutation({
    mutationFn: () => disableDriverPhoneLogin(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["driver", id] });
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
      pushToast("Phone login disabled", "info");
    },
    onError: () => pushToast("Failed to disable phone login", "error"),
  });

  const resendInviteMutation = useMutation({
    mutationFn: () => resendDriverInvite(id),
    onSuccess: (result) => {
      pushToast(`Invite re-sent to ${result.sent_to}`, "success");
    },
    onError: () => pushToast("Failed to re-send invite", "error"),
  });

  const createSafetyEventMutation = useMutation({
    mutationFn: () =>
      createSafetyEvent(id, {
        event_type: safetyForm.event_type,
        event_date: safetyForm.event_date,
        severity: safetyForm.severity,
        summary: safetyForm.summary.trim(),
        details: safetyForm.details.trim() || undefined,
        termination_reason_id: safetyForm.event_type === "termination" ? safetyForm.termination_reason_id || undefined : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["driver-safety-events", id] });
      setAddSafetyEventOpen(false);
      setSafetyForm({
        event_type: "incident",
        event_date: companyToday(),
        severity: "warning",
        summary: "",
        details: "",
        termination_reason_id: "",
      });
      pushToast("Safety event added", "success");
    },
    onError: () => pushToast("Failed to add safety event", "error"),
  });

  const voidSafetyEventMutation = useMutation({
    mutationFn: () => {
      if (!voidTargetEventId) throw new Error("No event selected");
      return voidSafetyEvent(id, voidTargetEventId, voidReason);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["driver-safety-events", id] });
      setVoidTargetEventId(null);
      setVoidReason("");
      pushToast("Safety event voided", "success");
    },
    onError: () => pushToast("Failed to void safety event", "error"),
  });

  // Each list empty message renders only once its query settles, never mid-fetch.
  const qualificationsListState = useListState(qualificationsQuery, (qualificationsQuery.data ?? []).length === 0);
  const companiesListState = useListState(companiesQuery, (companiesQuery.data ?? []).length === 0);
  const safetyEventsListState = useListState(safetyEventsQuery, (safetyEventsQuery.data ?? []).length === 0);
  const qboLinkageListState = useListState(qboLinkageHistoryQuery, (qboLinkageHistoryQuery.data?.rows ?? []).length === 0);
  const legalMattersListState = useListState(legalMattersForDriverQuery, (legalMattersForDriverQuery.data?.matters ?? []).length === 0);

  const rateHistoryColumns = useMemo<Array<ParityColumn<DriverQualificationRateHistoryItem>>>(
    () => [
      {
        key: "effective_from",
        label: "Date range",
        sortable: true,
        render: (item) => formatDateRange(item.effective_from, item.effective_to),
      },
      {
        key: "amount",
        label: "Amount",
        sortable: true,
        sortValue: (item) => Number(item.amount),
        render: (item) => <span className={item.was_corrected ? "line-through" : ""}>${Number(item.amount).toFixed(2)}</span>,
      },
      {
        key: "change_reason",
        label: "Reason",
        sortable: true,
        render: (item) => (
          <div className="flex items-center gap-2">
            <span className="capitalize">{formatReasonLabel(item.change_reason)}</span>
            {item.was_corrected ? (
              <span
                className="rounded-sm bg-gray-300 px-2 py-0.5 text-[10px] font-semibold uppercase text-gray-700"
                title="This rate was corrected on the same day before settlement could occur"
              >
                Corrected
              </span>
            ) : null}
          </div>
        ),
      },
      {
        key: "change_notes",
        label: "Notes",
        render: (item) => item.change_notes || "—",
      },
      {
        key: "created_by_user_email",
        label: "Changed by",
        render: (item) => (
          <EntityLink
            kind="user"
            id={item.created_by_user_id}
            label={entityLabel(item.created_by_user_email, item.created_by_user_id, "User")}
          />
        ),
      },
      {
        key: "created_at",
        label: "Changed at",
        sortable: true,
        sortValue: (item) => new Date(item.created_at).getTime(),
        render: (item) => new Date(item.created_at).toLocaleString(),
      },
    ],
    []
  );

  // FAIL-D4 / React #310: hooks must run before any early return (loading / not-found).
  const terminationReasons = terminationReasonsQuery.data ?? [];
  const terminationReasonOptions = useMemo(
    () =>
      terminationReasons.map((reason) => ({
        value: reason.id,
        label: reason.label,
        type: reason.severity,
      })),
    [terminationReasons]
  );

  // Wait for company context before treating a missing company as not-found —
  // otherwise Compliance→/drivers/:id flashes "Driver not found" while companies hydrate.
  if (companyLoading && !companyId) {
    return <div className="text-sm text-gray-500">Loading driver...</div>;
  }

  if (!companyId) {
    return (
      <div className="space-y-3">
        <div className="text-sm text-crit">Select an operating company to load this driver.</div>
        <Button variant="secondary" onClick={() => navigate("/drivers")}>
          Back to Drivers
        </Button>
      </div>
    );
  }

  if (driverQuery.isLoading || (driverQuery.isFetching && !driver && !driverQuery.isError)) {
    return <div className="text-sm text-gray-500">Loading driver...</div>;
  }

  if (driverQuery.isError) {
    return (
      <ListErrorState
        title="Couldn't load driver"
        status={driverQuery.error instanceof ApiError ? driverQuery.error.status : 0}
        message={driverQuery.error instanceof Error ? driverQuery.error.message : undefined}
        onRetry={() => void driverQuery.refetch()}
      />
    );
  }

  if (!driver) {
    return (
      <div className="space-y-3">
        <div className="text-sm text-crit">Driver not found.</div>
        <Button variant="secondary" onClick={() => navigate("/drivers")}>
          Back to Drivers
        </Button>
      </div>
    );
  }

  const fields: Array<[string, string, string]> = [
    ["first_name", "First Name", "text"],
    ["last_name", "Last Name", "text"],
    ["phone", "Phone", "text"],
    ["email", "Email", "email"],
    ["cdl_number", "CDL #", "text"],
    ["cdl_expires_at", "CDL Expires", "date"],
    ["hire_date", "Hire Date", "date"],
    ["dot_medical_expires_at", "DOT Medical Expires", "date"],
    ["hazmat_endorsement_expires_at", "Hazmat Endorsement Expires", "date"],
  ];

  // The identity FK intentionally survives disable so audit, settlement, message and reverse links
  // retain their canonical subject. Account activity—not FK presence—is the login state.
  const hasPhoneLogin = driver.phone_login_enabled ?? Boolean(driver.identity_user_id);
  // LV-DRIVER-DETAIL-PAGE-CRASHES — this line threw and blanked the whole page. The root cause was
  // the payload shape (fixed in api/mdata.ts getDriver), but the guard stays: it is the ONLY
  // unguarded string operation in this component and the same field is already guarded at L363
  // (`driver.phone ?? ""`) and L842 (`driver.phone ?? "—"`), so it was inconsistent as well as
  // fragile. A formatter at render-top must never assume an optional field is present.
  const maskedPhone = (driver.phone ?? "").replace(/^(\+?\d{0,2})?(\d{3})(\d{3})(\d{4})$/, "$2-$3-$4");
  const qualifications = qualificationsQuery.data ?? [];
  const companies = companiesQuery.data ?? [];
  const authorizations = companyAuthQuery.data ?? [];
  const safetyEvents = safetyEventsQuery.data ?? [];
  const equipmentTypeOptions =
    equipmentTypesQuery.data?.filter((type) => !qualifications.some((qualification) => qualification.equipment_type_id === type.id)) ?? [];

  const selectedRateFromCard = qualifications
    .find((qualification) => qualification.id === selectedQualificationId)
    ?.current_rates.find((line) => line.line_item_template_id === selectedLineItemId);
  const visibleTabs = tabs.filter(
    (tab) =>
      (tab !== "Safety File" || canViewSafetyFile) &&
      (tab !== "Documents" || canViewDocuments) &&
      (tab !== "Legal Matters" || canViewLegalMatters)
  );

  const saveDriver = async () => {
    const errors: Record<string, string> = {};
    if (hydratedForm.visa_type === "B1") {
      if (!hydratedForm.ine_number.trim()) errors.ine_number = "INE number is required when visa type is B1";
      if (!hydratedForm.curp.trim()) errors.curp = "CURP is required when visa type is B1";
    }
    if (hydratedForm.curp && !/^[A-Z0-9]{18}$/i.test(hydratedForm.curp)) {
      errors.curp = "CURP must be 18 alphanumeric characters";
    }
    if (hydratedForm.ine_number && (hydratedForm.ine_number.length < 8 || hydratedForm.ine_number.length > 20)) {
      errors.ine_number = "INE must be between 8 and 20 characters";
    }
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) return;
    await updateMutation.mutateAsync();
  };

  const certBadges = [
    { label: "CDL", expiresAt: driver.cdl_expires_at },
    { label: "Medical", expiresAt: driver.dot_medical_expires_at },
    { label: "Hazmat", expiresAt: driver.hazmat_endorsement_expires_at },
    { label: "Passport", expiresAt: driver.passport_expires_at },
  ];

  return (
    <div className="space-y-3">
      <PageHeader
        title={`${driver.first_name} ${driver.last_name}`}
        backHref="/drivers"
        breadcrumb={[
          { label: "Drivers", href: "/drivers" },
          { label: `${driver.first_name} ${driver.last_name}` },
        ]}
        subtitle={driver.status}
        actions={
          <div className="flex max-w-[940px] flex-wrap items-center justify-end gap-2">
            {certBadges.map((badge) => (
              <CertExpiryBadge key={badge.label} label={badge.label} expiresAt={badge.expiresAt} />
            ))}
            <span data-testid="retention-risk-badge" className="rounded-sm bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-700">
              Retention risk
            </span>
            <StatusBadge status={driver.status} />
            <MissingRequiredChip operatingCompanyId={driver.operating_company_id} entityKind="driver" entityId={driver.id} />
            <Link to={`/drivers/${driver.id}/hos`} className="rounded-sm border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700">
              HOS Detail
            </Link>
            <Button
              variant="secondary"
              onClick={() => onboardingLaunchMutation.mutate()}
              loading={onboardingLaunchMutation.isPending}
            >
              Start / Resume Onboarding
            </Button>
            {!editMode ? (
              <Button onClick={() => setEditMode(true)}>Edit</Button>
            ) : (
              <Button onClick={() => void saveDriver()} loading={updateMutation.isPending}>
                Save
              </Button>
            )}
            {driver.status !== "Terminated" ? (
              <Button
                variant="danger"
                onClick={() => setDeactivateConfirmOpen(true)}
                loading={deactivateMutation.isPending}
              >
                Deactivate
              </Button>
            ) : null}
            {canResendInvite ? (
              <Button
                variant="secondary"
                onClick={() => resendInviteMutation.mutate()}
                loading={resendInviteMutation.isPending}
                disabled={!driver.email}
              >
                Resend Invite
              </Button>
            ) : null}
          </div>
        }
      />

      <SecondaryNavTabs
        tabs={visibleTabs.map((tab) => ({ id: tab, label: tab }))}
        activeId={activeTab}
        onChange={(nextTab) => setActiveTab(nextTab as DriverTab)}
      />

      {driver.operating_company_id ? <UnitDriverHistoryStrip operatingCompanyId={driver.operating_company_id} driverId={driver.id} /> : null}

      {activeTab === "Operations" ? (
        (() => {
          const operatingCompanyId = String(driver.operating_company_id ?? "");
          const ActiveOperationsView =
            OPERATIONS_VIEW_BY_SLUG[operationsSubView as keyof typeof OPERATIONS_VIEW_BY_SLUG] ?? DebtHistoryView;
          return (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Full operational history for this driver across finance, compliance, safety and engagement.
              </p>
              <OperationsDepthNav activeSlug={operationsSubView} onChange={setOperationsSubView} />
              {operatingCompanyId ? (
                <ActiveOperationsView driverId={driver.id} operatingCompanyId={operatingCompanyId} />
              ) : (
                <div className="rounded-sm border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
                  This driver has no operating company assigned.
                </div>
              )}
            </div>
          );
        })()
      ) : null}

      {activeTab === "Profile" ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <FlatFieldGrid
              columns={4}
              fields={[
                { label: "Driver name", value: `${driver.first_name} ${driver.last_name}`.trim() || "—" },
                { label: "Status", value: driver.status ?? "—" },
                { label: "CDL", value: [driver.cdl_class, driver.cdl_state].filter(Boolean).join(" / ") || "—" },
                { label: "Phone", value: driver.phone ?? "—" },
              ]}
            />
          </div>
          {driver.is_rehire ? (
            <div className="md:col-span-2 flex flex-wrap items-center gap-2 rounded-sm border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-800">
              <span className="rounded-sm bg-slate-200 px-2 py-1 text-xs font-semibold">REHIRE (stint #{driver.rehire_count + 1})</span>
              {driver.prior_driver_id ? (
                <EntityLinkOrTombstone
                  kind="driver"
                  id={driver.prior_driver_id}
                  name={driver.prior_driver_name}
                  noun="Driver"
                  className="text-xs font-semibold text-slate-700 hover:underline"
                  data-testid="driver-detail-prior-driver-link"
                />
              ) : null}
            </div>
          ) : null}
          {fields.map(([key, label, type]) => (
            <div key={key} className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">{label}</label>
              {type === "date" ? (
                <DatePicker
                  value={hydratedForm[key] ?? ""}
                  disabled={!editMode}
                  onChange={(value) => setForm((current) => ({ ...current, [key]: value }))}
                />
              ) : (
                <input
                  type={type}
                  value={hydratedForm[key] ?? ""}
                  disabled={!editMode}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      // LV-DRIVER-PHONE-NO-LIVE-FORMAT: only a display-only mask existed
                      // (`maskedPhone` below), never applied while actually typing.
                      [key]: key === "phone" ? formatPhoneAsTyped(event.target.value) : event.target.value,
                    }))
                  }
                  className={`${FORM_INPUT_CLASS} disabled:bg-gray-100`}
                />
              )}
            </div>
          ))}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Hazmat Endorsement (H)</label>
            <label className="flex h-9 items-center gap-2 rounded-sm border border-gray-300 px-2 text-sm disabled:bg-gray-100">
              <input
                type="checkbox"
                checked={endorsementH ?? driver.endorsement_h ?? false}
                disabled={!editMode}
                onChange={(event) => setEndorsementH(event.target.checked)}
                data-testid="driver-endorsement-h-checkbox"
              />
              <span className="text-gray-700">Driver holds a hazmat (H) CDL endorsement</span>
            </label>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">CDL State</label>
            <Combobox
              options={(usStatesQuery.data ?? []).map((state) => ({
                value: state.code,
                label: `${state.code} - ${state.name}`,
                sublabel: state.region,
              }))}
              value={hydratedForm.cdl_state || null}
              onChange={(nextValue) => setForm((current) => ({ ...current, cdl_state: nextValue ?? "" }))}
              loading={usStatesQuery.isLoading}
              disabled={!editMode || usStatesQuery.isError}
              placeholder="Select US state"
            />
            {usStatesQuery.isError ? (
              <ListErrorState
                title="Couldn't load US states"
                status={usStatesQuery.error instanceof ApiError ? usStatesQuery.error.status : 0}
                message={usStatesQuery.error instanceof Error ? usStatesQuery.error.message : undefined}
                onRetry={() => void usStatesQuery.refetch()}
                className="py-3"
              />
            ) : null}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">CDL Class</label>
            <Combobox
              options={CDL_CLASS_OPTIONS}
              disabled={!editMode}
              value={hydratedForm.cdl_class ?? "A"}
              onChange={(nextValue) => setForm((current) => ({ ...current, cdl_class: nextValue ?? "A" }))}
              placeholder="Select CDL class"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Status</label>
            <Combobox
              options={DRIVER_STATUS_OPTIONS}
              disabled={!editMode}
              value={hydratedForm.status ?? "Probation"}
              onChange={(nextValue) => setForm((current) => ({ ...current, status: nextValue ?? "Probation" }))}
              placeholder="Select status"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Pay Basis</label>
            <Combobox
              options={PAY_BASIS_OPTIONS}
              disabled={!editMode}
              value={hydratedForm.pay_basis ?? "short_miles"}
              onChange={(nextValue) => setForm((current) => ({ ...current, pay_basis: nextValue ?? "short_miles" }))}
              placeholder="Select pay basis"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Preferred Language</label>
            <Combobox
              options={[
                { value: "en", label: "English" },
                { value: "es", label: "Spanish" },
              ]}
              disabled={!editMode}
              value={hydratedForm.preferred_language ?? "en"}
              onChange={(nextValue) => setForm((current) => ({ ...current, preferred_language: nextValue ?? "en" }))}
              placeholder="Select language"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Has phone login</label>
            <div className="rounded-sm border border-gray-300 px-2 text-sm py-2">{hasPhoneLogin ? "Yes" : "No"}</div>
          </div>
          <div className="flex items-end">
            {!hasPhoneLogin ? (
              <Button onClick={() => setEnableModalOpen(true)} loading={enablePhoneLoginMutation.isPending}>
                Enable phone login
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">Phone login enabled</span>
                <Button
                  variant="danger"
                  onClick={() => disablePhoneLoginMutation.mutate()}
                  loading={disablePhoneLoginMutation.isPending}
                >
                  Disable login
                </Button>
              </div>
            )}
          </div>

          <div className="col-span-full rounded-md border border-gray-200 p-3">
            <div className="mb-2 text-xs font-semibold text-gray-600">QBO reporting (vendor & class)</div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-600">QBO vendor</label>
                {driver?.operating_company_id ? (
                  <QboCombobox
                    entityType="vendor"
                    operatingCompanyId={driver.operating_company_id}
                    value={qboVendorPickId}
                    displayValue={qboVendorPickLabel}
                    onChange={(qboId, displayName) => {
                      setQboVendorPickId(qboId);
                      setQboVendorPickLabel(displayName);
                    }}
                  />
                ) : null}
              </div>
              <div className="flex flex-col gap-1" data-testid="driver-qbo-class-select">
                <label className="text-xs font-semibold text-gray-600">Class (TMS catalog)</label>
                {/*
                  LST-PICKER-01: Profile class picker had no first-row +Create.
                  ReferenceSelect createKind=class matches ManualJE / ItemEditor / NewServiceDrawerForm.
                */}
                {driver?.operating_company_id ? (
                  <ReferenceSelect
                    value={qboClassTmsId || null}
                    onChange={(next) => setQboClassTmsId(next ?? "")}
                    options={(classesJeQuery.data?.classes ?? []).map((c) => ({
                      value: c.id,
                      label: `${c.class_code ? `${c.class_code} — ` : ""}${c.class_name}`,
                    }))}
                    createKind="class"
                    operatingCompanyId={String(driver.operating_company_id)}
                    placeholder={classesJeQuery.isLoading ? "Loading classes…" : "None"}
                    loading={classesJeQuery.isLoading}
                    onOptionCreated={() => {
                      void queryClient.invalidateQueries({ queryKey: ["list-classes-je"] });
                      void queryClient.invalidateQueries({ queryKey: ["catalogs", "accounting", "classes"] });
                    }}
                  />
                ) : null}
              </div>
            </div>
            <div className="mt-2">
              <Button size="sm" loading={saveDriverQboMutation.isPending} onClick={() => saveDriverQboMutation.mutate()}>
                Save QBO fields
              </Button>
            </div>
          </div>

          <div className="col-span-full rounded-md border border-gray-200 p-3">
            <div className="mb-2 text-xs font-semibold text-gray-600">Visa & Passport</div>
            <p className="mb-3 text-xs text-gray-600" data-testid="driver-b1-visa-status">
              B-1 operating credential: {driver.has_b1_visa ? "On file" : "Not on file"}
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {[
                ["visa_number", "Visa Number", "text"],
                ["visa_expires_at", "Visa Expires", "date"],
                ["passport_number", "Passport Number", "text"],
                ["passport_expires_at", "Passport Expires", "date"],
              ].map(([key, label, type]) => (
                <div key={key} className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-600">{label}</label>
                  {type === "date" ? (
                    <DatePicker
                      value={hydratedForm[key] ?? ""}
                      disabled={!editMode}
                      onChange={(value) => setForm((current) => ({ ...current, [key]: value }))}
                    />
                  ) : (
                    <input
                      type={type}
                      value={hydratedForm[key] ?? ""}
                      disabled={!editMode}
                      onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                      className={`${FORM_INPUT_CLASS} disabled:bg-gray-100`}
                    />
                  )}
                </div>
              ))}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-600">Visa Type</label>
                <Combobox
                  options={VISA_TYPE_OPTIONS}
                  value={hydratedForm.visa_type ?? ""}
                  disabled={!editMode}
                  onChange={(nextValue) => setForm((current) => ({ ...current, visa_type: nextValue ?? "" }))}
                  placeholder="Select visa type"
                  allowClear
                />
              </div>
            </div>
          </div>

          <div className="col-span-full rounded-md border border-gray-200 p-3" data-testid="driver-referral-lifecycle">
            <div className="mb-2 text-xs font-semibold text-gray-600">Driver referrals</div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-600">Referred by</label>
                {editMode ? (
                  <EntityPicker
                    kind="driver"
                    operatingCompanyId={driver.operating_company_id}
                    value={hydratedForm.referred_by_driver_id || null}
                    selectedOption={driver.referred_by_driver_id ? { value: driver.referred_by_driver_id, label: driver.referred_by_driver_name || "Referring driver" } : null}
                    onChange={(value) => setForm((current) => ({ ...current, referred_by_driver_id: value ?? "" }))}
                    allowCreate={false}
                    placeholder="Select referring driver"
                    dataTestId="driver-profile-referrer"
                  />
                ) : driver.referred_by_driver_id ? (
                  <EntityLinkOrTombstone kind="driver" id={driver.referred_by_driver_id} name={driver.referred_by_driver_name} noun="Driver" />
                ) : <span className="text-sm text-gray-500">Not recorded</span>}
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="referral_source" className="text-xs font-semibold text-gray-600">Referral source</label>
                <input
                  id="referral_source"
                  value={hydratedForm.referral_source ?? ""}
                  disabled={!editMode}
                  onChange={(event) => setForm((current) => ({ ...current, referral_source: event.target.value }))}
                  className={`${FORM_INPUT_CLASS} disabled:bg-gray-100`}
                />
              </div>
            </div>
            <div className="mt-3 border-t border-gray-200 pt-3">
              <div className="mb-2 text-xs font-semibold text-gray-600">Drivers referred by this driver</div>
              {referralsQuery.isError ? (
                <button type="button" className="text-sm text-red-700 underline" onClick={() => void referralsQuery.refetch()}>Couldn't load referrals — Retry</button>
              ) : referralsQuery.isLoading ? (
                <p className="text-sm text-gray-500">Loading referrals…</p>
              ) : (referralsQuery.data?.referrals.length ?? 0) === 0 ? (
                <p className="text-sm text-gray-500">No referred drivers.</p>
              ) : (
                <div className="space-y-2">
                  {referralsQuery.data?.referrals.map((referral) => (
                    <div key={referral.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <EntityLinkOrTombstone kind="driver" id={referral.id} name={referral.driver_name} noun="Driver" />
                      <span className="text-gray-500">{referral.referral_source || "Source not recorded"}{referral.referral_reward_paid_at ? " · Reward paid" : " · Reward pending"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="col-span-full rounded-md border border-gray-200 p-3">
            <div className="mb-2 text-xs font-semibold text-gray-600">Emergency Contact</div>
            <div className="grid gap-3 md:grid-cols-2">
              {[
                ["emergency_contact_name", "Name"],
                ["emergency_contact_relationship", "Relationship"],
                ["emergency_contact_phone_primary", "Phone Primary"],
                ["emergency_contact_phone_alternate", "Phone Alternate"],
              ].map(([key, label]) => (
                <div key={key} className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-600">{label}</label>
                  <input
                    value={hydratedForm[key] ?? ""}
                    disabled={!editMode}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        [key]: key.includes("phone") ? formatPhoneAsTyped(event.target.value) : event.target.value,
                      }))
                    }
                    className={`${FORM_INPUT_CLASS} disabled:bg-gray-100`}
                  />
                </div>
              ))}
              <div className="md:col-span-2 flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-600">Address</label>
                <textarea
                  value={hydratedForm.emergency_contact_address ?? ""}
                  disabled={!editMode}
                  onChange={(event) => setForm((current) => ({ ...current, emergency_contact_address: event.target.value }))}
                  className={`${FORM_TEXTAREA_CLASS} disabled:bg-gray-100`}
                  rows={2}
                />
              </div>
              <div className="md:col-span-2 flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-600">Notes</label>
                <textarea
                  value={hydratedForm.emergency_contact_notes ?? ""}
                  disabled={!editMode}
                  onChange={(event) => setForm((current) => ({ ...current, emergency_contact_notes: event.target.value }))}
                  className={`${FORM_TEXTAREA_CLASS} disabled:bg-gray-100`}
                  rows={2}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "QBO Mapping" ? (
        <div className="space-y-3 rounded-sm border border-gray-200 bg-white p-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">QBO Vendor Linkage</h2>
              <p className="text-xs text-gray-600">
                Status:{" "}
                <span className={driver.qbo_vendor_id ? "font-semibold text-slate-700" : "font-semibold text-slate-700"}>
                  {driver.qbo_vendor_id ? "Linked" : "Unlinked"}
                </span>
              </p>
            </div>
            {isOwner ? (
              <Button variant="secondary" onClick={() => setQboModalOpen(true)}>
                {driver.qbo_vendor_id ? "Edit Linkage" : "Link to existing"}
              </Button>
            ) : null}
          </div>
          <div className="rounded-sm border border-gray-200 bg-gray-50 p-2 text-xs">
            <div>
              Current Vendor:{" "}
              {driver.qbo_vendor_local_id ? (
                <EntityLinkOrTombstone
                  kind="vendor"
                  id={driver.qbo_vendor_local_id}
                  name={driver.qbo_vendor_name}
                  noun="Vendor"
                  className="font-semibold text-gray-900"
                  data-testid="driver-qbo-vendor-link"
                />
              ) : (
                <span className="font-semibold text-gray-500" data-testid="driver-qbo-vendor-tombstone">
                  {driver.qbo_vendor_id ? "Vendor — not visible" : "Unassigned"}
                </span>
              )}
            </div>
            <div>Linked At: <span className="font-semibold text-gray-900">{driver.qbo_vendor_linked_at ? new Date(driver.qbo_vendor_linked_at).toLocaleString() : "-"}</span></div>
          </div>
          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Linkage History</h3>
            <div className="max-h-56 overflow-auto rounded-sm border border-gray-200">
              {(qboLinkageHistoryQuery.data?.rows ?? []).map((row, idx) => (
                <div key={String(row.id ?? idx)} className="border-b border-gray-100 px-2 py-1.5 text-xs">
                  <div className="font-semibold text-gray-900">{String(row.action ?? "-")}</div>
                  <div className="text-gray-600">{String(row.reason ?? "-")}</div>
                  <div className="text-[11px] text-gray-500">{String(row.created_at ?? "")}</div>
                </div>
              ))}
              {qboLinkageListState.isEmpty ? (
                <div className="px-2 py-2 text-xs text-gray-500">No linkage events yet.</div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "Profile" ? (
        <div className="space-y-3 rounded-md border border-gray-200 p-3">
          <p className="text-sm text-gray-700">Required for B1/Mexican drivers. Leave blank for non-Mexican drivers.</p>
          <div className="grid gap-3 md:grid-cols-2">
            {driver.prior_driver_id ? (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-600">Prior driver record</label>
                <div className="rounded-sm border border-gray-300 bg-gray-50 px-2 text-sm py-2">
                  <EntityLinkOrTombstone
                    kind="driver"
                    id={driver.prior_driver_id}
                    name={driver.prior_driver_name}
                    noun="Driver"
                    data-testid="driver-detail-prior-driver-field-link"
                  />
                </div>
              </div>
            ) : null}
            {driver.rehire_count > 0 ? (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-600">Rehire count</label>
                <div className="rounded-sm border border-gray-300 bg-gray-50 px-2 text-sm py-2">{driver.rehire_count}</div>
              </div>
            ) : null}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">INE Number</label>
              <input
                value={hydratedForm.ine_number ?? ""}
                disabled={!editMode}
                onChange={(event) => setForm((current) => ({ ...current, ine_number: event.target.value }))}
                className={`${FORM_INPUT_CLASS} disabled:bg-gray-100`}
                placeholder="13 digits typical"
              />
              {validationErrors.ine_number ? <span className="text-xs text-crit">{validationErrors.ine_number}</span> : null}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">CURP</label>
              <input
                value={hydratedForm.curp ?? ""}
                disabled={!editMode}
                onChange={(event) => setForm((current) => ({ ...current, curp: event.target.value.toUpperCase() }))}
                className={`${FORM_INPUT_CLASS} disabled:bg-gray-100`}
                placeholder="AAAA######HXXAAA##"
              />
              {validationErrors.curp ? <span className="text-xs text-crit">{validationErrors.curp}</span> : null}
            </div>
            {[
              ["mx_address_line1", "Street line 1"],
              ["mx_address_line2", "Street line 2"],
              ["mx_city", "City"],
              ["mx_postal_code", "Postal code"],
            ].map(([key, label]) => (
              <div key={key} className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-600">{label}</label>
                <input
                  value={hydratedForm[key] ?? ""}
                  disabled={!editMode}
                  onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                  className={`${FORM_INPUT_CLASS} disabled:bg-gray-100`}
                />
              </div>
            ))}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">State</label>
              <Combobox
                options={(mexicoStatesQuery.data ?? []).map((state) => ({
                  value: state.code,
                  label: `${state.code} - ${state.name}`,
                  sublabel: state.region,
                }))}
                value={hydratedForm.mx_state || null}
                onChange={(nextValue) => setForm((current) => ({ ...current, mx_state: nextValue ?? "" }))}
                loading={mexicoStatesQuery.isLoading}
                disabled={!editMode || mexicoStatesQuery.isError}
                placeholder="Select Mexico state"
              />
              {mexicoStatesQuery.isError ? (
                <ListErrorState
                  title="Couldn't load Mexico states"
                  status={mexicoStatesQuery.error instanceof ApiError ? mexicoStatesQuery.error.status : 0}
                  message={mexicoStatesQuery.error instanceof Error ? mexicoStatesQuery.error.message : undefined}
                  onRetry={() => void mexicoStatesQuery.refetch()}
                  className="py-3"
                />
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "Equipment Assignments" ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Qualifications</h2>
            <div className="flex items-center gap-2">
              {canManageRates ? (
                <label className="flex items-center gap-2 rounded-sm border border-gray-300 px-2 py-1 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={showInactiveQualifications}
                    onChange={(event) => setShowInactiveQualifications(event.target.checked)}
                  />
                  Show inactive qualifications
                </label>
              ) : null}
              {canManageRates ? (
                <Button onClick={() => setAddQualificationOpen(true)}>
                  + Create Equipment Qualification
                </Button>
              ) : null}
            </div>
          </div>
          <div className="space-y-2">
            {qualificationsQuery.isError ? (
              <ListErrorState
                title="Couldn't load driver qualifications"
                status={qualificationsQuery.error instanceof ApiError ? qualificationsQuery.error.status : 0}
                message={qualificationsQuery.error instanceof Error ? qualificationsQuery.error.message : undefined}
                onRetry={() => void qualificationsQuery.refetch()}
              />
            ) : null}
            {qualifications.map((qualification) => (
              <div
                key={qualification.id}
                className={`rounded border p-2.5 ${
                  qualification.is_active ? "border-gray-200 bg-white" : "border-gray-300 bg-gray-100"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded-sm bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                      {qualification.equipment_type.name}
                    </span>
                    <span
                      className={`rounded px-2 py-1 text-xs font-semibold ${
                        qualification.is_active ? "bg-slate-100 text-slate-700" : "bg-gray-200 text-gray-700"
                      }`}
                    >
                      {qualification.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-600">Qualified: {formatDate(qualification.qualified_at)}</div>
                </div>
                <div className="mt-1.5 space-y-1.5">
                  {qualification.current_rates.map((line) => (
                    <div key={line.line_item_template_id} className="rounded-sm border border-gray-100 bg-gray-50 p-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-[13px] font-medium text-gray-800">
                          {line.line_item_name} ({line.line_item_code})
                        </div>
                        <div className="text-[13px] font-semibold text-gray-700">
                          {line.amount ? `$${Number(line.amount).toFixed(2)}` : "No rate set"}
                        </div>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {canManageRates && qualification.is_active ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setSelectedQualificationId(qualification.id);
                              setSelectedLineItemId(line.line_item_template_id);
                              setSelectedEquipmentName(qualification.equipment_type.name);
                              setSelectedLineItemName(line.line_item_name);
                              setRateChangeForm((current) => ({
                                ...current,
                                amount: line.amount ? String(line.amount) : "",
                                // DRV-MONEY-F6959 — same companyToday() fix as the initial form state above.
                                effective_from: companyToday(),
                              }));
                              setRateModalOpen(true);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setSelectedQualificationId(qualification.id);
                            setSelectedLineItemId(line.line_item_template_id);
                            setSelectedEquipmentName(qualification.equipment_type.name);
                            setSelectedLineItemName(line.line_item_name);
                            setHistoryModalOpen(true);
                          }}
                        >
                          <History className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                {canManageRates && qualification.is_active ? (
                  <div className="mt-2">
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() =>
                        deactivateQualificationMutation.mutate({
                          driverId: id,
                          qualificationId: qualification.id,
                        })
                      }
                      loading={deactivateQualificationMutation.isPending}
                    >
                      Deactivate
                    </Button>
                  </div>
                ) : null}
                {canManageRates && !qualification.is_active ? (
                  <div className="mt-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setReactivateTargetQualification({
                          id: qualification.id,
                          name: qualification.equipment_type.name,
                        });
                        setReactivateModalOpen(true);
                      }}
                    >
                      Reactivate
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
            {!qualificationsQuery.isError && qualificationsListState.isEmpty ? <div className="text-[13px] text-gray-500">No qualifications found for this driver.</div> : null}
          </div>
          {driver?.operating_company_id ? (
            <DriverEquipmentTransfersReverseSection
              operatingCompanyId={String(driver.operating_company_id)}
              driverId={id}
            />
          ) : null}
        </div>
      ) : null}

      {activeTab === "Earnings & Debt" ? (
        <EarningsTab
          driverId={id}
          operatingCompanyId={String(driver?.operating_company_id ?? "")}
          onOpenOperationsView={(slug) => {
            setActiveTab("Operations");
            setOperationsSubView(slug);
          }}
          onOpenEquipmentAssignments={() => setActiveTab("Equipment Assignments")}
        />
      ) : null}

      {activeTab === "Safety File" ? (
        <div className="space-y-3">
          {!canViewSafetyFile ? (
            <div className="rounded-sm border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
              You do not have permission to view Safety File records.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-gray-900">Safety File</h2>
                <div className="flex items-center gap-2">
                  {isOwner ? (
                    <label className="flex items-center gap-2 rounded-sm border border-gray-300 px-2 py-1 text-xs text-gray-600">
                      <input
                        type="checkbox"
                        checked={showVoidedSafetyEvents}
                        onChange={(event) => setShowVoidedSafetyEvents(event.target.checked)}
                      />
                      Show voided
                    </label>
                  ) : null}
                  {isOwner ? <Button onClick={() => setAddSafetyEventOpen(true)}>+ Create Event</Button> : null}
                </div>
              </div>

              <div className="space-y-2">
                {safetyEventsQuery.isLoading ? <div className="text-sm text-gray-500">Loading safety events...</div> : null}
                {safetyEventsQuery.isError ? (
                  <ListErrorState
                    title="Couldn't load driver safety events"
                    status={safetyEventsQuery.error instanceof ApiError ? safetyEventsQuery.error.status : 0}
                    message={safetyEventsQuery.error instanceof Error ? safetyEventsQuery.error.message : undefined}
                    onRetry={() => void safetyEventsQuery.refetch()}
                  />
                ) : null}
                {safetyEvents.map((event) => {
                  const expanded = expandedSafetyEventId === event.id;
                  const isVoided = Boolean(event.voided_at);
                  const typePillClass =
                    event.event_type === "termination"
                      ? "bg-red-100 text-red-800"
                      : event.event_type === "incident"
                      ? "bg-slate-100 text-slate-700"
                      : event.event_type === "complaint"
                      ? "bg-orange-100 text-orange-800"
                      : event.event_type === "commendation"
                      ? "bg-slate-100 text-slate-700"
                      : "bg-slate-100 text-slate-700";
                  return (
                    <div key={event.id} className={`rounded-sm border p-3 ${isVoided ? "border-gray-300 bg-gray-100" : "border-gray-200 bg-white"}`}>
                      <button
                        type="button"
                        onClick={() => setExpandedSafetyEventId((current) => (current === event.id ? null : event.id))}
                        className="flex w-full items-center justify-between gap-2 text-left"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-gray-600">{formatDate(event.event_date)}</span>
                          <span className={`rounded-sm px-2 py-0.5 text-xs font-semibold capitalize ${typePillClass}`}>{event.event_type}</span>
                          <StatusBadge status={event.severity} />
                        </div>
                        <div className={`text-sm font-medium ${isVoided ? "line-through text-gray-500" : "text-gray-800"}`}>{event.summary}</div>
                      </button>

                      {expanded ? (
                        <div className="mt-2 space-y-2 text-sm">
                          <div>{event.details || "No additional details provided."}</div>
                          <div className="text-xs text-gray-600">
                            Termination reason: {event.termination_reason_label || "N/A"} | Documents: {event.document_ids?.length ?? 0}
                          </div>
                          {isOwner && !isVoided ? (
                            <Button variant="danger" size="sm" onClick={() => setVoidTargetEventId(event.id)}>
                              Void
                            </Button>
                          ) : null}
                          {isVoided ? (
                            <div className="rounded-sm bg-gray-200 px-2 py-1 text-xs text-gray-700">
                              VOIDED on {new Date(event.voided_at || "").toLocaleString()} by{" "}
                              <EntityLink
                                kind="user"
                                id={event.voided_by_user_id}
                                label={entityLabel(event.voided_by_user_email, event.voided_by_user_id, "User")}
                              />
                              : {" "}
                              {event.void_reason}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {!safetyEventsQuery.isError && safetyEventsListState.isEmpty ? (
                  <div className="text-sm text-gray-500">No safety events recorded for this driver.</div>
                ) : null}
              </div>
              {/* SAF-F16 — reverse linkage. The block above is only the internal safety-EVENT log;
                  the driver's actual safety record (external fines, internal fines, complaints,
                  drug & alcohol) lived in safety.* with FKs to this driver and was unreadable from
                  the driver's own page. DEFINITION-OF-DONE §1.C: forward without reverse is not done. */}
              {driver?.operating_company_id ? (
                <DriverSafetyReverseSection
                  operatingCompanyId={String(driver.operating_company_id)}
                  driverId={id}
                  data-testid="driver-detail-safety-reverse"
                />
              ) : null}
              {driver?.operating_company_id ? (
                <>
                  <DriverWorkOrdersReverseSection
                    operatingCompanyId={String(driver.operating_company_id)}
                    driverId={id}
                    data-testid="driver-detail-work-orders-reverse"
                  />
                  <DriverReportsReverseSection operatingCompanyId={String(driver.operating_company_id)} driverId={id} />
                  <DriverTempCoverReverseSection operatingCompanyId={String(driver.operating_company_id)} driverId={id} />
                  <DriverHosViolationsReverseSection operatingCompanyId={String(driver.operating_company_id)} driverId={id} />
                  {/* SAF-F7527 — EntityLink's canonical driver target is /drivers/:id, not the
                      secondary /drivers/:id/profile route. Keep the same governed reverse reader on
                      the Safety File users actually reach so company violations, integrity alerts,
                      and anomaly records remain drillable in both directions. */}
                  <SafetyAlertsReverseSection
                    operatingCompanyId={String(driver.operating_company_id)}
                    subjectKind="driver"
                    subjectId={id}
                  />
                  <MedicalCardsHistorySection operatingCompanyId={String(driver.operating_company_id)} driverId={id} />
                  <BackgroundChecksSection operatingCompanyId={String(driver.operating_company_id)} driverId={id} />
                </>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {activeTab === "Documents" ? (
        canViewDocuments ? (
          <ErrorBoundary>
            <DocumentsTab entityType="driver" entityId={driver.id} entityName={`${driver.first_name} ${driver.last_name}`} operatingCompanyId={driver.operating_company_id ?? companyId} />
          </ErrorBoundary>
        ) : (
          <div className="rounded-sm border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
            You do not have permission to view documents for this driver.
          </div>
        )
      ) : null}

      {activeTab === "Legal Matters" ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm text-gray-600">Legal matters linked to this driver (Owner/Admin).</p>
            {legalMattersForDriverQuery.isLoading ? (
              <p className="text-sm text-gray-500">Loading…</p>
            ) : legalMattersForDriverQuery.isError ? (
              <ListErrorState
                title="Couldn't load linked legal matters"
                status={legalMattersForDriverQuery.error instanceof ApiError ? legalMattersForDriverQuery.error.status : 0}
                message={legalMattersForDriverQuery.error instanceof Error ? legalMattersForDriverQuery.error.message : undefined}
                onRetry={() => void legalMattersForDriverQuery.refetch()}
              />
            ) : (
              <ul className="space-y-2">
                {(legalMattersForDriverQuery.data?.matters ?? []).map((m: Record<string, unknown>) => (
                  <li key={String(m.id ?? "")} className="rounded-sm border border-gray-200 bg-white px-3 py-2 text-sm">
                    <EntityLink
                      kind="matter"
                      id={String(m.id ?? "")}
                      label={String(m.matter_number ?? "")}
                      className="font-semibold text-slate-700"
                      data-testid="driver-detail-legal-matter-link"
                    />
                    <span className="ml-2 text-gray-600">{String(m.status ?? "")}</span>
                  </li>
                ))}
              </ul>
            )}
            {!legalMattersForDriverQuery.isError && legalMattersListState.isEmpty ? (
              <p className="text-sm text-gray-500">No linked matters.</p>
            ) : null}
          </div>
          {driver?.operating_company_id ? (
            <InsuranceClaimsReverseSection
              operatingCompanyId={String(driver.operating_company_id)}
              filter={{ driver_id: id }}
              contextLabel="this driver"
              data-testid="driver-detail-insurance-claims"
            />
          ) : null}
        </div>
      ) : null}

      {activeTab === "Audit History" && driverQuery.data?.operating_company_id ? (
        <AuditHistoryTab driverId={id} operatingCompanyId={String(driverQuery.data.operating_company_id)} />
      ) : null}

      {activeTab === "Load History" && driverQuery.data?.operating_company_id ? (
        <LoadHistoryTab driverId={id} operatingCompanyId={String(driverQuery.data.operating_company_id)} />
      ) : null}

      {activeTab === "ELD Edits" && driverQuery.data?.operating_company_id ? (
        <div className="space-y-2">
          <p className="text-sm text-gray-600">Read-only Samsara HOS log edit history for DOT audit review.</p>
          <EldEditHistoryTimeline driverUuid={id} operatingCompanyId={String(driverQuery.data.operating_company_id)} />
        </div>
      ) : null}

      {activeTab === "Profile" ? (
        <div className="space-y-3">
          {companiesQuery.isError ? (
            <ListErrorState
              title="Couldn't load accessible operating companies"
              status={companiesQuery.error instanceof ApiError ? companiesQuery.error.status : 0}
              message={companiesQuery.error instanceof Error ? companiesQuery.error.message : undefined}
              onRetry={() => void companiesQuery.refetch()}
            />
          ) : companyAuthQuery.isError ? (
            <ListErrorState
              title="Couldn't load driver company authorizations"
              status={companyAuthQuery.error instanceof ApiError ? companyAuthQuery.error.status : 0}
              message={companyAuthQuery.error instanceof Error ? companyAuthQuery.error.message : undefined}
              onRetry={() => void companyAuthQuery.refetch()}
            />
          ) : companies.map((company) => {
            const existing = authorizations.find((authorization) => authorization.company_id === company.id);
            const rowNotes = authorizationNotesByCompany[company.id] ?? existing?.notes ?? "";
            return (
              <div key={company.id} className="rounded-sm border border-gray-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-gray-900">
                    {company.legal_name} <span className="rounded-sm bg-gray-100 px-2 py-1 text-xs">{company.code}</span>
                  </div>
                  <div className="text-xs text-gray-600">
                    Authorized at: {existing?.authorized_at ? new Date(existing.authorized_at).toLocaleString() : "—"}
                  </div>
                </div>
                <div className="mt-2 grid gap-2 md:grid-cols-[auto_1fr_auto] md:items-center">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={existing?.is_authorized ?? false}
                      disabled={!canManageCompanyAuth}
                      onChange={(event) =>
                        upsertCompanyAuthMutation.mutate({
                          driverId: id,
                          body: {
                            company_id: company.id,
                            is_authorized: event.target.checked,
                            notes: rowNotes || undefined,
                          },
                        })
                      }
                    />
                    Authorized
                  </label>
                  <input
                    value={rowNotes}
                    disabled={!canManageCompanyAuth}
                    onChange={(event) =>
                      setAuthorizationNotesByCompany((current) => ({
                        ...current,
                        [company.id]: event.target.value,
                      }))
                    }
                    className={`${FORM_INPUT_CLASS} disabled:bg-gray-100`}
                    placeholder="Notes"
                  />
                  {canManageCompanyAuth ? (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        upsertCompanyAuthMutation.mutate({
                          driverId: id,
                          body: {
                            company_id: company.id,
                            is_authorized: existing?.is_authorized ?? false,
                            notes: rowNotes || undefined,
                          },
                        })
                      }
                      loading={upsertCompanyAuthMutation.isPending}
                    >
                      Save notes
                    </Button>
                  ) : null}
                </div>
                <div className="mt-1 text-xs text-gray-600">Authorized by: {existing?.authorized_by_user_email ?? "—"}</div>
              </div>
            );
          })}
          {!companiesQuery.isError && !companyAuthQuery.isError && companiesListState.isEmpty ? <div className="text-sm text-gray-500">No accessible operating companies.</div> : null}
        </div>
      ) : null}

      <div className="rounded-sm border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
        Last updated by <EntityLinkOrTombstone kind="user" id={driver.updated_by_user_id} name={driver.updated_by_user_label} noun="User" /> on {new Date(driver.updated_at).toLocaleString()}
      </div>

      <Modal variant="drawer" open={addQualificationOpen} onClose={() => setAddQualificationOpen(false)} title="Create Equipment Qualification">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!newQualificationForm.equipment_type_id) {
              pushToast("Select an equipment type", "error");
              return;
            }
            addQualificationMutation.mutate({
              driverId: id,
              body: {
                equipment_type_id: newQualificationForm.equipment_type_id,
                qualified_at: newQualificationForm.qualified_at || undefined,
                notes: newQualificationForm.notes || undefined,
              },
            });
          }}
        >
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Equipment type</label>
            {equipmentTypesQuery.isError ? <ListErrorState status={0} message="Equipment types could not be loaded." onRetry={() => void equipmentTypesQuery.refetch()} /> : null}
            {/*
              LST-PICKER-01: ReferenceSelect first-row create → POST catalogs.equipment_types
              (inline create seeds one per_loaded_mile Base rate line item). Options keyed by id.
            */}
            <ReferenceSelect
              value={newQualificationForm.equipment_type_id || null}
              onChange={(nextValue) =>
                setNewQualificationForm((current) => ({ ...current, equipment_type_id: nextValue ?? "" }))
              }
              options={equipmentTypeOptions.map((option) => ({ value: option.id, label: option.name }))}
              createKind="equipment_type"
              operatingCompanyId={String(driver?.operating_company_id ?? companyId)}
              placeholder={equipmentTypesQuery.isLoading ? "Loading equipment types…" : "Select equipment type"}
              loading={equipmentTypesQuery.isLoading}
              disabled={equipmentTypesQuery.isError}
              onOptionCreated={() => {
                void queryClient.invalidateQueries({ queryKey: ["equipment-types-for-driver-detail", companyId] });
                void queryClient.invalidateQueries({ queryKey: ["catalogs", "equipment-types"] });
              }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Qualified date</label>
            <DatePicker
              value={newQualificationForm.qualified_at}
              onChange={(value) => setNewQualificationForm((current) => ({ ...current, qualified_at: value }))}
              className=""
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Notes</label>
            <textarea
              value={newQualificationForm.notes}
              onChange={(event) => setNewQualificationForm((current) => ({ ...current, notes: event.target.value }))}
              className={FORM_TEXTAREA_CLASS}
              rows={2}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setAddQualificationOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={addQualificationMutation.isPending} disabled={equipmentTypesQuery.isError}>
              Save
            </Button>
          </div>
        </form>
      </Modal>

      <Modal variant="drawer" open={addSafetyEventOpen} onClose={() => setAddSafetyEventOpen(false)} title="Create Safety Event">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!safetyForm.summary.trim()) {
              pushToast("Summary is required", "error");
              return;
            }
            if (safetyForm.event_type === "termination" && !safetyForm.termination_reason_id) {
              pushToast("Termination reason is required for termination events", "error");
              return;
            }
            createSafetyEventMutation.mutate();
          }}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">Event type</label>
              <Combobox
                options={SAFETY_EVENT_TYPE_OPTIONS}
                value={safetyForm.event_type}
                onChange={(value) =>
                  setSafetyForm((current) => ({
                    ...current,
                    event_type: ((value ?? "incident") as typeof current.event_type),
                    termination_reason_id: value === "termination" ? current.termination_reason_id : "",
                  }))
                }
                placeholder="Select event type"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">Event date</label>
              <DatePicker
                max={companyToday()}
                value={safetyForm.event_date}
                onChange={(next) => setSafetyForm((current) => ({ ...current, event_date: next }))}
                className={FORM_INPUT_CLASS}
              />
            </div>
            {safetyForm.event_type === "termination" ? (
              <div className="flex flex-col gap-1 md:col-span-2">
                <label className="text-xs font-semibold text-gray-600">Termination reason</label>
                {terminationReasonsQuery.isError ? <ListErrorState status={0} message="Termination reasons could not be loaded." onRetry={() => void terminationReasonsQuery.refetch()} /> : null}
                {/*
                  LST-PICKER-01: ReferenceSelect first-row create → POST catalogs.driver_termination_reasons.
                  Options keyed by UUID (termination_reason_id). Severity on create comes from the form row.
                */}
                <ReferenceSelect
                  value={safetyForm.termination_reason_id || null}
                  onChange={(nextValue) => {
                    const nextId = nextValue ?? "";
                    const selectedReason = terminationReasons.find((reason) => reason.id === nextId);
                    setSafetyForm((current) => ({
                      ...current,
                      termination_reason_id: nextId,
                      severity: selectedReason?.severity ?? current.severity,
                    }));
                  }}
                  options={terminationReasonOptions}
                  createKind="driver_termination_reason"
                  operatingCompanyId={String(driver?.operating_company_id ?? companyId)}
                  createExtras={{ severity: safetyForm.severity }}
                  placeholder="Select reason"
                  loading={terminationReasonsQuery.isLoading}
                  disabled={terminationReasonsQuery.isError}
                  onOptionCreated={() => {
                    void queryClient.invalidateQueries({ queryKey: ["driver-termination-reasons"] });
                  }}
                />
              </div>
            ) : null}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">Severity</label>
              <Combobox
                options={SAFETY_SEVERITY_OPTIONS}
                value={safetyForm.severity}
                disabled={safetyForm.event_type === "termination"}
                onChange={(nextValue) => setSafetyForm((current) => ({ ...current, severity: (nextValue as typeof current.severity) ?? "warning" }))}
                placeholder="Select severity"
              />
            </div>
            <div className="flex flex-col gap-1 md:col-span-2">
              <label className="text-xs font-semibold text-gray-600">Summary</label>
              <input
                value={safetyForm.summary}
                onChange={(event) => setSafetyForm((current) => ({ ...current, summary: event.target.value }))}
                className={FORM_INPUT_CLASS}
                maxLength={500}
              />
            </div>
            <div className="flex flex-col gap-1 md:col-span-2">
              <label className="text-xs font-semibold text-gray-600">Details</label>
              <textarea
                value={safetyForm.details}
                onChange={(event) => setSafetyForm((current) => ({ ...current, details: event.target.value }))}
                className={FORM_TEXTAREA_CLASS}
                rows={4}
                maxLength={5000}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setAddSafetyEventOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={createSafetyEventMutation.isPending}>
              Save event
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(voidTargetEventId)} onClose={() => setVoidTargetEventId(null)} title="Void this safety event?">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (voidReason.trim().length < 10) {
              pushToast("Void reason must be at least 10 characters", "error");
              return;
            }
            voidSafetyEventMutation.mutate();
          }}
        >
          <p className="text-sm text-gray-700">Voided records remain visible for institutional and legal traceability.</p>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Void reason</label>
            <textarea
              value={voidReason}
              onChange={(event) => setVoidReason(event.target.value)}
              className={FORM_TEXTAREA_CLASS}
              rows={4}
              minLength={10}
              maxLength={1000}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setVoidTargetEventId(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" loading={voidSafetyEventMutation.isPending}>
              Void event
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={rateModalOpen}
        onClose={() => setRateModalOpen(false)}
        title={`${driver.first_name} ${driver.last_name} - ${selectedEquipmentName} - ${selectedLineItemName}`}
      >
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!rateChangeForm.amount) {
              pushToast("Enter a new amount", "error");
              return;
            }
            if (rateChangeForm.change_reason === "other" && !rateChangeForm.change_notes.trim()) {
              pushToast("Notes are required when reason is Other", "error");
              return;
            }
            changeRateMutation.mutate({
              driverId: id,
              qualificationId: selectedQualificationId,
              body: {
                line_item_template_id: selectedLineItemId,
                amount: Number(rateChangeForm.amount),
                effective_from: rateChangeForm.effective_from,
                change_reason: rateChangeForm.change_reason as
                  | "initial_hire"
                  | "raise"
                  | "demotion"
                  | "contract_renegotiation"
                  | "annual_adjustment"
                  | "promotion"
                  | "correction"
                  | "other",
                change_notes: rateChangeForm.change_notes || undefined,
              },
            });
          }}
        >
          <div className="text-sm text-gray-700">
            Currently:{" "}
            {selectedRateFromCard?.amount
              ? `$${Number(selectedRateFromCard.amount).toFixed(2)} (since ${formatDate(selectedRateFromCard.effective_from)})`
              : "No current rate"}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">New amount</label>
            <input
              type="number"
              step="0.0001"
              value={rateChangeForm.amount}
              onChange={(event) => setRateChangeForm((current) => ({ ...current, amount: event.target.value }))}
              className={FORM_INPUT_CLASS}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Effective from</label>
            <DatePicker
              value={rateChangeForm.effective_from}
              onChange={(value) => setRateChangeForm((current) => ({ ...current, effective_from: value }))}
              className=""
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Change reason</label>
            <Combobox
              options={RATE_CHANGE_REASON_OPTIONS}
              value={rateChangeForm.change_reason}
              onChange={(nextValue) => setRateChangeForm((current) => ({ ...current, change_reason: nextValue ?? "raise" }))}
              placeholder="Select change reason"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Notes</label>
            <textarea
              value={rateChangeForm.change_notes}
              onChange={(event) => setRateChangeForm((current) => ({ ...current, change_notes: event.target.value }))}
              className={FORM_TEXTAREA_CLASS}
              rows={2}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setRateModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={changeRateMutation.isPending}>
              Submit
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={historyModalOpen} onClose={() => setHistoryModalOpen(false)} title={`Rate history: ${selectedEquipmentName} - ${selectedLineItemName}`}>
        <div className="max-h-[60vh] overflow-auto">
          {historyQuery.isError ? (
            <ListErrorState
              title="Couldn't load rate history"
              status={historyQuery.error instanceof ApiError ? historyQuery.error.status : 0}
              message={(historyQuery.error as Error)?.message}
              onRetry={() => void historyQuery.refetch()}
            />
          ) : (
            <ParityTable<DriverQualificationRateHistoryItem>
              columns={rateHistoryColumns}
              rows={selectedLineHistory}
              rowKey={(item) => `${item.effective_from}-${item.created_at}-${item.amount}-${String(item.was_corrected)}`}
              loading={historyQuery.isLoading}
              rowClassName={(item) => (item.was_corrected ? "bg-gray-100 text-gray-500" : "")}
              storageKey="driver-rate-history"
              tableTestId="driver-rate-history-table"
              emptyText="No rate history found."
            />
          )}
        </div>
      </Modal>

      <ConfirmModal
        open={deactivateConfirmOpen}
        title="Deactivate driver"
        message="Deactivate this driver?"
        confirmLabel="Deactivate"
        danger
        onClose={() => setDeactivateConfirmOpen(false)}
        onConfirm={async () => {
          // Preserve rejection through ConfirmModal: its success path closes this surface, while
          // deactivateMutation.onError already presents the backend failure. Swallowing here made
          // an unchanged active driver look confirmed and removed the operator's retry surface.
          await deactivateMutation.mutateAsync();
        }}
      />

      <Modal open={enableModalOpen} onClose={() => setEnableModalOpen(false)} title="Enable phone login">
        <div className="space-y-4">
          <p className="text-sm text-gray-700">Use phone {maskedPhone} from this driver's record?</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEnableModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => enablePhoneLoginMutation.mutate()} loading={enablePhoneLoginMutation.isPending}>
              Yes
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={reactivateModalOpen} onClose={() => setReactivateModalOpen(false)} title="Reactivate qualification">
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            Reactivate {reactivateTargetQualification?.name || "this qualification"}? The most recent rate per line item will be restored.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setReactivateModalOpen(false);
                setReactivateTargetQualification(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!reactivateTargetQualification) return;
                reactivateQualificationMutation.mutate({
                  driverId: id,
                  qualificationId: reactivateTargetQualification.id,
                });
              }}
              loading={reactivateQualificationMutation.isPending}
            >
              Reactivate
            </Button>
          </div>
        </div>
      </Modal>
      {driver.operating_company_id ? (
        <VendorLinkageModal
          open={qboModalOpen}
          operatingCompanyId={driver.operating_company_id}
          entityType="driver"
          entityId={driver.id}
          entityName={`${driver.first_name} ${driver.last_name}`}
          currentQboVendorId={driver.qbo_vendor_id}
          canManage={isOwner}
          onClose={() => setQboModalOpen(false)}
          onSaved={() => {
            setQboModalOpen(false);
            void queryClient.invalidateQueries({ queryKey: ["driver", id] });
            void queryClient.invalidateQueries({ queryKey: ["qbo-linkage-history", driver.operating_company_id, id] });
            pushToast("QBO linkage updated", "success");
          }}
        />
      ) : null}
    </div>
  );
}
