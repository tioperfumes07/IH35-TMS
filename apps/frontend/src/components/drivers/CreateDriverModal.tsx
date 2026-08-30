import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDateUS } from "../../lib/formatDate";
import { properPersonOrPlaceName } from "../../lib/properDisplayText";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { listMexicoStates, listUsStates } from "../../api/catalogs";
import { ApiError } from "../../api/client";
import { licenseClassesCatalogClient } from "../../api/lists-drivers-catalogs";
import { userFacingApiError } from "../../lib/api-error-message";
import { confirmUpload, listFileCategories, requestUploadUrlFromFile, uploadFileToR2 } from "../../api/docs";
import {
  checkReturningDriver,
  createDriver,
  resendDriverInvite,
  type ReturningDetectionResult,
} from "../../api/mdata";
import { listMyCompanies } from "../../api/org";
import { Button } from "../Button";
import { Combobox } from "../Combobox";
import { ListErrorState } from "../ListErrorState";
import { Modal } from "../Modal";
import { ParityDrawer } from "../parity/ParityDrawer";
import { EntityPicker } from "../parity/EntityPicker";
import { ConfirmModal } from "../shared/ConfirmModal";
import { SelectCombobox } from "../shared/SelectCombobox";
import { StatusBadge } from "../StatusBadge";
import { useToast } from "../Toast";
import { DatePicker } from "../forms/DatePicker";
import { FieldError, fieldErrorClassname } from "../forms/FieldError";
import { FormErrorBanner } from "../forms/FormErrorBanner";
import { SaveDropdown } from "../forms/SaveDropdown";
import { useFormValidation } from "../forms/useFormValidation";
import { useUnsavedChanges } from "../../hooks/useUnsavedChanges";

// SM1 (Safety driver creator): this is the SINGLE, canonical driver-create modal, extracted verbatim
// from pages/Drivers.tsx so BOTH the Drivers module header and the shared DriversListPage (Drivers
// "Profiles" subtab + Safety "Driver Files") open the exact same creator. A second creator must never
// be built — the backend create_driver_with_vendor path (vendor linkage for settlements/QBO) is the
// reason one divergent creator would silently corrupt data (Blueprint 4.2.2.1).

const statusOptions = ["All", "Probation", "Active", "Inactive", "Terminated", "OnLeave"] as const;
const statusFieldComboboxOptions = statusOptions
  .filter((value) => value !== "All")
  .map((value) => ({ value, label: value }));
// DRIVER-CREATE-MODAL-CDL-CLASS-AND-STATUS-HARDCODED-BYPASS-CATALOG: cdl_class used to be fed by a
// hardcoded ["A","B","C"] array bypassing the real, 9-row reference.license_classes catalog entirely
// (6 of 9 seeded codes -- AM/BM/CM/CDL-A/CDL-B/CDL-C -- were unreachable at driver-create time). See
// licenseClassesQuery / cdlClassComboboxOptions below, where the picker now reads the live catalog.
// cdl_class is plain text on mdata.drivers (not DB-enum-constrained) and
// mdata.sync_driver_reference_fks_row's trigger already resolves any matching
// reference.license_classes.code into license_class_id on insert/update -- so widening this picker
// needs no migration and no backend write-path change, only widening the two hardcoded
// z.enum(["A","B","C"]) validators (this file's own form schema + drivers.routes.ts's cdlClassSchema)
// to a bounded free-text field.
const payBasisComboboxOptions = [
  { value: "short_miles", label: "Short Miles" },
  { value: "practical_miles", label: "Practical Miles" },
];

/** LV-DRIVER-CREATE-IS-NOT-A-WIZARD — Create Driver is a stepped wizard, not one flat panel. */
const DRIVER_CREATE_WIZARD_STEPS = [
  { id: 1, label: "Identity & employment" },
  { id: 2, label: "Licenses" },
  { id: 3, label: "Border & emergency" },
  { id: 4, label: "DQ docs & drug screen" },
] as const;

/** LV-DOC-CATEGORIES — DQ upload slots map to catalogs.file_categories.code (seeded + US CDL/medical). */
const DRIVER_CREATE_DOC_CATEGORY_CODES = {
  identity: "identity_document",
  mexican_federal_license: "mexican_federal_license",
  passport: "passport",
  cdl: "cdl",
  medical: "medical_card",
} as const;

type PendingDriverDocKey = keyof typeof DRIVER_CREATE_DOC_CATEGORY_CODES;

function normalizePhoneDigits(value: string) {
  return value.replace(/\D/g, "").slice(-10);
}

const createDriverSchema = z.object({
  operating_company_id: z.string().uuid("operating company is required"),
  first_name: z.string().trim().min(1),
  last_name: z.string().trim().min(1),
  phone_input: z.string().trim().min(1).refine((value) => normalizePhoneDigits(value).length === 10, "phone must have 10 digits"),
  country_code: z.enum(["+1", "+52"]).default("+1"),
  email: z.string().trim().email().optional().or(z.literal("")),
  cdl_number: z.string().trim().optional(),
  cdl_state: z.string().trim().optional(),
  // DRIVER-CREATE-MODAL-CDL-CLASS-AND-STATUS-HARDCODED-BYPASS-CATALOG: was z.enum(["A","B","C"]),
  // rejecting the other 6 real reference.license_classes codes (AM/BM/CM/CDL-A/CDL-B/CDL-C). cdl_class
  // is plain text on mdata.drivers -- bounded free text, matching cdl_number/cdl_state's own schema
  // style in this same file, not re-hardcoding a second copy of the catalog's code list here.
  cdl_class: z.string().trim().min(1).max(20).optional(),
  cdl_expires_at: z.string().optional(),
  hire_date: z.string().optional(),
  // LV-DRIVER-DOB-SILENTLY-DROPPED — column exists on mdata.drivers; create must expose + submit it.
  date_of_birth: z.string().optional(),
  pay_basis: z.enum(["short_miles", "practical_miles"]).default("short_miles"),
  dot_medical_expires_at: z.string().optional(),
  visa_type: z.string().trim().optional(),
  visa_number: z.string().trim().optional(),
  visa_expires_at: z.string().optional(),
  passport_number: z.string().trim().optional(),
  passport_expires_at: z.string().optional(),
  passport_country: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || /^[A-Za-z]{2}$/.test(value), "passport country must be a 2-letter code"),
  mexican_license_number: z.string().trim().optional(),
  mexican_license_expiration: z.string().optional(),
  ine_number: z.string().trim().optional(),
  curp: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || /^[A-Z0-9]{18}$/i.test(value), "CURP must be 18 alphanumeric characters"),
  mx_address_line1: z.string().trim().optional(),
  mx_address_line2: z.string().trim().optional(),
  mx_city: z.string().trim().optional(),
  mx_state: z.string().trim().optional(),
  mx_postal_code: z.string().trim().optional(),
  emergency_contact_name: z.string().trim().optional(),
  emergency_contact_relationship: z.string().trim().optional(),
  emergency_contact_phone_primary: z.string().trim().optional(),
  emergency_contact_phone_alternate: z.string().trim().optional(),
  emergency_contact_address: z.string().trim().optional(),
  emergency_contact_notes: z.string().trim().optional(),
  referred_by_driver_id: z.string().uuid().optional().or(z.literal("")),
  referral_source: z.string().trim().max(160).optional(),
  status: z.enum(["Probation", "Active", "Inactive", "Terminated", "OnLeave"]).default("Probation"),
});

const DRIVER_CREATE_FORM_INITIAL: Record<string, string> = {
  operating_company_id: "",
  first_name: "",
  last_name: "",
  phone_input: "",
  country_code: "+1",
  email: "",
  cdl_number: "",
  cdl_state: "",
  cdl_class: "A",
  cdl_expires_at: "",
  hire_date: "",
  date_of_birth: "",
  pay_basis: "short_miles",
  dot_medical_expires_at: "",
  visa_type: "",
  visa_number: "",
  visa_expires_at: "",
  passport_number: "",
  passport_expires_at: "",
  passport_country: "",
  mexican_license_number: "",
  mexican_license_expiration: "",
  ine_number: "",
  curp: "",
  mx_address_line1: "",
  mx_address_line2: "",
  mx_city: "",
  mx_state: "",
  mx_postal_code: "",
  emergency_contact_name: "",
  emergency_contact_relationship: "",
  emergency_contact_phone_primary: "",
  emergency_contact_phone_alternate: "",
  emergency_contact_address: "",
  emergency_contact_notes: "",
  referred_by_driver_id: "",
  referral_source: "",
  status: "Probation",
};

type DriverCreateModalSnapshot = {
  form: Record<string, string>;
  showMexicanIdentity: boolean;
  showVisaEmergency: boolean;
  overrideReturningWarning: boolean;
  rehireAction: "rehire" | "new";
  selectedPriorDriverId: string | null;
};

function getDetectionSeverityClass(detection: ReturningDetectionResult | null) {
  if (!detection) return "border-gray-300 bg-gray-50 text-gray-800";
  if (detection.severity_summary.severe_count > 0) return "border-red-300 bg-red-50 text-red-900";
  if (detection.severity_summary.warning_count > 0) return "border-slate-300 bg-slate-100 text-slate-800";
  return "border-slate-300 bg-slate-100 text-slate-700";
}

type CreateDriverModalProps = {
  open: boolean;
  companyId?: string | null;
  onClose: () => void;
  /**
   * Fired after a driver is successfully created. When provided (e.g. the Safety Driver-Files surface
   * passes DriversListPage's onOpenProfile), the caller decides where to send the user — the new DQF
   * profile. When omitted (Drivers module), the success summary modal's "View Driver" routes to
   * /drivers/:id instead.
   */
  onCreated?: (driverId: string, displayName: string) => void;
  /**
   * CHROME-11: this is the SAME single canonical driver creator (Blueprint 4.2.2.1) for every call
   * site — only the outer chrome changes. Top-level entry points (Drivers module, Safety Driver
   * Files, Cash-advance inline create) keep the default centered `Modal`. Nested call sites that
   * open this ON TOP OF an already-open money `ParityDrawer` (e.g. VendorBillForm's "+ Create
   * driver") MUST pass `shell="drawer"` so the create panel stacks as a right ParityDrawer instead
   * of a centered Modal-on-drawer.
   */
  shell?: "modal" | "drawer";
};

export function CreateDriverModal({ open, companyId, onClose, onCreated, shell = "modal" }: CreateDriverModalProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const [wizardStep, setWizardStep] = useState(1);
  const [drugScreenAcknowledged, setDrugScreenAcknowledged] = useState(false);
  const [pendingDocs, setPendingDocs] = useState<Partial<Record<PendingDriverDocKey, File>>>({});
  const fileCategoriesQuery = useQuery({
    queryKey: ["file-categories", "driver-create"],
    queryFn: () => listFileCategories("driver").then((result) => result.categories.filter((c) => c.is_active)),
    enabled: open,
  });
  const categoryIdByCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const cat of fileCategoriesQuery.data ?? []) {
      map.set(cat.code, cat.id);
    }
    return map;
  }, [fileCategoriesQuery.data]);
  const pendingDocEntries = Object.entries(pendingDocs) as Array<[PendingDriverDocKey, File]>;
  const hasPendingDocs = pendingDocEntries.length > 0;
  const missingPendingDocCategory = pendingDocEntries.find(([key]) => {
    const code = DRIVER_CREATE_DOC_CATEGORY_CODES[key];
    return !categoryIdByCode.has(code);
  });
  const pendingDocCategoriesUnavailable =
    hasPendingDocs &&
    (fileCategoriesQuery.isError || !fileCategoriesQuery.isSuccess || Boolean(missingPendingDocCategory));
  const [showMexicanIdentity, setShowMexicanIdentity] = useState(true);
  const [showVisaEmergency, setShowVisaEmergency] = useState(true);
  const [returningDetection, setReturningDetection] = useState<ReturningDetectionResult | null>(null);
  const [returningCheckLoading, setReturningCheckLoading] = useState(false);
  const [returningCheckError, setReturningCheckError] = useState<unknown>(null);
  const [returningCheckRetry, setReturningCheckRetry] = useState(0);
  const [overrideReturningWarning, setOverrideReturningWarning] = useState(false);
  const [rehireAction, setRehireAction] = useState<"rehire" | "new">("rehire");
  const [selectedPriorDriverId, setSelectedPriorDriverId] = useState<string | null>(null);
  const [invitePending, setInvitePending] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);
  const [inviteConfirmOpen, setInviteConfirmOpen] = useState(false);
  const [createSummary, setCreateSummary] = useState<{
    driver_id: string;
    display_name: string;
    phone: string;
    invite_url: string;
    linked_user_event_type: "existing_user" | "new_user_created";
  } | null>(null);
  const [form, setForm] = useState<Record<string, string>>(() => ({ ...DRIVER_CREATE_FORM_INITIAL }));
  // The canonical API requires first name, last name, and an E.164 phone. Keep those requirements
  // on the identity step instead of letting an incomplete draft reach step 4 and fail as a generic
  // backend "Invalid input" with the actual field errors hidden three steps behind the operator.
  const identityStepReady = Boolean(
    form.operating_company_id &&
      form.first_name.trim() &&
      form.last_name.trim() &&
      normalizePhoneDigits(form.phone_input).length === 10
  );

  const driverCreateAttemptCloseRef = useRef<(() => void) | null>(null);
  const saveModeRef = useRef<"default" | "add_another">("default");
  const companyGenerationRef = useRef(0);
  const inviteGenerationRef = useRef(0);
  const [driverCreateBaseline, setDriverCreateBaseline] = useState<DriverCreateModalSnapshot | null>(null);

  const driverCreateSnapshot = useMemo(
    (): DriverCreateModalSnapshot => ({
      form: { ...form },
      showMexicanIdentity,
      showVisaEmergency,
      overrideReturningWarning,
      rehireAction,
      selectedPriorDriverId,
    }),
    [form, showMexicanIdentity, showVisaEmergency, overrideReturningWarning, rehireAction, selectedPriorDriverId]
  );
  const { isDirty: isDriverCreateDirty } = useUnsavedChanges(driverCreateSnapshot, driverCreateBaseline ?? driverCreateSnapshot);

  // Reset the whole create flow every time the modal opens (was pages/Drivers.tsx openDriverCreate()).
  useEffect(() => {
    companyGenerationRef.current += 1;
    if (!open) return;
    setForm({ ...DRIVER_CREATE_FORM_INITIAL });
    setWizardStep(1);
    setDrugScreenAcknowledged(false);
    setPendingDocs({});
    setShowMexicanIdentity(true);
    setShowVisaEmergency(true);
    setReturningDetection(null);
    setReturningCheckLoading(false);
    setReturningCheckError(null);
    setReturningCheckRetry(0);
    setOverrideReturningWarning(false);
    setRehireAction("rehire");
    setSelectedPriorDriverId(null);
    setInvitePending(false);
    setInviteSent(false);
    setInviteConfirmOpen(false);
    inviteGenerationRef.current += 1;
    saveModeRef.current = "default";
    setDriverCreateBaseline(null);
  }, [open, companyId]);

  useEffect(() => {
    if (open) return;
    setDriverCreateBaseline(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const curp = form.curp?.trim().toUpperCase() ?? "";
    const cdlNumber = form.cdl_number?.trim().toUpperCase() ?? "";
    const cdlState = form.cdl_state?.trim().toUpperCase() ?? "";
    const hasCurp = curp.length === 18;
    const hasCdlPair = cdlNumber.length > 0 && cdlState.length > 0;

    if (!hasCurp && !hasCdlPair) {
      setReturningDetection(null);
      setOverrideReturningWarning(false);
      setReturningCheckLoading(false);
      setReturningCheckError(null);
      return;
    }

    let cancelled = false;
    setReturningCheckLoading(true);
    setReturningCheckError(null);
    const timeout = window.setTimeout(async () => {
      try {
        const result = await checkReturningDriver(hasCurp ? curp : undefined, hasCdlPair ? cdlNumber : undefined, hasCdlPair ? cdlState : undefined);
        if (cancelled) return;
        setReturningDetection(result.returning_driver ? result : null);
        if (!result.returning_driver) setOverrideReturningWarning(false);
      } catch (error) {
        if (!cancelled) {
          setReturningDetection(null);
          setOverrideReturningWarning(false);
          setReturningCheckError(error);
        }
      } finally {
        if (!cancelled) setReturningCheckLoading(false);
      }
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [open, form.curp, form.cdl_number, form.cdl_state, returningCheckRetry]);

  const usStatesQuery = useQuery({
    queryKey: ["catalogs", "us-states"],
    queryFn: () => listUsStates().then((result) => result.states),
  });

  const mexicoStatesQuery = useQuery({
    queryKey: ["catalogs", "mexico-states"],
    queryFn: () => listMexicoStates().then((result) => result.states),
  });

  const companiesQuery = useQuery({
    queryKey: ["org", "my-companies"],
    queryFn: () => listMyCompanies().then((result) => result.companies),
  });
  const activeCompanies = useMemo(
    () => (companiesQuery.data ?? []).filter((company) => company.is_active),
    [companiesQuery.data]
  );

  useEffect(() => {
    if (!open) return;
    if (form.operating_company_id) return;
    // Seed the operating company from the caller's selected entity (SM1), else the user's default company.
    const seed =
      companyId ||
      (activeCompanies.find((company) => company.is_default) ?? activeCompanies[0])?.id;
    if (!seed) return;
    setForm((current) => ({ ...current, operating_company_id: seed }));
  }, [open, companyId, activeCompanies, form.operating_company_id]);

  useEffect(() => {
    if (!open || driverCreateBaseline !== null) return;
    const hasCompanies = activeCompanies.length > 0;
    if (hasCompanies && !form.operating_company_id) return;
    setDriverCreateBaseline(driverCreateSnapshot);
  }, [open, driverCreateBaseline, form.operating_company_id, activeCompanies, driverCreateSnapshot]);

  const terminatedMatches = useMemo(() => {
    const deduped = new Map<
      string,
      {
        driverId: string;
        label: string;
        eventDate: string;
      }
    >();
    for (const event of returningDetection?.matched_events ?? []) {
      if (event.matched_driver_status !== "Terminated") continue;
      const previous = deduped.get(event.matched_driver_id);
      if (previous && previous.eventDate >= event.event_date) continue;
      const reason = event.termination_reason?.code ?? "termination";
      deduped.set(event.matched_driver_id, {
        driverId: event.matched_driver_id,
        eventDate: event.event_date,
        label: `${event.matched_driver_name} - terminated ${event.event_date} (${reason})`,
      });
    }
    return Array.from(deduped.values());
  }, [returningDetection]);

  useEffect(() => {
    if (!returningDetection?.returning_driver) {
      setRehireAction("rehire");
      setSelectedPriorDriverId(null);
      return;
    }
    if (terminatedMatches.length === 0) {
      setRehireAction("new");
      setSelectedPriorDriverId(null);
      return;
    }
    setRehireAction("rehire");
    setSelectedPriorDriverId((current) => current ?? terminatedMatches[0]?.driverId ?? null);
  }, [returningDetection, terminatedMatches]);

  // CC3TEST-DRIVER-CREATE-SAVE-DISABLED-NO-REASON: Save's `disabled` prop below ORs together five
  // independent gates, but nothing surfaced WHICH one was blocking -- live-reproduced clicking Save
  // on step 4 with the drug-screen checkbox unchecked did nothing at all: zero network requests, zero
  // console output, zero visible change (confirmed via window.fetch instrumentation). An operator with
  // no reason shown reads that as a broken button, not a missing checkbox. Mirrors the `disabled`
  // condition's branch order exactly so the reason always matches the actual blocking gate.
  const saveDisabledReason = !identityStepReady
    ? "Missing a required Step 1 field (operating company, first/last name, or a valid 10-digit phone)."
    : !drugScreenAcknowledged
      ? 'Check "Pre-employment drug screen ordered / result on file" above to enable Save.'
      : returningDetection?.returning_driver && !overrideReturningWarning
        ? "Acknowledge the returning-driver detection above to enable Save."
        : overrideReturningWarning && rehireAction === "rehire" && terminatedMatches.length > 0 && !selectedPriorDriverId
          ? 'Select the prior driver record to link, or choose "Treat as a new hire" instead.'
          : pendingDocCategoriesUnavailable
            ? "Document categories are unavailable. Retry the category list or remove the staged files before saving."
          : returningCheckError
            ? "Returning-driver identity check failed. Retry it before saving this driver."
          : returningCheckLoading
            ? "Checking for a matching returning-driver record…"
            : undefined;

  const createMutation = useMutation({
    mutationFn: (input: {
      generation: number;
      payload: Parameters<typeof createDriver>[0];
      pendingDocs: Array<[PendingDriverDocKey, File]>;
      categoryIds: Record<string, string>;
      saveMode: "default" | "add_another";
    }) => createDriver(input.payload),
    onSuccess: async (created, input) => {
      const displayName = [input.payload.first_name, input.payload.last_name].filter(Boolean).join(" ").trim() || "Driver unavailable";
      queryClient.invalidateQueries({ queryKey: ["drivers"] });

      // DQ docs staged on wizard step 4 upload after the driver row exists (entity_links need driver id).
      const opco = created.operating_company_id || input.payload.operating_company_id;
      for (const [key, file] of input.pendingDocs) {
        if (!file) continue;
        try {
          const code = DRIVER_CREATE_DOC_CATEGORY_CODES[key];
          const categoryId = input.categoryIds[code];
          const { file_id, presigned_url } = await requestUploadUrlFromFile(file, {
            operating_company_id: opco || undefined,
            category_id: categoryId,
            entity_links: [{ entity_type: "driver", entity_id: created.id }],
          });
          await uploadFileToR2(presigned_url, file, file.type || "application/octet-stream");
          await confirmUpload(file_id);
        } catch (err) {
          if (input.generation === companyGenerationRef.current) {
            pushToast(userFacingApiError(err, `Driver created; could not upload ${key} document`), "error");
          }
        }
      }

      if (input.generation !== companyGenerationRef.current) return;
      if (input.saveMode === "add_another") {
        pushToast("Driver created. No invite sent yet.", "success");
        setForm({ ...DRIVER_CREATE_FORM_INITIAL });
        setWizardStep(1);
        setDrugScreenAcknowledged(false);
        setPendingDocs({});
        setShowMexicanIdentity(true);
        setShowVisaEmergency(true);
        setReturningDetection(null);
        setOverrideReturningWarning(false);
        setRehireAction("rehire");
        setSelectedPriorDriverId(null);
        setDriverCreateBaseline(null);
        return;
      }
      onClose();
      inviteGenerationRef.current += 1;
      setInvitePending(false);
      setInviteSent(false);
      setInviteConfirmOpen(false);
      setCreateSummary({
        driver_id: created.id,
        display_name: displayName,
        phone: created.phone,
        invite_url: created.invite_url,
        linked_user_event_type: created.linked_user_event_type,
      });
      pushToast("Driver created. No invite sent yet.", "success");
      setForm({ ...DRIVER_CREATE_FORM_INITIAL });
      setWizardStep(1);
      setDrugScreenAcknowledged(false);
      setPendingDocs({});
      setShowMexicanIdentity(true);
      setShowVisaEmergency(true);
      setReturningDetection(null);
      setOverrideReturningWarning(false);
      setRehireAction("rehire");
      setSelectedPriorDriverId(null);
      // Surface-specific landing (Safety Driver Files → open the new DQF profile in place).
      if (onCreated) onCreated(created.id, displayName);
    },
  });

  const {
    fieldErrors: driverFieldErrors,
    apiError: driverApiError,
    submit: submitDriverCreate,
    clearFieldError: clearDriverFieldError,
    resetErrors: resetDriverCreateErrors,
  } = useFormValidation({
    schema: createDriverSchema,
    interceptApiError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        const detectionPayload = error.data as ReturningDetectionResult & { error?: string };
        if (detectionPayload?.error === "returning_driver_detected") {
          setReturningDetection({
            returning_driver: true,
            matched_events: detectionPayload.matched_events ?? [],
            severity_summary: detectionPayload.severity_summary ?? { severe_count: 0, warning_count: 0, info_count: 0 },
          });
          setOverrideReturningWarning(false);
          setRehireAction("rehire");
          setSelectedPriorDriverId(null);
          pushToast("Returning driver records found. Review and confirm override.", "error");
          return true;
        }
      }
      const errorPayload = error instanceof ApiError && error.data && typeof error.data === "object" ? (error.data as { error?: string }) : null;
      if (error instanceof ApiError && error.status === 400 && errorPayload?.error === "operating_company_not_found") {
        pushToast("Select an active operating company", "error");
        return true;
      }
      return false;
    },
    onSubmit: async (parsed) => {
      const normalizedPhone = `${parsed.country_code}${normalizePhoneDigits(parsed.phone_input)}`;
      const shouldLinkRehire =
        Boolean(returningDetection?.returning_driver) &&
        overrideReturningWarning &&
        rehireAction === "rehire" &&
        Boolean(selectedPriorDriverId);
      const generation = companyGenerationRef.current;
      const payload = {
        operating_company_id: parsed.operating_company_id,
        first_name: properPersonOrPlaceName(parsed.first_name),
        last_name: properPersonOrPlaceName(parsed.last_name),
        phone: normalizedPhone,
        email: parsed.email || undefined,
        cdl_number: parsed.cdl_number || undefined,
        cdl_state: parsed.cdl_state || undefined,
        cdl_class: parsed.cdl_class,
        cdl_expires_at: parsed.cdl_expires_at || undefined,
        hire_date: parsed.hire_date || undefined,
        date_of_birth: parsed.date_of_birth || undefined,
        pay_basis: parsed.pay_basis,
        dot_medical_expires_at: parsed.dot_medical_expires_at || undefined,
        visa_type: parsed.visa_type || undefined,
        visa_number: parsed.visa_number || undefined,
        visa_expires_at: parsed.visa_expires_at || undefined,
        passport_number: parsed.passport_number || undefined,
        passport_expires_at: parsed.passport_expires_at || undefined,
        passport_country: parsed.passport_country
          ? parsed.passport_country.trim().toUpperCase()
          : undefined,
        mexican_license_number: parsed.mexican_license_number || undefined,
        mexican_license_expiration: parsed.mexican_license_expiration || undefined,
        ine_number: parsed.ine_number || undefined,
        curp: parsed.curp || undefined,
        mx_address_line1: parsed.mx_address_line1 ? properPersonOrPlaceName(parsed.mx_address_line1) : undefined,
        mx_address_line2: parsed.mx_address_line2 ? properPersonOrPlaceName(parsed.mx_address_line2) : undefined,
        mx_city: parsed.mx_city ? properPersonOrPlaceName(parsed.mx_city) : undefined,
        mx_state: parsed.mx_state || undefined,
        mx_postal_code: parsed.mx_postal_code || undefined,
        emergency_contact_name: parsed.emergency_contact_name
          ? properPersonOrPlaceName(parsed.emergency_contact_name)
          : undefined,
        emergency_contact_relationship: parsed.emergency_contact_relationship || undefined,
        emergency_contact_phone_primary: parsed.emergency_contact_phone_primary || undefined,
        emergency_contact_phone_alternate: parsed.emergency_contact_phone_alternate || undefined,
        emergency_contact_address: parsed.emergency_contact_address
          ? properPersonOrPlaceName(parsed.emergency_contact_address)
          : undefined,
        emergency_contact_notes: parsed.emergency_contact_notes || undefined,
        referred_by_driver_id: parsed.referred_by_driver_id || undefined,
        referral_source: parsed.referral_source || undefined,
        status: parsed.status,
        override_returning_warning: returningDetection?.returning_driver ? overrideReturningWarning : undefined,
        is_rehire: shouldLinkRehire ? true : undefined,
        prior_driver_id: shouldLinkRehire ? selectedPriorDriverId ?? undefined : undefined,
      };
      try {
        await createMutation.mutateAsync({
          generation,
          payload,
          pendingDocs: [...pendingDocEntries],
          categoryIds: Object.fromEntries(categoryIdByCode),
          saveMode: saveModeRef.current,
        });
      } catch (error) {
        if (generation !== companyGenerationRef.current) return;
        throw error;
      }
    },
  });

  // DRIVER-CREATE-MODAL-CDL-CLASS-AND-STATUS-HARDCODED-BYPASS-CATALOG: read the live, canonical
  // reference.license_classes catalog (same table/query key shape as /lists/drivers/license-classes)
  // instead of the removed hardcoded ["A","B","C"] array.
  const licenseClassesQuery = useQuery({
    queryKey: ["catalogs", "driver-license-classes"],
    queryFn: () => licenseClassesCatalogClient.list({}).then((result) => result.rows.filter((row) => !row.archived_at)),
    enabled: open,
  });
  const cdlClassComboboxOptions = useMemo(
    () => (licenseClassesQuery.data ?? []).map((row) => ({ value: row.code, label: row.label })),
    [licenseClassesQuery.data]
  );
  const [licenseClassCreateOpen, setLicenseClassCreateOpen] = useState(false);
  const [newLicenseClassCode, setNewLicenseClassCode] = useState("");
  const [newLicenseClassLabel, setNewLicenseClassLabel] = useState("");
  const [savingLicenseClass, setSavingLicenseClass] = useState(false);
  const saveNewLicenseClass = useCallback(async () => {
    if (!newLicenseClassCode.trim() || !newLicenseClassLabel.trim()) return;
    setSavingLicenseClass(true);
    try {
      const created = await licenseClassesCatalogClient.create({
        code: newLicenseClassCode.trim(),
        label: newLicenseClassLabel.trim(),
      });
      await queryClient.invalidateQueries({ queryKey: ["catalogs", "driver-license-classes"] });
      clearDriverFieldError("cdl_class");
      setForm((current) => ({ ...current, cdl_class: created.code }));
      setLicenseClassCreateOpen(false);
      setNewLicenseClassCode("");
      setNewLicenseClassLabel("");
    } catch (err) {
      pushToast(userFacingApiError(err), "error");
    } finally {
      setSavingLicenseClass(false);
    }
  }, [newLicenseClassCode, newLicenseClassLabel, queryClient, pushToast, clearDriverFieldError]);

  const runDriverCreateSave = useCallback(
    (mode: "default" | "add_another") => {
      if (pendingDocCategoriesUnavailable) {
        pushToast("Document categories are unavailable. Retry before saving staged files.", "error");
        return;
      }
      if (returningCheckError) {
        pushToast("Returning-driver identity check failed. Retry before saving.", "error");
        return;
      }
      saveModeRef.current = mode;
      void submitDriverCreate(form as z.infer<typeof createDriverSchema>);
    },
    [form, pendingDocCategoriesUnavailable, pushToast, returningCheckError, submitDriverCreate]
  );

  const closeCreateSummary = useCallback(() => {
    inviteGenerationRef.current += 1;
    setInvitePending(false);
    setInviteSent(false);
    setInviteConfirmOpen(false);
    setCreateSummary(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    resetDriverCreateErrors();
  }, [open, companyId, resetDriverCreateErrors]);

  const driverCreateForm = (
    <form
      className="grid grid-cols-1 gap-3 md:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        // INLINE-CREATE-NESTED-FORM: React bubbles across portal into Book Load's outer <form>.
        event.stopPropagation();
      }}
    >
          <div className="col-span-full">
            <FormErrorBanner message={driverApiError} />
          </div>
          <div
            className="col-span-full space-y-2 rounded-sm border border-slate-200 bg-slate-50 p-3"
            data-testid="driver-create-wizard"
          >
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Step {wizardStep} of {DRIVER_CREATE_WIZARD_STEPS.length}
            </div>
            <div className="flex flex-wrap gap-2" role="list" aria-label="Create driver steps">
              {DRIVER_CREATE_WIZARD_STEPS.map((step) => (
                <span
                  key={step.id}
                  role="listitem"
                  data-testid={`driver-create-step-${step.id}`}
                  data-active={wizardStep === step.id ? "true" : "false"}
                  className={
                    wizardStep === step.id
                      ? "rounded-sm bg-slate-800 px-2 py-1 text-xs font-semibold text-white"
                      : "rounded-sm bg-white px-2 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200"
                  }
                >
                  {`${step.id}. ${step.label}`}
                </span>
              ))}
            </div>
          </div>
          {wizardStep === 1 ? (
          <>
          <div className="col-span-full flex flex-col gap-1">
            <label htmlFor="operating_company_id" className="text-xs font-semibold text-gray-600">Operating Company</label>
            {companiesQuery.isError ? (
              <ListErrorState
                title="Couldn't load operating companies"
                status={0}
                message={companiesQuery.error instanceof Error ? companiesQuery.error.message : undefined}
                onRetry={() => void companiesQuery.refetch()}
                className="rounded-sm border border-slate-200 bg-slate-50 py-4"
              />
            ) : null}
            <Combobox
              id="operating_company_id"
              dataTestId="driver-create-operating-company"
              dataField="operating_company_id"
              options={activeCompanies.map((company) => ({
                value: company.id,
                label: `${company.code} - ${company.short_name || company.legal_name}`,
                sublabel: company.legal_name,
              }))}
              value={form.operating_company_id || null}
              onChange={(nextValue) => {
                clearDriverFieldError("operating_company_id");
                setForm((current) => ({ ...current, operating_company_id: nextValue ?? "" }));
              }}
              placeholder="Select operating company"
              loading={companiesQuery.isLoading}
              disabled={companiesQuery.isError}
              error={driverFieldErrors.operating_company_id}
            />
            <FieldError id="operating_company_id" message={driverFieldErrors.operating_company_id} />
          </div>
          {[
            ["first_name", "First Name *"],
            ["last_name", "Last Name *"],
            ["email", "Email"],
            ["date_of_birth", "Date of birth"],
            ["hire_date", "Hire Date"],
            ["dot_medical_expires_at", "DOT Medical Expires"],
          ].map(([key, label]) => (
            <div key={key} className="flex flex-col gap-1">
              <label htmlFor={key} className="text-xs font-semibold text-gray-600">{label}</label>
              {key.includes("date") || key.includes("expires") ? (
                <DatePicker
                  id={key}
                  data-testid={key}
                  value={form[key] ?? ""}
                  onChange={(value) => {
                    clearDriverFieldError(key);
                    setForm((current) => ({ ...current, [key]: value }));
                  }}
                  className={fieldErrorClassname(Boolean(driverFieldErrors[key]), "rounded-sm border h-9 px-2 text-[13px]")}
                />
              ) : (
                <input
                  id={key}
                  data-field={key}
                  type="text"
                  required={key === "first_name" || key === "last_name"}
                  value={form[key] ?? ""}
                  aria-describedby={driverFieldErrors[key] ? `${key}-error` : undefined}
                  onChange={(event) => {
                    clearDriverFieldError(key);
                    setForm((current) => ({ ...current, [key]: event.target.value }));
                  }}
                  className={fieldErrorClassname(Boolean(driverFieldErrors[key]), "rounded-sm border h-9 px-2 text-[13px]")}
                />
              )}
              <FieldError id={key} message={driverFieldErrors[key]} />
            </div>
          ))}
          <div className="flex flex-col gap-1">
            <label htmlFor="cdl_state" className="text-xs font-semibold text-gray-600">CDL State</label>
            {usStatesQuery.isError ? (
              <ListErrorState
                title="Couldn't load US states"
                status={0}
                message={usStatesQuery.error instanceof Error ? usStatesQuery.error.message : undefined}
                onRetry={() => void usStatesQuery.refetch()}
                className="rounded-sm border border-slate-200 bg-slate-50 py-4"
              />
            ) : null}
            <Combobox
              id="cdl_state"
              dataTestId="driver-create-cdl-state"
              dataField="cdl_state"
              options={(usStatesQuery.data ?? []).map((state) => ({
                value: state.code,
                label: `${state.code} - ${state.name}`,
                sublabel: state.region,
              }))}
              value={form.cdl_state || null}
              onChange={(nextValue) => {
                clearDriverFieldError("cdl_state");
                setForm((current) => ({ ...current, cdl_state: nextValue ?? "" }));
              }}
              placeholder="Select US state"
              loading={usStatesQuery.isLoading}
              disabled={usStatesQuery.isError}
              error={driverFieldErrors.cdl_state}
            />
            <FieldError id="cdl_state" message={driverFieldErrors.cdl_state} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="country_code" className="text-xs font-semibold text-gray-600">Country</label>
            <SelectCombobox
              id="country_code"
              data-field="country_code"
              value={form.country_code}
              aria-describedby={driverFieldErrors.country_code ? "country_code-error" : undefined}
              onChange={(event) => {
                clearDriverFieldError("country_code");
                setForm((current) => ({ ...current, country_code: event.target.value }));
              }}
              className={fieldErrorClassname(Boolean(driverFieldErrors.country_code), "rounded-sm border h-9 px-2 text-[13px]")}
            >
              <option value="+1">US (+1)</option>
              <option value="+52">Mexico (+52)</option>
            </SelectCombobox>
            <FieldError id="country_code" message={driverFieldErrors.country_code} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="phone_input" className="text-xs font-semibold text-gray-600">Phone (10 digits) *</label>
            <input
              id="phone_input"
              data-field="phone_input"
              required
              value={form.phone_input}
              aria-describedby={driverFieldErrors.phone_input ? "phone_input-error" : undefined}
              onChange={(event) => {
                clearDriverFieldError("phone_input");
                setForm((current) => ({ ...current, phone_input: event.target.value }));
              }}
              className={fieldErrorClassname(Boolean(driverFieldErrors.phone_input), "rounded-sm border h-9 px-2 text-[13px]")}
              placeholder="(956) 555-0001"
            />
            <FieldError id="phone_input" message={driverFieldErrors.phone_input} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="cdl_class" className="text-xs font-semibold text-gray-600">CDL Class</label>
            <Combobox
              id="cdl_class"
              dataTestId="driver-create-cdl-class"
              dataField="cdl_class"
              options={cdlClassComboboxOptions}
              value={form.cdl_class || null}
              onChange={(nextValue) => {
                clearDriverFieldError("cdl_class");
                setForm((current) => ({ ...current, cdl_class: nextValue ?? "" }));
              }}
              placeholder="Select CDL class"
              error={driverFieldErrors.cdl_class}
              allowAddNew={{
                label: "+ Add new license class",
                onAdd: () => setLicenseClassCreateOpen(true),
              }}
            />
            <FieldError id="cdl_class" message={driverFieldErrors.cdl_class} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="status" className="text-xs font-semibold text-gray-600">Status</label>
            <Combobox
              id="status"
              dataTestId="driver-create-status"
              dataField="status"
              options={statusFieldComboboxOptions}
              value={form.status || null}
              onChange={(nextValue) => {
                clearDriverFieldError("status");
                setForm((current) => ({ ...current, status: nextValue ?? "" }));
              }}
              placeholder="Select status"
              error={driverFieldErrors.status}
            />
            <FieldError id="status" message={driverFieldErrors.status} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="pay_basis" className="text-xs font-semibold text-gray-600">Pay Basis</label>
            <Combobox
              id="pay_basis"
              dataTestId="driver-create-pay-basis"
              dataField="pay_basis"
              options={payBasisComboboxOptions}
              value={form.pay_basis || null}
              onChange={(nextValue) => {
                clearDriverFieldError("pay_basis");
                setForm((current) => ({ ...current, pay_basis: nextValue ?? "" }));
              }}
              placeholder="Select pay basis"
              error={driverFieldErrors.pay_basis}
            />
            <FieldError id="pay_basis" message={driverFieldErrors.pay_basis} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Referred by driver</label>
            <EntityPicker
              kind="driver"
              operatingCompanyId={form.operating_company_id}
              value={form.referred_by_driver_id || null}
              onChange={(value) => setForm((current) => ({ ...current, referred_by_driver_id: value ?? "" }))}
              allowCreate={false}
              enabled={Boolean(form.operating_company_id)}
              placeholder="Select referring driver"
              dataField="referred_by_driver_id"
              dataTestId="driver-create-referrer"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="referral_source" className="text-xs font-semibold text-gray-600">Referral source</label>
            <input
              id="referral_source"
              value={form.referral_source}
              onChange={(event) => setForm((current) => ({ ...current, referral_source: event.target.value }))}
              className="rounded-sm border h-9 px-2 text-[13px]"
              placeholder="Driver referral, recruiting event, website…"
            />
          </div>

          </>
          ) : null}

          {wizardStep === 2 ? (
          <>
          {[
            ["cdl_number", "CDL #"],
            ["cdl_expires_at", "CDL Expires"],
          ].map(([key, label]) => (
            <div key={key} className="flex flex-col gap-1">
              <label htmlFor={key} className="text-xs font-semibold text-gray-600">{label}</label>
              {key.includes("date") || key.includes("expires") ? (
                <DatePicker
                  id={key}
                  data-testid={key}
                  value={form[key] ?? ""}
                  onChange={(value) => {
                    clearDriverFieldError(key);
                    setForm((current) => ({ ...current, [key]: value }));
                  }}
                  className={fieldErrorClassname(Boolean(driverFieldErrors[key]), "rounded-sm border h-9 px-2 text-[13px]")}
                />
              ) : (
                <input
                  id={key}
                  data-field={key}
                  type="text"
                  value={form[key] ?? ""}
                  aria-describedby={driverFieldErrors[key] ? `${key}-error` : undefined}
                  onChange={(event) => {
                    clearDriverFieldError(key);
                    setForm((current) => ({ ...current, [key]: event.target.value }));
                  }}
                  className={fieldErrorClassname(Boolean(driverFieldErrors[key]), "rounded-sm border h-9 px-2 text-[13px]")}
                />
              )}
              <FieldError id={key} message={driverFieldErrors[key]} />
            </div>
          ))}
          <div className="col-span-full space-y-2 rounded-md border border-gray-200 p-3">
            <button
              type="button"
              onClick={() => setShowMexicanIdentity((value) => !value)}
              className="w-full text-left text-sm font-semibold text-gray-700"
            >
              Mexican Identity (optional) {showMexicanIdentity ? "▲" : "▼"}
            </button>
            {showMexicanIdentity ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {[
                  ["ine_number", "INE Number"],
                  ["curp", "CURP"],
                  ["mexican_license_number", "Mexican license #"],
                  ["mexican_license_expiration", "Mexican license expires"],
                  ["mx_address_line1", "MX Address Line 1"],
                  ["mx_address_line2", "MX Address Line 2"],
                  ["mx_city", "MX City"],
                  ["mx_postal_code", "MX Postal Code"],
                ].map(([key, label]) => (
                  <div key={key} className="flex flex-col gap-1">
                    <label htmlFor={key} className="text-xs font-semibold text-gray-600">{label}</label>
                    {key.includes("expiration") || key.includes("expires") ? (
                      <DatePicker
                        id={key}
                        data-testid={key}
                        value={form[key] ?? ""}
                        onChange={(value) => {
                          clearDriverFieldError(key);
                          setForm((current) => ({ ...current, [key]: value }));
                        }}
                        className={fieldErrorClassname(Boolean(driverFieldErrors[key]), "rounded-sm border h-9 px-2 text-[13px]")}
                      />
                    ) : (
                      <input
                        id={key}
                        data-field={key}
                        type="text"
                        value={form[key] ?? ""}
                        aria-describedby={driverFieldErrors[key] ? `${key}-error` : undefined}
                        onChange={(event) => {
                          clearDriverFieldError(key);
                          setForm((current) => ({ ...current, [key]: event.target.value }));
                        }}
                        className={fieldErrorClassname(Boolean(driverFieldErrors[key]), "rounded-sm border h-9 px-2 text-[13px]")}
                      />
                    )}
                    <FieldError id={key} message={driverFieldErrors[key]} />
                  </div>
                ))}
                <div className="flex flex-col gap-1">
                  <label htmlFor="mx_state" className="text-xs font-semibold text-gray-600">MX State</label>
                  {mexicoStatesQuery.isError ? (
                    <ListErrorState
                      title="Couldn't load Mexico states"
                      status={0}
                      message={mexicoStatesQuery.error instanceof Error ? mexicoStatesQuery.error.message : undefined}
                      onRetry={() => void mexicoStatesQuery.refetch()}
                      className="rounded-sm border border-slate-200 bg-slate-50 py-4"
                    />
                  ) : null}
                  <Combobox
                    id="mx_state"
                    dataTestId="driver-create-mx-state"
                    dataField="mx_state"
                    options={(mexicoStatesQuery.data ?? []).map((state) => ({
                      value: state.code,
                      label: `${state.code} - ${state.name}`,
                      sublabel: state.region,
                    }))}
                    value={form.mx_state || null}
                    onChange={(nextValue) => {
                      clearDriverFieldError("mx_state");
                      setForm((current) => ({ ...current, mx_state: nextValue ?? "" }));
                    }}
                    placeholder="Select Mexico state"
                    loading={mexicoStatesQuery.isLoading}
                    disabled={mexicoStatesQuery.isError}
                    error={driverFieldErrors.mx_state}
                  />
                  <FieldError id="mx_state" message={driverFieldErrors.mx_state} />
                </div>
              </div>
            ) : null}
          </div>

          </>
          ) : null}

          {wizardStep === 3 ? (
          <>
          <div className="col-span-full space-y-2 rounded-md border border-gray-200 p-3">
            <button
              type="button"
              onClick={() => setShowVisaEmergency((value) => !value)}
              className="w-full text-left text-sm font-semibold text-gray-700"
            >
              Visa & Emergency Contact (optional) {showVisaEmergency ? "▲" : "▼"}
            </button>
            {showVisaEmergency ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {[
                  ["visa_type", "Visa Type"],
                  ["visa_number", "Visa Number"],
                  ["visa_expires_at", "Visa Expires"],
                  ["passport_number", "Passport Number"],
                  ["passport_expires_at", "Passport Expires"],
                  ["passport_country", "Passport country (ISO-2)"],
                  ["emergency_contact_name", "Emergency Contact Name"],
                  ["emergency_contact_relationship", "Relationship"],
                  ["emergency_contact_phone_primary", "Emergency Phone Primary"],
                  ["emergency_contact_phone_alternate", "Emergency Phone Alternate"],
                ].map(([key, label]) => (
                  <div key={key} className="flex flex-col gap-1">
                    <label htmlFor={key} className="text-xs font-semibold text-gray-600">{label}</label>
                    {key.includes("expires") ? (
                      <DatePicker
                        id={key}
                        data-testid={key}
                        value={form[key] ?? ""}
                        onChange={(value) => {
                          clearDriverFieldError(key);
                          setForm((current) => ({ ...current, [key]: value }));
                        }}
                        className={fieldErrorClassname(Boolean(driverFieldErrors[key]), "rounded-sm border h-9 px-2 text-[13px]")}
                      />
                    ) : (
                      <input
                        id={key}
                        data-field={key}
                        type="text"
                        maxLength={key === "passport_country" ? 2 : undefined}
                        value={form[key] ?? ""}
                        aria-describedby={driverFieldErrors[key] ? `${key}-error` : undefined}
                        onChange={(event) => {
                          clearDriverFieldError(key);
                          const next =
                            key === "passport_country"
                              ? event.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2)
                              : event.target.value;
                          setForm((current) => ({ ...current, [key]: next }));
                        }}
                        className={fieldErrorClassname(Boolean(driverFieldErrors[key]), "rounded-sm border h-9 px-2 text-[13px]")}
                      />
                    )}
                    <FieldError id={key} message={driverFieldErrors[key]} />
                  </div>
                ))}
                <div className="md:col-span-2 flex flex-col gap-1">
                  <label htmlFor="emergency_contact_address" className="text-xs font-semibold text-gray-600">Emergency Contact Address</label>
                  <textarea
                    id="emergency_contact_address"
                    data-field="emergency_contact_address"
                    value={form.emergency_contact_address ?? ""}
                    aria-describedby={driverFieldErrors.emergency_contact_address ? "emergency_contact_address-error" : undefined}
                    onChange={(event) => {
                      clearDriverFieldError("emergency_contact_address");
                      setForm((current) => ({ ...current, emergency_contact_address: event.target.value }));
                    }}
                    className={fieldErrorClassname(Boolean(driverFieldErrors.emergency_contact_address), "rounded-sm border px-2 py-1.5 text-[13px]")}
                    rows={2}
                  />
                  <FieldError id="emergency_contact_address" message={driverFieldErrors.emergency_contact_address} />
                </div>
                <div className="md:col-span-2 flex flex-col gap-1">
                  <label htmlFor="emergency_contact_notes" className="text-xs font-semibold text-gray-600">Emergency Contact Notes</label>
                  <textarea
                    id="emergency_contact_notes"
                    data-field="emergency_contact_notes"
                    value={form.emergency_contact_notes ?? ""}
                    aria-describedby={driverFieldErrors.emergency_contact_notes ? "emergency_contact_notes-error" : undefined}
                    onChange={(event) => {
                      clearDriverFieldError("emergency_contact_notes");
                      setForm((current) => ({ ...current, emergency_contact_notes: event.target.value }));
                    }}
                    className={fieldErrorClassname(Boolean(driverFieldErrors.emergency_contact_notes), "rounded-sm border px-2 py-1.5 text-[13px]")}
                    rows={2}
                  />
                  <FieldError id="emergency_contact_notes" message={driverFieldErrors.emergency_contact_notes} />
                </div>
              </div>
            ) : null}
          </div>

          </>
          ) : null}

          {wizardStep === 4 ? (
          <div className="col-span-full space-y-3 rounded-md border border-slate-200 p-3" data-testid="driver-create-dq-step">
            <div className="text-sm font-semibold text-slate-800">DQ documents & drug screen</div>
            <p className="text-xs text-slate-600">
              Stage the required hiring documents here. They upload to the saved driver record after Save.
              Pre-employment drug screen must be acknowledged before create.
            </p>
            {hasPendingDocs && fileCategoriesQuery.isError ? (
              <ListErrorState
                title="Couldn't load document categories"
                status={fileCategoriesQuery.error instanceof ApiError ? fileCategoriesQuery.error.status : 0}
                message={userFacingApiError(fileCategoriesQuery.error, "Document categories are unavailable")}
                onRetry={() => void fileCategoriesQuery.refetch()}
                className="rounded-sm border border-slate-200 bg-slate-50 py-4"
              />
            ) : null}
            {hasPendingDocs && fileCategoriesQuery.isPending ? (
              <p className="rounded-sm border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700" role="status">
                Loading document categories before staged files can be saved…
              </p>
            ) : null}
            {hasPendingDocs && fileCategoriesQuery.isSuccess && missingPendingDocCategory ? (
              <ListErrorState
                title="Document category unavailable"
                status={0}
                message={`The ${DRIVER_CREATE_DOC_CATEGORY_CODES[missingPendingDocCategory[0]]} category is missing from the active catalog.`}
                onRetry={() => void fileCategoriesQuery.refetch()}
                className="rounded-sm border border-slate-200 bg-slate-50 py-4"
              />
            ) : null}
            <label className="flex items-start gap-2 text-sm text-slate-800">
              {/* C9-SUBMISSION-GATE: this transient acknowledgement gates Save and its value drives
                  the rendered saveDisabledReason; it is not represented as a stored driver fact. */}
              <input
                type="checkbox"
                data-testid="driver-create-drug-screen-ack"
                checked={drugScreenAcknowledged}
                onChange={(event) => setDrugScreenAcknowledged(event.target.checked)}
                className="mt-0.5"
              />
              <span>Pre-employment drug screen ordered / result on file (or scheduled before first dispatch).</span>
            </label>
            {(
              [
                ["identity", "INE / voter ID"],
                ["mexican_federal_license", "Licencia Federal (MX)"],
                ["passport", "Passport"],
                ["cdl", "US CDL scan"],
                ["medical", "DOT medical card"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-600">{label}</label>
                <input
                  type="file"
                  data-testid={`driver-create-doc-${key}`}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    setPendingDocs((current) => {
                      const next = { ...current };
                      if (file) next[key] = file;
                      else delete next[key];
                      return next;
                    });
                  }}
                  className="rounded-sm border border-slate-200 bg-white px-2 py-1.5 text-[13px]"
                />
                {pendingDocs[key] ? (
                  <span className="text-[11px] text-slate-600">{pendingDocs[key]?.name}</span>
                ) : null}
              </div>
            ))}
          </div>
          ) : null}

          {wizardStep === 4 && returningDetection?.returning_driver ? (
            <div className={`col-span-full rounded-md border p-3 text-sm ${getDetectionSeverityClass(returningDetection)}`}>
              <div className="font-semibold">RETURNING DRIVER DETECTED</div>
              <div className="mt-1 text-xs">
                Prior safety events match this CURP/CDL identity. Review before proceeding.
              </div>
              <div className="mt-2 max-h-40 space-y-1 overflow-auto rounded-sm bg-white/70 p-2 text-xs">
                {returningDetection.matched_events.map((event) => (
                  <div key={event.event_id} className="rounded-sm border border-gray-200 bg-white p-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span>{formatDateUS(event.event_date)}</span>
                      <StatusBadge status={event.severity} />
                    </div>
                    <div className="font-medium capitalize">{event.event_type}</div>
                    <div>{event.summary}</div>
                    <div className="text-[11px] text-gray-600">From prior record under name {event.matched_driver_name}</div>
                  </div>
                ))}
              </div>
              <label className="mt-2 flex items-start gap-2 text-xs font-medium">
                <input
                  type="checkbox"
                  checked={overrideReturningWarning}
                  onChange={(event) => setOverrideReturningWarning(event.target.checked)}
                  className="mt-0.5"
                />
                <span>I have reviewed prior safety records and want to proceed with this hire</span>
              </label>
              {overrideReturningWarning && terminatedMatches.length > 0 ? (
                <div className="mt-2 space-y-2 rounded-sm border border-slate-200 bg-slate-100 p-2">
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="radio"
                      name="rehire_action"
                      checked={rehireAction === "new"}
                      onChange={() => setRehireAction("new")}
                    />
                    Hire as a NEW driver (not linked to prior record)
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="radio"
                      name="rehire_action"
                      checked={rehireAction === "rehire"}
                      onChange={() => setRehireAction("rehire")}
                    />
                    Mark as REHIRE of prior driver
                  </label>
                  {rehireAction === "rehire" ? (
                    <Combobox
                      options={terminatedMatches.map((match) => ({ value: match.driverId, label: match.label }))}
                      value={selectedPriorDriverId}
                      onChange={(nextValue) => setSelectedPriorDriverId(nextValue)}
                      placeholder="Select prior terminated driver"
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {wizardStep === 4 && returningCheckError ? (
            <div className="col-span-full">
              <ListErrorState
                title="Couldn't check for a returning driver"
                status={returningCheckError instanceof ApiError ? returningCheckError.status : 0}
                message={userFacingApiError(returningCheckError, "Returning-driver identity check failed")}
                onRetry={() => setReturningCheckRetry((value) => value + 1)}
                className="rounded-sm border border-slate-200 bg-slate-50 py-4"
              />
            </div>
          ) : null}

          <div className="col-span-full space-y-1">
          <div className="flex flex-wrap justify-between gap-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => driverCreateAttemptCloseRef.current?.()}
            >
              Cancel
            </Button>
            <div className="flex flex-wrap gap-2">
              {wizardStep > 1 ? (
                <Button
                  variant="secondary"
                  type="button"
                  data-testid="driver-create-wizard-back"
                  onClick={() => setWizardStep((step) => Math.max(1, step - 1))}
                >
                  Back
                </Button>
              ) : null}
              {wizardStep < DRIVER_CREATE_WIZARD_STEPS.length ? (
                <Button
                  type="button"
                  data-testid="driver-create-wizard-next"
                  disabled={wizardStep === 1 && !identityStepReady}
                  onClick={() => setWizardStep((step) => Math.min(DRIVER_CREATE_WIZARD_STEPS.length, step + 1))}
                >
                  Next
                </Button>
              ) : (
                <SaveDropdown
                  storageKey="driver-create"
                  primaryLabel="Save"
                  disabled={
                    !identityStepReady ||
                    !drugScreenAcknowledged ||
                    (returningDetection?.returning_driver && !overrideReturningWarning) ||
                    (overrideReturningWarning &&
                      rehireAction === "rehire" &&
                      terminatedMatches.length > 0 &&
                      !selectedPriorDriverId) ||
                    pendingDocCategoriesUnavailable ||
                    Boolean(returningCheckError) ||
                    returningCheckLoading
                  }
                  title={saveDisabledReason}
                  loading={createMutation.isPending}
                  onSave={() => void runDriverCreateSave("default")}
                  onSaveAndAddAnother={() => void runDriverCreateSave("add_another")}
                />
              )}
            </div>
          </div>
          {/* CC3TEST-DRIVER-CREATE-SAVE-DISABLED-NO-REASON: a tooltip alone requires hovering the
              button to discover; this inline line is visible without hovering on the exact step
              where the most common blocker (the drug-screen checkbox above) lives. */}
          {wizardStep === DRIVER_CREATE_WIZARD_STEPS.length && saveDisabledReason ? (
            <p className="text-right text-xs text-red-600" data-testid="driver-create-save-disabled-reason">
              {saveDisabledReason}
            </p>
          ) : null}
          </div>
    </form>
  );

  const driverCreateSummary = (
    <div className="space-y-3">
      {/* INVITE-NOT-ON-SAVE — Save used to fire a real WhatsApp message with a live 72-hour token to
          whatever phone was on the record, and this line asserted it had. Saving no longer sends; the
          invite is prepared and sending is a separate, deliberate action below. The copy states what
          actually happened rather than what the button used to do. */}
      <p className="text-sm text-gray-700" data-testid="invite-not-sent-notice">
        Driver created. <strong>No invite has been sent.</strong> The invite link below is ready and
        expires 72 hours after it is sent.
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          data-testid="send-invite-confirm"
          disabled={invitePending || inviteSent || !createSummary?.driver_id}
          onClick={() => {
            if (!createSummary?.driver_id) return;
            // Deliberate second action, and it goes through the SAME endpoint the office already uses
            // to re-send — no second sender to keep in step with the first.
            setInviteConfirmOpen(true);
          }}
        >
          {inviteSent ? "Invite sent" : invitePending ? "Sending…" : `Send WhatsApp invite to ${createSummary?.phone ?? ""}`}
        </Button>
      </div>
      {createSummary?.linked_user_event_type === "existing_user" ? (
        <p className="text-sm text-slate-700">
          Phone {createSummary.phone} was already registered. Linked existing account.
        </p>
      ) : null}
      <div className="rounded-sm border border-gray-200 bg-gray-50 p-2 text-xs break-all">{createSummary?.invite_url}</div>
      <div className="flex justify-end gap-2">
        <Button
          variant="secondary"
          type="button"
          onClick={async () => {
            if (!createSummary?.invite_url) return;
            try {
              await navigator.clipboard.writeText(createSummary.invite_url);
              pushToast("Invite URL copied", "success");
            } catch {
              pushToast("Could not copy invite URL", "error");
            }
          }}
        >
          Copy
        </Button>
        <Button
          variant="secondary"
          type="button"
          onClick={closeCreateSummary}
        >
          Done
        </Button>
        <Button
          type="button"
          onClick={() => {
            if (!createSummary?.driver_id) return;
            const nextDriverId = createSummary.driver_id;
            closeCreateSummary();
            if (onCreated) onCreated(nextDriverId, createSummary.display_name);
            else navigate(`/drivers/${nextDriverId}`);
          }}
        >
          View Driver
        </Button>
      </div>
      <ConfirmModal
        open={inviteConfirmOpen}
        title="Send WhatsApp invite"
        message={`Send a WhatsApp invite to ${createSummary?.phone ?? ""}? This messages that number.`}
        confirmLabel="Send invite"
        onClose={() => setInviteConfirmOpen(false)}
        onConfirm={async () => {
          if (!createSummary?.driver_id) return;
          const generation = inviteGenerationRef.current;
          const driverId = createSummary.driver_id;
          const phone = createSummary.phone;
          setInvitePending(true);
          try {
            await resendDriverInvite(driverId);
            if (generation !== inviteGenerationRef.current) return;
            setInviteSent(true);
            pushToast(`Invite sent to ${phone}`, "success");
          } catch (error) {
            if (generation !== inviteGenerationRef.current) return;
            pushToast(userFacingApiError(error, "Could not send invite"), "error");
            throw error;
          } finally {
            if (generation === inviteGenerationRef.current) setInvitePending(false);
          }
        }}
      />
    </div>
  );

  // DRIVER-CREATE-MODAL-CDL-CLASS-AND-STATUS-HARDCODED-BYPASS-CATALOG: mini-create panel for the
  // license-class Combobox's "+ Add new" affordance, mirroring the QB-STD-1/2 pattern already used
  // elsewhere (e.g. CreateAdvanceModal.tsx's cash-advance-type inline-create).
  const licenseClassCreateContent = (
    <div className="space-y-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="new_license_class_code" className="text-xs font-semibold text-gray-600">Code *</label>
        <input
          id="new_license_class_code"
          value={newLicenseClassCode}
          onChange={(event) => setNewLicenseClassCode(event.target.value)}
          className="rounded-sm border h-9 px-2 text-[13px]"
          placeholder="e.g. AM"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="new_license_class_label" className="text-xs font-semibold text-gray-600">Name *</label>
        <input
          id="new_license_class_label"
          value={newLicenseClassLabel}
          onChange={(event) => setNewLicenseClassLabel(event.target.value)}
          className="rounded-sm border h-9 px-2 text-[13px]"
          placeholder="e.g. Class AM — Motorcycle"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button
          variant="secondary"
          type="button"
          onClick={() => setLicenseClassCreateOpen(false)}
        >
          Cancel
        </Button>
        <Button
          type="button"
          disabled={savingLicenseClass || !newLicenseClassCode.trim() || !newLicenseClassLabel.trim()}
          onClick={saveNewLicenseClass}
        >
          {savingLicenseClass ? "Saving…" : "Save license class"}
        </Button>
      </div>
    </div>
  );

  // CHROME-11: nested call sites (shell="drawer") stack THIS SAME creator as a right ParityDrawer —
  // never a centered Modal on top of an already-open money drawer (e.g. Bill create).
  if (shell === "drawer") {
    return (
      <>
        <ParityDrawer
          open={open}
          onClose={onClose}
          onBack={onClose}
          title="Create Driver"
          size="wide"
          confirmDiscardOnClose
          isDirty={isDriverCreateDirty}
          onRegisterAttemptClose={(fn) => {
            driverCreateAttemptCloseRef.current = fn;
          }}
        >
          {driverCreateForm}
        </ParityDrawer>
        <ParityDrawer
          open={Boolean(createSummary)}
          onClose={closeCreateSummary}
          title="Driver created successfully"
        >
          {driverCreateSummary}
        </ParityDrawer>
        <ParityDrawer
          open={licenseClassCreateOpen}
          onClose={() => setLicenseClassCreateOpen(false)}
          title="Add license class"
        >
          {licenseClassCreateContent}
        </ParityDrawer>
      </>
    );
  }

  return (
    <>
      <Modal
        variant="drawer"
        open={open}
        onClose={onClose}
        title="Create Driver"
        confirmDiscardOnClose
        isDirty={isDriverCreateDirty}
        onRegisterAttemptClose={(fn) => {
          driverCreateAttemptCloseRef.current = fn;
        }}
      >
        {driverCreateForm}
      </Modal>
      <Modal
        open={Boolean(createSummary)}
        onClose={closeCreateSummary}
        title="Driver created successfully"
      >
        {driverCreateSummary}
      </Modal>
      <Modal
        open={licenseClassCreateOpen}
        onClose={() => setLicenseClassCreateOpen(false)}
        title="Add license class"
      >
        {licenseClassCreateContent}
      </Modal>
    </>
  );
}
