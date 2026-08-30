import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSafetyIncident,
  getSafetyIncident,
  listSafetyIncidents,
  setSafetyIncidentStatus,
  updateSafetyIncident,
  uploadSafetyIncidentPhoto,
  voidSafetyIncident,
} from "../../../api/safety";
import { useAuth } from "../../../auth/useAuth";
import { listCargoClaimReasons } from "../../../api/catalogs-safety";
import { listCustomers } from "../../../api/mdata";
import { listLoads } from "../../../api/loads";
import { Button } from "../../../components/Button";
import { MoneyInput } from "../../../components/forms/MoneyInput";
import { DatePicker } from "../../../components/forms/DatePicker";
import { EntityPicker } from "../../../components/parity/EntityPicker";
import { ReferenceSelect, type ReferenceOption } from "../../../components/parity/ReferenceSelect";
import { useStagedListFilters } from "../../../components/table";
import { formatDateUS } from "../../../lib/formatDate";
import { companyNow } from "../../../lib/businessDate";
import { formatUsdCents } from "../../../lib/money";
import { ListErrorState } from "../../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel } from "../../../lib/entity-label";
import { CappedListNotice } from "../../../components/CappedListNotice";
import { userFacingApiError } from "../../../lib/api-error-message";
import { suggestExpenseLoad } from "../../../api/maintenance";
import { ConfirmModal } from "../../../components/shared/ConfirmModal";

const EMPTY_FILTERS = {
  driverId: "",
  unitId: "",
  loadId: "",
  trailerId: "",
};

type Props = {
  operatingCompanyId: string;
  pageTestId: string;
  createLabel: string;
  detailLabel: string;
  title: string;
  subtitle: string;
};

const PICKER_LIMIT = 200;

function todayISODate(): string {
  // companyNow() is an ISO timestamp; take the calendar date portion for the date input.
  return String(companyNow()).slice(0, 10);
}

function formatCents(cents: unknown): string {
  const n = typeof cents === "number" ? cents : Number(cents ?? 0);
  return formatUsdCents(n);
}

const emptyForm = {
  incidentDate: todayISODate(),
  loadId: "",
  claimantCustomerId: "",
  claimReasonId: "",
  amountCents: null as number | null,
  amountUndetermined: false,
  claimFiledAt: "",
  driverId: "",
  unitId: "",
  trailerId: "",
  location: "",
  description: "",
};

type EditForm = typeof emptyForm;
type CargoClaimCreateInput = {
  companyId: string;
  generation: number;
  payload: Parameters<typeof createSafetyIncident>[0];
};

function detailToEditForm(detail: Record<string, unknown>): EditForm {
  const incidentAt = String(detail.incident_at ?? "").slice(0, 10);
  const cents = Number(detail.damage_amount_cents ?? 0);
  return {
    incidentDate: incidentAt || todayISODate(),
    loadId: detail.load_id ? String(detail.load_id) : "",
    claimantCustomerId: detail.claimant_customer_id ? String(detail.claimant_customer_id) : "",
    claimReasonId: detail.claim_reason_id ? String(detail.claim_reason_id) : "",
    amountCents: cents > 0 ? cents : null,
    amountUndetermined: cents === 0,
    claimFiledAt: detail.claim_filed_at ? String(detail.claim_filed_at).slice(0, 10) : "",
    driverId: detail.driver_id ? String(detail.driver_id) : "",
    unitId: detail.unit_id ? String(detail.unit_id) : "",
    trailerId: detail.trailer_id ? String(detail.trailer_id) : "",
    location: String(detail.location ?? ""),
    description: String(detail.description ?? ""),
  };
}

export function CargoClaimIntakeSurface({
  operatingCompanyId,
  pageTestId,
  createLabel,
  detailLabel,
  title,
  subtitle,
}: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [suggestionPinned, setSuggestionPinned] = useState(false);
  const [saving, setSaving] = useState(false);
  const createGenerationRef = useRef(0);
  const [pendingUnlinkedCreate, setPendingUnlinkedCreate] = useState<CargoClaimCreateInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  // SAF-B29: claimant + reason were silent limit:200 — search must be state + queryKey + server param.
  // Driver/unit/load/trailer search is owned by EntityPicker (not local Combobox pages).
  const [customerSearch, setCustomerSearch] = useState("");
  const [reasonSearch, setReasonSearch] = useState("");
  // SAF-F20 (cargo-claim leg): the Carmack intake surface was create-only — existing claims could
  // never be corrected, status-changed, or voided even though safety.incidents already supported all
  // three for incident_type=cargo_claim via the shared incidents routes.
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>({ ...emptyForm });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [statusTarget, setStatusTarget] = useState<"open" | "investigating" | "closed" | null>(null);
  const [statusReason, setStatusReason] = useState("");
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [voidError, setVoidError] = useState<string | null>(null);
  const canVoid = user?.role === "Owner" || user?.role === "Administrator";

  const companyEnabled = Boolean(operatingCompanyId);
  const pickersEnabled = companyEnabled && (creating || Boolean(selectedId));
  const [searchParams, setSearchParams] = useSearchParams();
  const loadIdFromUrl = searchParams.get("load_id")?.trim() ?? "";
  const driverIdFromUrl = searchParams.get("driver_id")?.trim() ?? "";
  const unitIdFromUrl = searchParams.get("unit_id")?.trim() ?? "";
  const trailerIdFromUrl = searchParams.get("trailer_id")?.trim() ?? "";
  // LST-F5163D + LST-F5194 + LV-SAFETY-CARGO-CLAIMS-FILTER-SILENT-APPLY — stage until Apply;
  // URL driver_id/unit_id/load_id/trailer_id sync on Apply/Reset only.
  function patchListSearchParam(next: {
    driverId: string;
    unitId: string;
    loadId: string;
    trailerId: string;
  }) {
    const p = new URLSearchParams(searchParams);
    const pairs: Array<["driver_id" | "unit_id" | "load_id" | "trailer_id", string]> = [
      ["driver_id", next.driverId],
      ["unit_id", next.unitId],
      ["load_id", next.loadId],
      ["trailer_id", next.trailerId],
    ];
    for (const [key, value] of pairs) {
      if (value) p.set(key, value);
      else p.delete(key);
    }
    setSearchParams(p, { replace: true });
  }

  const [applied, setApplied] = useState(() => ({
    ...EMPTY_FILTERS,
    driverId: driverIdFromUrl,
    unitId: unitIdFromUrl,
    loadId: loadIdFromUrl,
    trailerId: trailerIdFromUrl,
  }));
  const staged = useStagedListFilters({
    applied,
    empty: EMPTY_FILTERS,
    onApply: (next) => {
      setApplied(next);
      patchListSearchParam(next);
    },
  });
  const filterDraft = staged.draft;

  useEffect(() => {
    setApplied((prev) => ({
      ...prev,
      driverId: driverIdFromUrl,
      unitId: unitIdFromUrl,
      loadId: loadIdFromUrl,
      trailerId: trailerIdFromUrl,
    }));
  }, [driverIdFromUrl, unitIdFromUrl, loadIdFromUrl, trailerIdFromUrl]);

  function setDriverFilter(next: string) {
    staged.setDraft((d) => ({ ...d, driverId: next }));
  }
  function setUnitFilter(next: string) {
    staged.setDraft((d) => ({ ...d, unitId: next }));
  }
  function setLoadFilter(next: string) {
    staged.setDraft((d) => ({ ...d, loadId: next }));
  }
  function setTrailerFilter(next: string) {
    staged.setDraft((d) => ({ ...d, trailerId: next }));
  }

  const suggestionQuery = useQuery({
    queryKey: [
      "safety",
      "cargo-claim-create",
      "suggest-load",
      operatingCompanyId,
      form.driverId,
      form.unitId,
      form.trailerId,
      form.incidentDate,
    ],
    queryFn: () =>
      suggestExpenseLoad({
        operating_company_id: operatingCompanyId,
        driver_id: form.driverId || undefined,
        unit_id: form.unitId || undefined,
        trailer_id: form.trailerId || undefined,
        transaction_date: form.incidentDate,
      }),
    enabled: Boolean(
      creating && operatingCompanyId && form.incidentDate && (form.driverId || form.unitId || form.trailerId)
    ),
  });

  useEffect(() => {
    setSuggestionPinned(false);
  }, [form.driverId, form.unitId, form.trailerId, form.incidentDate]);

  useEffect(() => {
    if (form.loadId || suggestionPinned) return;
    const suggested = suggestionQuery.data?.data;
    if (!suggested?.load_id) return;
    setForm((previous) => ({ ...previous, loadId: suggested.load_id }));
    setSuggestionPinned(true);
  }, [form.loadId, suggestionPinned, suggestionQuery.data]);

  const listQuery = useQuery({
    queryKey: [
      "safety",
      "incidents",
      "cargo_claim",
      operatingCompanyId,
      applied.loadId,
      applied.driverId,
      applied.unitId,
      applied.trailerId,
    ],
    queryFn: () =>
      listSafetyIncidents(operatingCompanyId, "cargo_claim", {
        load_id: applied.loadId.trim() || undefined,
        driver_id: applied.driverId.trim() || undefined,
        unit_id: applied.unitId.trim() || undefined,
        trailer_id: applied.trailerId.trim() || undefined,
      }),
    enabled: companyEnabled,
  });

  const reasonsQuery = useQuery({
    queryKey: ["catalogs", "cargo-claim-reasons", operatingCompanyId, reasonSearch],
    queryFn: () =>
      listCargoClaimReasons(operatingCompanyId, {
        is_active: "true",
        limit: PICKER_LIMIT,
        search: reasonSearch || undefined,
      }),
    enabled: pickersEnabled,
  });

  const customersQuery = useQuery({
    queryKey: ["mdata", "customers", "cargo-claim-picker", operatingCompanyId, customerSearch],
    queryFn: () =>
      listCustomers({
        operating_company_id: operatingCompanyId,
        limit: PICKER_LIMIT,
        search: customerSearch || undefined,
      }),
    enabled: pickersEnabled,
  });

  // Label map for ParityTable EntityLink — form pickers use EntityPicker server search.
  const loadsQuery = useQuery({
    queryKey: ["mdata", "loads", "cargo-claim-labels", operatingCompanyId],
    queryFn: () => listLoads({ operating_company_id: [operatingCompanyId], limit: PICKER_LIMIT, sort: "-created_at" }),
    enabled: companyEnabled,
  });

  const detailQuery = useQuery({
    queryKey: ["safety", "incident-detail", selectedId, operatingCompanyId],
    queryFn: () => getSafetyIncident(String(selectedId), operatingCompanyId),
    enabled: Boolean(selectedId) && companyEnabled,
  });

  const rows = listQuery.data?.incidents ?? [];
  // LIST-EMPTY: the empty message renders only after the incidents query settles.


  const reasons = reasonsQuery.data?.rows ?? [];

  const reasonOptions = useMemo(
    () =>
      reasons.map((r) => ({
        value: String(r.id),
        label: String(r.display_name),
        type: String(r.reason_code),
      })),
    [reasons]
  );
  const customers = customersQuery.data?.customers ?? [];
  const customerOptions: ReferenceOption[] = customers.map((c) => ({
    value: c.id,
    label: c.name,
    type: c.customer_code ?? undefined,
  }));
  const loads = loadsQuery.data?.loads ?? [];

  // Name lookups for the table's drill-through labels.
  const customerNameById = useMemo(
    () => new Map(customers.map((c) => [String(c.id), String(c.name ?? "")])),
    [customers]
  );
  const loadNumberById = useMemo(
    () =>
      new Map(
        (loads as Array<Record<string, unknown>>).map((l) => [
          String(l.id ?? ""),
          String(l.load_number ?? l.reference ?? ""),
        ])
      ),
    [loads]
  );

  // SAF-F21: Claimant and Load are the two links a cargo claim lives or dies by — the claim is
  // FROM a customer and ABOUT a load. Both are canonical FKs on safety.incidents
  // (claimant_customer_id, load_id) and neither was ever shown. Names come from the pickers'
  // already-loaded catalogs, so the links carry a label rather than a truncated uuid.
  const claimColumns = useMemo<ParityColumn<Record<string, unknown>>[]>(
    () => [
      { key: "incident_at", label: "Date of loss", sortable: true, render: (row) => formatDateUS(row.incident_at) },
      { key: "claim_reason_code", label: "Reason", render: (row) => String(row.claim_reason_code ?? "—") },
      {
        key: "claimant_customer_id",
        label: "Claimant",
        render: (row) =>
          row.claimant_customer_id ? (
            <EntityLink
              kind="customer"
              id={String(row.claimant_customer_id)}
              label={entityLabel(row.claimant_customer_name ?? customerNameById.get(String(row.claimant_customer_id)), row.claimant_customer_id, "Customer")}
              onClick={() => navigate(`/customers/${String(row.claimant_customer_id)}`)}
            />
          ) : (
            "—"
          ),
      },
      {
        key: "load_id",
        label: "Load",
        render: (row) =>
          row.load_id ? (
            <EntityLink
              kind="load"
              id={String(row.load_id)}
              label={entityLabel(row.load_number ?? loadNumberById.get(String(row.load_id)), row.load_id, "Load")}
            />
          ) : (
            "—"
          ),
      },
      {
        key: "driver_id",
        label: "Driver",
        render: (row) =>
          row.driver_id ? (
            <EntityLink
              kind="driver"
              id={String(row.driver_id)}
              label={entityLabel(row.driver_name, row.driver_id, "Driver")}
              onClick={() => navigate(`/drivers/${String(row.driver_id)}`)}
            />
          ) : (
            "—"
          ),
      },
      {
        key: "trailer_id",
        label: "Trailer",
        render: (row) => (
          <EntityLink
            kind="trailer"
            id={row.trailer_id as string | undefined}
            label={entityLabel(
              (row.trailer_number as string | undefined)?.trim(),
              row.trailer_id as string | undefined,
              "Trailer"
            )}
          />
        ),
      },
      { key: "damage_amount_cents", label: "Claimed", sortable: true, render: (row) => formatCents(row.damage_amount_cents) },
      { key: "status", label: "Status", sortable: true, render: (row) => String(row.status ?? "open") },
      {
        key: "action",
        label: "Action",
        render: (row) => (
          <button type="button" className="text-slate-700 underline" onClick={() => setSelectedId(String(row.id))}>
            {detailLabel}
          </button>
        ),
      },
    ],
    [customerNameById, loadNumberById, detailLabel]
  );

  const detail = detailQuery.data?.incident ?? null;
  const photoCount = Array.isArray(detail?.photo_keys) ? (detail?.photo_keys as unknown[]).length : 0;

  const set = (patch: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...patch }));
  const setEdit = (patch: Partial<EditForm>) => setEditForm((prev) => ({ ...prev, ...patch }));

  const closeDetail = () => {
    setSelectedId(null);
    setEditMode(false);
    setEditError(null);
    setStatusTarget(null);
    setStatusReason("");
    setVoidOpen(false);
    setVoidReason("");
    setVoidError(null);
  };

  const beginEdit = () => {
    if (!detail) return;
    setEditForm(detailToEditForm(detail));
    setEditMode(true);
    setEditError(null);
  };

  const saveEdit = async () => {
    if (!selectedId || !editForm.description.trim()) {
      setEditError("Description is required.");
      return;
    }
    if (!editForm.claimReasonId) {
      setEditError("Claim reason is required.");
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      const incidentAtIso = new Date(`${editForm.incidentDate}T12:00:00`).toISOString();
      const cents = editForm.amountUndetermined ? 0 : editForm.amountCents ?? 0;
      await updateSafetyIncident(selectedId, operatingCompanyId, {
        incident_at: incidentAtIso,
        location: editForm.location,
        description: editForm.description.trim(),
        load_id: editForm.loadId || null,
        claimant_customer_id: editForm.claimantCustomerId || null,
        claim_reason_id: editForm.claimReasonId,
        claim_filed_at: editForm.claimFiledAt || null,
        damage_amount_cents: cents,
        driver_id: editForm.driverId || null,
        unit_id: editForm.unitId || null,
        trailer_id: editForm.trailerId || null,
      });
      setEditMode(false);
      refresh();
      void detailQuery.refetch();
    } catch (err) {
      setEditError(userFacingApiError(err, "Could not save changes."));
    } finally {
      setEditSaving(false);
    }
  };

  const resetCreate = () => {
    setForm({ ...emptyForm, incidentDate: todayISODate() });
    setError(null);
    setCreating(false);
  };

  const refresh = (submittedCompanyId = operatingCompanyId) => {
    void queryClient.invalidateQueries({ queryKey: ["safety", "incidents", "cargo_claim", submittedCompanyId] });
  };

  useEffect(() => {
    createGenerationRef.current += 1;
    setPendingUnlinkedCreate(null);
    setSaving(false);
    setError(null);
    setCreating(false);
    setForm({ ...emptyForm, incidentDate: todayISODate() });
  }, [operatingCompanyId]);

  const persistCreate = async (input: CargoClaimCreateInput) => {
    setSaving(true);
    try {
      const created = await createSafetyIncident(input.payload);
      if (input.generation !== createGenerationRef.current) return;
      const newId = created?.incident?.id ? String(created.incident.id) : null;
      resetCreate();
      refresh(input.companyId);
      if (newId) setSelectedId(newId);
    } catch (err) {
      if (input.generation === createGenerationRef.current) setError(userFacingApiError(err, "Could not create the cargo claim."));
    } finally {
      if (input.generation === createGenerationRef.current) setSaving(false);
    }
  };

  const saveCreate = async () => {
    setError(null);
    if (!form.incidentDate) {
      setError("Date of loss is required.");
      return;
    }
    if (!form.description.trim()) {
      setError("Description is required.");
      return;
    }
    if (!form.claimReasonId) {
      setError("Claim reason is required.");
      return;
    }
    const cents = form.amountCents;
    if (!form.amountUndetermined && (cents === null || cents <= 0)) {
      setError('Enter a claimed amount, or check "Amount undetermined" (49 CFR 1005.2 allows a determinable amount).');
      return;
    }
    const input: CargoClaimCreateInput = {
      companyId: operatingCompanyId,
      generation: createGenerationRef.current,
      payload: {
        operating_company_id: operatingCompanyId,
        incident_type: "cargo_claim",
        incident_at: new Date(`${form.incidentDate}T12:00:00`).toISOString(),
        location: form.location,
        description: form.description,
        load_id: form.loadId || null,
        claimant_customer_id: form.claimantCustomerId || null,
        claim_reason_id: form.claimReasonId,
        claim_filed_at: form.claimFiledAt || null,
        damage_amount_cents: form.amountUndetermined ? 0 : cents ?? 0, // dollars→cents via MoneyInput
        driver_id: form.driverId || null,
        unit_id: form.unitId || null,
        trailer_id: form.trailerId || null,
      },
    };
    // 49 CFR 1005.2 requires the claim to identify the shipment. Preserve the exact submitted
    // snapshot while the operator confirms the exceptional unlinked path.
    if (!input.payload.load_id) setPendingUnlinkedCreate(input);
    else await persistCreate(input);
  };

  const onPhotoSelected = async (file: File | null) => {
    if (!file || !selectedId) return;
    setUploading(true);
    try {
      await uploadSafetyIncidentPhoto(selectedId, operatingCompanyId, file);
      void detailQuery.refetch();
    } finally {
      setUploading(false);
    }
  };

  const inputClass = "mt-1 w-full rounded-sm border border-gray-200 px-2 py-1";
  const labelSpan = "text-slate-600";

  return (
    <div className="space-y-3" data-testid={pageTestId}>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-gray-200 bg-white px-3 py-2">
        <div>
          <div className="text-sm font-semibold text-slate-800">{title}</div>
          <div className="text-[11px] text-slate-500">{subtitle}</div>
        </div>
        {!creating ? (
          <Button
            size="sm"
            data-testid={`${pageTestId}-create-btn`}
            onClick={() => {
              setForm({ ...emptyForm, incidentDate: todayISODate() });
              setSelectedId(null);
              setError(null);
              setCreating(true);
            }}
          >
            {createLabel}
          </Button>
        ) : null}
      </div>

      {creating ? (
        <div className="rounded-sm border border-gray-200 bg-white p-3" data-testid={`${pageTestId}-create-form`}>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-800">{createLabel}</div>
            <button type="button" className="text-xs text-slate-500 underline" onClick={resetCreate}>
              Cancel
            </button>
          </div>
          {suggestionQuery.isError ? (
            <div data-testid={`${pageTestId}-suggest-load-error`}>
              <ListErrorState
                title="Couldn't check for a related load"
                status={0}
                message={userFacingApiError(suggestionQuery.error, "The automatic load suggestion is unavailable. You can still select a load manually.")}
                onRetry={() => void suggestionQuery.refetch()}
              />
            </div>
          ) : null}
          {customersQuery.isError ? (
            <div data-testid={`${pageTestId}-customers-error`}>
              <ListErrorState
                title="Couldn't load customers"
                status={0}
                message={userFacingApiError(customersQuery.error, "The claimant picker is unavailable.")}
                onRetry={() => void customersQuery.refetch()}
              />
            </div>
          ) : null}
          {reasonsQuery.isError ? (
            <div data-testid={`${pageTestId}-reasons-error`}>
              <ListErrorState
                title="Couldn't load claim reasons"
                status={0}
                message={userFacingApiError(reasonsQuery.error, "The claim-reason picker is unavailable.")}
                onRetry={() => void reasonsQuery.refetch()}
              />
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-2 text-xs md:grid-cols-2">
            <div className="block">
              <label className={labelSpan} htmlFor={`${pageTestId}-create-loss-date`}>Date of loss *</label>
              <DatePicker
                id={`${pageTestId}-create-loss-date`}
                className={inputClass}
                data-testid={`${pageTestId}-incident-at`}
                value={form.incidentDate}
                onChange={(next) => set({ incidentDate: next })}
              />
            </div>
            <label className="block">
              <span className={labelSpan}>Load (shipment)</span>
              <div className="mt-1" data-testid={`${pageTestId}-load-picker`}>
                <EntityPicker
                  kind="load"
                  operatingCompanyId={operatingCompanyId}
                  value={form.loadId || null}
                  onChange={(v) => set({ loadId: v ?? "" })}
                  placeholder="Search load…"
                  nestedInDrawer
                  dataTestId={`${pageTestId}-load-entity-picker`}
                />
              </div>
            </label>
            <label className="block">
              <span className={labelSpan}>Claimant (customer)</span>
              <div className="mt-1" data-testid={`${pageTestId}-claimant`}>
                <ReferenceSelect
                  value={form.claimantCustomerId || null}
                  onChange={(v) => set({ claimantCustomerId: v ?? "" })}
                  options={customerOptions}
                  createKind="customer"
                  operatingCompanyId={operatingCompanyId}
                  placeholder="Select customer"
                  disabled={!operatingCompanyId || customersQuery.isLoading}
                  onSearch={setCustomerSearch}
                />
                <CappedListNotice
                  shown={customerOptions.length}
                  limit={PICKER_LIMIT}
                  total={customersQuery.data?.total}
                  hint="Type to search the full customer catalog."
                  className="mt-1 text-xs text-slate-600"
                />
              </div>
            </label>
            <label className="block">
              <span className={labelSpan}>Claim reason</span>
              <div className="mt-1" data-testid={`${pageTestId}-reason`}>
                {/*
                  LST-PICKER-01: ReferenceSelect first-row create → POST catalogs.cargo_claim_reasons.
                  Options keyed by reason_code (createdValueField=code).
                */}
                <ReferenceSelect
                  value={form.claimReasonId || null}
                  onChange={(v) => set({ claimReasonId: v ?? "" })}
                  options={reasonOptions}
                  createKind="cargo_claim_reason"
                  operatingCompanyId={operatingCompanyId}
                  placeholder={reasonsQuery.isLoading ? "Loading reasons…" : "Select reason"}
                  loading={reasonsQuery.isLoading}
                  disabled={!operatingCompanyId || reasonsQuery.isLoading}
                  onSearch={setReasonSearch}
                  onOptionCreated={() => {
                    void queryClient.invalidateQueries({
                      queryKey: ["catalogs", "cargo-claim-reasons", operatingCompanyId],
                    });
                  }}
                />
                <CappedListNotice
                  shown={reasonOptions.length}
                  limit={PICKER_LIMIT}
                  total={reasonsQuery.data?.total}
                  hint="Type to search the full cargo-claim-reason catalog."
                  className="mt-1 text-xs text-slate-600"
                />
              </div>
            </label>
            <label className="block">
              <span className={labelSpan}>Claimed amount</span>
              <div className="mt-1" data-testid={`${pageTestId}-amount`}>
                <MoneyInput
                  ariaLabel="Claimed amount"
                  valueCents={form.amountCents}
                  onChangeCents={(c) => set({ amountCents: c })}
                  disabled={form.amountUndetermined}
                />
              </div>
              <label className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                <input
                  type="checkbox"
                  data-testid={`${pageTestId}-amount-undetermined`}
                  checked={form.amountUndetermined}
                  onChange={(e) => set({ amountUndetermined: e.target.checked })}
                />
                Amount undetermined (determinable)
              </label>
            </label>
            <div className="block">
              <label className={labelSpan} htmlFor={`${pageTestId}-create-filed-date`}>Claim filed date</label>
              <DatePicker
                id={`${pageTestId}-create-filed-date`}
                className={inputClass}
                data-testid={`${pageTestId}-filed-at`}
                value={form.claimFiledAt}
                onChange={(next) => set({ claimFiledAt: next })}
              />
            </div>
            <label className="block">
              <span className={labelSpan}>Driver</span>
              <div className="mt-1" data-testid={`${pageTestId}-driver-picker`}>
                <EntityPicker
                  kind="driver"
                  operatingCompanyId={operatingCompanyId}
                  value={form.driverId || null}
                  onChange={(v) => set({ driverId: v ?? "" })}
                  placeholder="Search driver…"
                  nestedInDrawer
                  allowCreate
                  onCreated={(id) => set({ driverId: id })}
                  dataTestId={`${pageTestId}-driver-entity-picker`}
                />
              </div>
            </label>
            <label className="block">
              <span className={labelSpan}>Unit (truck)</span>
              <div className="mt-1" data-testid={`${pageTestId}-unit-picker`}>
                <EntityPicker
                  kind="unit"
                  operatingCompanyId={operatingCompanyId}
                  value={form.unitId || null}
                  onChange={(v) => set({ unitId: v ?? "" })}
                  placeholder="Search unit…"
                  nestedInDrawer
                  dataTestId={`${pageTestId}-unit-entity-picker`}
                />
              </div>
            </label>
            <label className="block">
              <span className={labelSpan}>Trailer</span>
              <div className="mt-1" data-testid={`${pageTestId}-trailer-picker`}>
                <EntityPicker
                  kind="trailer"
                  operatingCompanyId={operatingCompanyId}
                  value={form.trailerId || null}
                  onChange={(v) => set({ trailerId: v ?? "" })}
                  placeholder="Search trailer…"
                  nestedInDrawer
                  dataTestId={`${pageTestId}-trailer-entity-picker`}
                />
              </div>
            </label>
            <label className="block">
              <span className={labelSpan}>Location</span>
              <input className={inputClass} value={form.location} onChange={(e) => set({ location: e.target.value })} />
            </label>
            <label className="block md:col-span-2">
              <span className={labelSpan}>Description *</span>
              <textarea
                className={inputClass}
                rows={3}
                data-testid={`${pageTestId}-description`}
                value={form.description}
                onChange={(e) => set({ description: e.target.value })}
              />
            </label>
          </div>
          {error ? (
            <div className="mt-2 text-[11px] text-red-600" data-testid={`${pageTestId}-error`}>
              {error}
            </div>
          ) : null}
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" data-testid={`${pageTestId}-save`} loading={saving} onClick={() => void saveCreate()}>
              Save
            </Button>
            <button type="button" className="text-xs text-slate-500 underline" onClick={resetCreate}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {/* SAF-F21: this was a hand-rolled HTML table element — outside the shared QBO-parity grammar, so it had no
          density toggle, no column sizing, no export, and no per-page control that every other list
          in the app has. It also showed neither the CLAIMANT nor the LOAD, which are the two things
          a cargo claim is actually about, and nothing on the row drilled anywhere. A claim you
          cannot trace to its customer or its load is a number in a list. */}
      {/* CLS-LIST-ERROR-STATE-UNGUARDED: the page DOES have an `error` state, but it is local useState serving the create/edit
          MUTATION forms — the LIST query had no branch at all, so a failed cargo-claim load fell
          through to emptyText "No records found." and read as a carrier with no cargo claims. */}
      {listQuery.isError ? (
        <ListErrorState
          title="Couldn't load cargo claims"
          status={0}
          message={(listQuery.error as Error)?.message}
          onRetry={() => void listQuery.refetch()}
        />
      ) : (
      <ParityTable<Record<string, unknown>>
        columns={claimColumns}
        rows={rows}
        rowKey={(row) => String(row.id ?? "")}
        loading={listQuery.isLoading}
        emptyText="No records found."
        storageKey="safety-cargo-claims"
        exportFilename="cargo-claims"
        tableTestId={`${pageTestId}-table`}
        rowTestId={(row) => `${pageTestId}-row-${String(row.id ?? "")}`}
        filterBar={
          <div className="relative flex flex-wrap items-end gap-3" data-testid={`${pageTestId}-filters`}>
            <label className="text-[11px] text-slate-600">
              Driver
              <EntityPicker
                kind="driver"
                operatingCompanyId={operatingCompanyId}
                value={filterDraft.driverId || null}
                onChange={(next) => setDriverFilter(next ?? "")}
                allowCreate={false}
                placeholder="All drivers"
                className="mt-1"
                dataTestId={`${pageTestId}-filter-driver`}
              />
            </label>
            <label className="text-[11px] text-slate-600">
              Unit
              <EntityPicker
                kind="unit"
                operatingCompanyId={operatingCompanyId}
                value={filterDraft.unitId || null}
                onChange={(next) => setUnitFilter(next ?? "")}
                allowCreate={false}
                placeholder="All units"
                className="mt-1"
                dataTestId={`${pageTestId}-filter-unit`}
              />
            </label>
            <label className="text-[11px] text-slate-600">
              Load
              <EntityPicker
                kind="load"
                operatingCompanyId={operatingCompanyId}
                value={filterDraft.loadId || null}
                onChange={(next) => setLoadFilter(next ?? "")}
                allowCreate={false}
                placeholder="All loads"
                className="mt-1"
                dataTestId={`${pageTestId}-filter-load`}
              />
            </label>
            <label className="text-[11px] text-slate-600">
              Trailer
              <EntityPicker
                kind="trailer"
                operatingCompanyId={operatingCompanyId}
                value={filterDraft.trailerId || null}
                onChange={(next) => setTrailerFilter(next ?? "")}
                allowCreate={false}
                placeholder="All trailers"
                className="mt-1"
                dataTestId={`${pageTestId}-trailer-filter`}
              />
            </label>
            <Button type="button" size="sm" data-testid={`${pageTestId}-filter-apply`} onClick={staged.apply} disabled={!staged.dirty}>
              Apply
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              data-testid={`${pageTestId}-filter-cancel`}
              onClick={staged.cancel}
              disabled={!staged.dirty}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              data-testid={`${pageTestId}-filter-reset`}
              onClick={() => {
                staged.cancel();
                setApplied(EMPTY_FILTERS);
                patchListSearchParam(EMPTY_FILTERS);
              }}
            >
              Reset
            </Button>
          </div>
        }
      />
      )}

      {loadsQuery.isError ? (
        <div data-testid={`${pageTestId}-load-labels-error`}>
          <ListErrorState
            title="Couldn't load related load labels"
            status={0}
            message={userFacingApiError(loadsQuery.error, "Cargo claims remain available, but load names may be unavailable.")}
            onRetry={() => void loadsQuery.refetch()}
          />
        </div>
      ) : null}

      {selectedId ? (
        <div className="rounded-sm border border-gray-200 bg-white p-3" data-testid={`${pageTestId}-detail`}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-slate-800">{detailLabel}</div>
            <div className="flex items-center gap-2">
              {detail && !detail.voided_at && !editMode ? (
                <button
                  type="button"
                  className="text-xs font-semibold text-[#1f2a44] underline"
                  data-testid={`${pageTestId}-edit-btn`}
                  onClick={beginEdit}
                >
                  Edit
                </button>
              ) : null}
              {editMode ? (
                <>
                  <Button size="sm" loading={editSaving} data-testid={`${pageTestId}-save-edit-btn`} onClick={() => void saveEdit()}>
                    Save changes
                  </Button>
                  <button
                    type="button"
                    className="text-xs text-slate-500 underline"
                    onClick={() => {
                      setEditMode(false);
                      setEditError(null);
                    }}
                  >
                    Cancel edit
                  </button>
                </>
              ) : null}
              <button type="button" className="text-xs text-slate-500 underline" onClick={closeDetail}>
                Close
              </button>
            </div>
          </div>

          {detailQuery.isError ? (
            <div data-testid={`${pageTestId}-detail-error`}>
              <ListErrorState
                title="Couldn't load cargo claim details"
                status={0}
                message={userFacingApiError(detailQuery.error, "The selected cargo claim is unavailable.")}
                onRetry={() => void detailQuery.refetch()}
              />
            </div>
          ) : null}

          {editMode ? (
            <div className="grid grid-cols-1 gap-2 text-xs md:grid-cols-2">
              <div className="block">
                <label className={labelSpan} htmlFor={`${pageTestId}-edit-loss-date`}>Date of loss *</label>
                <DatePicker id={`${pageTestId}-edit-loss-date`} className={inputClass} value={editForm.incidentDate} onChange={(next) => setEdit({ incidentDate: next })} />
              </div>
              <label className="block">
                <span className={labelSpan}>Load (shipment)</span>
                <div className="mt-1" data-testid={`${pageTestId}-edit-load-picker`}>
                  <EntityPicker
                    kind="load"
                    operatingCompanyId={operatingCompanyId}
                    value={editForm.loadId || null}
                    onChange={(v) => setEdit({ loadId: v ?? "" })}
                    placeholder="Search load…"
                    nestedInDrawer
                    dataTestId={`${pageTestId}-edit-load-entity-picker`}
                  />
                </div>
              </label>
              <label className="block">
                <span className={labelSpan}>Claimant (customer)</span>
                <div className="mt-1">
                  <ReferenceSelect
                    value={editForm.claimantCustomerId || null}
                    onChange={(v) => setEdit({ claimantCustomerId: v ?? "" })}
                    options={customerOptions}
                    createKind="customer"
                    operatingCompanyId={operatingCompanyId}
                    placeholder="Select customer"
                    disabled={!operatingCompanyId || customersQuery.isLoading}
                    onSearch={setCustomerSearch}
                  />
                </div>
              </label>
              <label className="block">
                <span className={labelSpan}>Claim reason</span>
                <div className="mt-1">
                  <ReferenceSelect
                    value={editForm.claimReasonId || null}
                    onChange={(v) => setEdit({ claimReasonId: v ?? "" })}
                    options={reasonOptions}
                    createKind="cargo_claim_reason"
                    operatingCompanyId={operatingCompanyId}
                    placeholder="Select reason"
                    loading={reasonsQuery.isLoading}
                    disabled={!operatingCompanyId || reasonsQuery.isLoading}
                    onSearch={setReasonSearch}
                  />
                </div>
              </label>
              <label className="block">
                <span className={labelSpan}>Claimed amount</span>
                <div className="mt-1">
                  <MoneyInput
                    ariaLabel="Claimed amount"
                    valueCents={editForm.amountCents}
                    onChangeCents={(c) => setEdit({ amountCents: c })}
                    disabled={editForm.amountUndetermined}
                  />
                </div>
              </label>
              <div className="block">
                <label className={labelSpan} htmlFor={`${pageTestId}-edit-filed-date`}>Claim filed date</label>
                <DatePicker id={`${pageTestId}-edit-filed-date`} className={inputClass} value={editForm.claimFiledAt} onChange={(next) => setEdit({ claimFiledAt: next })} />
              </div>
              <label className="block md:col-span-2">
                <span className={labelSpan}>Description *</span>
                <textarea
                  className={inputClass}
                  rows={3}
                  value={editForm.description}
                  onChange={(e) => setEdit({ description: e.target.value })}
                />
              </label>
              <label className="block md:col-span-2">
                <span className={labelSpan}>Location</span>
                <input className={inputClass} value={editForm.location} onChange={(e) => setEdit({ location: e.target.value })} />
              </label>
            </div>
          ) : (
            <div className="space-y-1 text-xs text-slate-700">
              <div>
                Status: <span className="font-semibold">{String(detail?.status ?? "open")}</span>
              </div>
              <div>Date of loss: {detail ? formatDateUS(detail.incident_at) : "—"}</div>
              <div>
                Claimant:{" "}
                {detail?.claimant_customer_id ? (
                  <EntityLink
                    kind="customer"
                    id={String(detail.claimant_customer_id)}
                    label={entityLabel(customerNameById.get(String(detail.claimant_customer_id)), detail.claimant_customer_id, "Customer")}
                    onClick={() => navigate(`/customers/${String(detail.claimant_customer_id)}`)}
                  />
                ) : (
                  "—"
                )}
              </div>
              <div>
                Load:{" "}
                {detail?.load_id ? (
                  <EntityLink
                    kind="load"
                    id={String(detail.load_id)}
                    label={entityLabel(loadNumberById.get(String(detail.load_id)), detail.load_id, "Load")}
                  />
                ) : (
                  "—"
                )}
              </div>
              <div>
                Driver:{" "}
                {detail?.driver_id ? (
                  <EntityLink
                    kind="driver"
                    id={String(detail.driver_id)}
                    label={entityLabel(detail.driver_name, detail.driver_id, "Driver")}
                    onClick={() => navigate(`/drivers/${String(detail.driver_id)}`)}
                  />
                ) : (
                  "—"
                )}
              </div>
              <div>Reason: {String(detail?.claim_reason_code ?? "—")}</div>
              <div>Claimed: {formatCents(detail?.damage_amount_cents)}</div>
              <div>Filed: {detail?.claim_filed_at ? formatDateUS(detail.claim_filed_at) : "—"}</div>
              <div>Description: {String(detail?.description ?? "—")}</div>
            </div>
          )}

          {editError ? (
            <div className="mt-2 text-[11px] text-red-600" data-testid={`${pageTestId}-edit-error`}>
              {editError}
            </div>
          ) : null}

          <div className="mt-2 space-y-2 text-xs">
            <div className="text-slate-600">Photos ({photoCount})</div>
            <input
              type="file"
              accept="image/*"
              data-testid={`${pageTestId}-photo-input`}
              disabled={uploading || Boolean(detail?.voided_at)}
              onChange={(e) => void onPhotoSelected(e.target.files?.[0] ?? null)}
            />

            {!editMode && detail?.id && !detail.voided_at ? (
              <div className="mt-2 space-y-2" data-testid={`${pageTestId}-lifecycle`}>
                <div className="flex flex-wrap items-center gap-2">
                  {(["open", "investigating", "closed"] as const)
                    .filter((next) => next !== (String(detail?.status ?? "open")))
                    .map((next) => (
                      <button
                        key={next}
                        type="button"
                        className={
                          statusTarget === next
                            ? "rounded-sm border border-[#1f2a44] px-2 py-1 font-semibold text-[#1f2a44]"
                            : "rounded-sm border border-gray-300 px-2 py-1 text-slate-600"
                        }
                        data-testid={`${pageTestId}-status-${next}`}
                        onClick={() => setStatusTarget((cur) => (cur === next ? null : next))}
                      >
                        {next === "open" ? "Reopen" : next === "closed" ? "Close" : "Investigate"}
                      </button>
                    ))}
                </div>
                {statusTarget ? (
                  <div className="space-y-1">
                    <input
                      className={inputClass}
                      placeholder="Reason (required)"
                      value={statusReason}
                      data-testid={`${pageTestId}-status-reason`}
                      onChange={(e) => setStatusReason(e.target.value)}
                    />
                    <Button
                      size="sm"
                      disabled={statusReason.trim().length < 3}
                      data-testid={`${pageTestId}-status-apply`}
                      onClick={() => {
                        if (!detail?.id || !statusTarget) return;
                        void setSafetyIncidentStatus(
                          String(detail.id),
                          operatingCompanyId,
                          statusTarget,
                          statusReason.trim()
                        ).then(async () => {
                          setStatusTarget(null);
                          setStatusReason("");
                          refresh();
                          await detailQuery.refetch();
                        });
                      }}
                    >
                      Apply status
                    </Button>
                  </div>
                ) : null}

                {canVoid ? (
                  <div className="space-y-1 pt-2">
                    <button
                      type="button"
                      className="rounded-sm border border-gray-300 px-2 py-1 text-[#dc2626]"
                      data-testid={`${pageTestId}-void-btn`}
                      onClick={() => {
                        setVoidOpen((cur) => !cur);
                        setVoidError(null);
                      }}
                    >
                      Void cargo claim
                    </button>
                    {voidOpen ? (
                      <div className="space-y-1">
                        <input
                          className={inputClass}
                          placeholder="Void reason (required)"
                          value={voidReason}
                          data-testid={`${pageTestId}-void-reason`}
                          onChange={(e) => setVoidReason(e.target.value)}
                        />
                        {voidError ? (
                          <div className="text-[11px] text-[#dc2626]" data-testid={`${pageTestId}-void-error`}>
                            {voidError}
                          </div>
                        ) : null}
                        <Button
                          size="sm"
                          disabled={voidReason.trim().length < 3}
                          data-testid={`${pageTestId}-void-apply`}
                          onClick={() => {
                            if (!detail?.id) return;
                            setVoidError(null);
                            void voidSafetyIncident(String(detail.id), operatingCompanyId, voidReason.trim())
                              .then(async () => {
                                setVoidOpen(false);
                                setVoidReason("");
                                closeDetail();
                                refresh();
                              })
                              .catch((err: unknown) => {
                                setVoidError(userFacingApiError(err, "Could not void the cargo claim."));
                              });
                          }}
                        >
                          Confirm void
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {detail?.voided_at ? (
              <div className="text-[11px] text-slate-500" data-testid={`${pageTestId}-voided-note`}>
                Voided {formatDateUS(detail.voided_at)}
                {detail.voided_reason ? ` · ${String(detail.voided_reason)}` : ""}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <ConfirmModal
        open={Boolean(pendingUnlinkedCreate)}
        title="Create claim without a shipment?"
        message="A cargo claim without a linked shipment cannot satisfy 49 CFR 1005.2. Continue only if the shipment is genuinely unavailable."
        confirmLabel="Create unlinked claim"
        danger
        onClose={() => setPendingUnlinkedCreate(null)}
        onConfirm={async () => {
          if (!pendingUnlinkedCreate) return;
          const input = pendingUnlinkedCreate;
          await persistCreate(input);
        }}
      />

    </div>
  );
}
