import { useEffect, useMemo, useRef, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ApiError } from "../../api/client";
import {
  insuranceClaimsApi,
  type InsuranceClaimFault,
  type InsuranceClaimRecoveryRail,
  type InsuranceClaimRepairBooksTreatment,
  type InsuranceClaimStatus,
} from "../../api/insurance";
import { suggestExpenseLoad } from "../../api/maintenance";
import { getSafetyAccidents } from "../../api/safety";
import { DriverPickerWithCreate } from "../drivers/DriverPickerWithCreate";
import { EntityPicker } from "../parity/EntityPicker";
import { ParityDrawer } from "../parity/ParityDrawer";
import { MoneyInput } from "../forms/MoneyInput";
import { useToast } from "../Toast";
import { Combobox } from "../Combobox";
import { LoadSuggestionReadError } from "../shared/LoadSuggestionReadError";

/** Tri-state driver_responsible: "" = not yet determined (NULL), "true" / "false" = decided. */
type DriverResponsibleOption = "" | "true" | "false";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onCreated: (id?: string, label?: string) => void;
};

type FormState = {
  claim_number: string;
  policy_id: string;
  asset_id: string;
  driver_id: string;
  load_id: string;
  accident_report_id: string;
  accident_date: string;
  reported_date: string;
  status: InsuranceClaimStatus;
  amount_claimed: string;
  amount_paid: string;
  adjuster_name: string;
  adjuster_email: string;
  notes: string;
  // WIZARD-CLAIM-ECONOMICS-DEPTH slice 2 (202607730000, HOLD — schema not yet on prod). Pure capture;
  // no GL posting reads/writes any of these fields in this slice.
  fault: InsuranceClaimFault;
  driver_responsible: DriverResponsibleOption;
  trailer_id: string;
  deductible: string;
  /** Owner lock #1 — ALWAYS ASK; the picker must always default here and never auto-advance. */
  recovery_rail: InsuranceClaimRecoveryRail;
  /** Owner lock #2 (Choice Z) — ALWAYS ASK; no $ threshold anywhere. */
  repair_books_treatment: InsuranceClaimRepairBooksTreatment;
};


const INITIAL_FORM: FormState = {
  claim_number: "",
  policy_id: "",
  asset_id: "",
  driver_id: "",
  load_id: "",
  accident_report_id: "",
  accident_date: "",
  reported_date: "",
  status: "open",
  amount_claimed: "",
  amount_paid: "",
  adjuster_name: "",
  adjuster_email: "",
  notes: "",
  fault: "undetermined",
  driver_responsible: "",
  trailer_id: "",
  deductible: "",
  recovery_rail: "ask",
  repair_books_treatment: "ask",
};

function parseCurrencyToCents(raw: string) {
  if (!raw.trim()) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

function mapApi4xxToErrors(error: ApiError): {
  fieldErrors: Partial<Record<keyof FormState, string>>;
  formError?: string;
} {
  const payload = (error.data ?? {}) as {
    error?: string;
    details?: { fieldErrors?: Record<string, string[] | string>; formErrors?: string[] };
    message?: string;
  };
  const fieldErrors: Partial<Record<keyof FormState, string>> = {};
  const fromDetails = payload.details?.fieldErrors ?? {};
  for (const [key, value] of Object.entries(fromDetails)) {
    const message = Array.isArray(value) ? value[0] : value;
    if (!message) continue;
    if (key in INITIAL_FORM) fieldErrors[key as keyof FormState] = String(message);
  }
  if (payload.error === "forbidden") {
    return { fieldErrors, formError: "You are not allowed to create insurance claims." };
  }
  const formError = payload.details?.formErrors?.[0] || payload.message || payload.error;
  return {
    fieldErrors,
    formError: formError ? String(formError).replaceAll("_", " ") : "Unable to create claim.",
  };
}

export function ClaimCreateModal({ open, operatingCompanyId, onClose, onCreated }: Props) {
  const { pushToast } = useToast();
  const lifecycleGenerationRef = useRef(0);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [formError, setFormError] = useState("");
  const [serverError, setServerError] = useState("");
  /** Once auto-filled from suggest-load, do not clobber an operator override until driver/unit/trailer/date change. */
  const [suggestionPinned, setSuggestionPinned] = useState(false);
  // SAF-B29 / picker law: load + trailer → EntityPicker (server search + nested create).

  // Policies load via EntityPicker kind=insurance_policy (no local listInsurancePolicies query).


  const accidentsQuery = useQuery({
    queryKey: ["insurance", "claim-create", "accidents", operatingCompanyId],
    enabled: open && Boolean(operatingCompanyId),
    queryFn: () => getSafetyAccidents(operatingCompanyId).then((r) => r.accidents ?? []),
  });

  // Going-forward trip linkage: same suggest-load resolver as WO / RecordExpense — stamp active load
  // when driver or unit (asset) is set for the accident date. Do not invent FKs on empty history.
  const suggestionQuery = useQuery({
    queryKey: [
      "insurance",
      "claim-create",
      "suggest-load",
      operatingCompanyId,
      form.driver_id,
      form.asset_id,
      form.trailer_id,
      form.accident_date,
    ],
    queryFn: () =>
      suggestExpenseLoad({
        operating_company_id: operatingCompanyId,
        driver_id: form.driver_id || undefined,
        unit_id: form.asset_id || undefined,
        trailer_id: form.trailer_id || undefined,
        transaction_date: form.accident_date,
      }),
    enabled:
      open &&
      Boolean(operatingCompanyId && form.accident_date && (form.driver_id || form.asset_id || form.trailer_id)),
  });

  const accidentOptions = useMemo(
    () =>
      (accidentsQuery.isError ? [] : (accidentsQuery.data ?? [])).map((accident) => {
        const value = String(accident.id ?? "");
        const when = accident.accident_at ? String(accident.accident_at).slice(0, 10) : "Date unavailable";
        return { value, label: `Accident — ${when}` };
      }).filter((option) => option.value),
    [accidentsQuery.data, accidentsQuery.isError],
  );

  useEffect(() => {
    if (!open) return;
    setForm(INITIAL_FORM);
    setFieldErrors({});
    setFormError("");
    setServerError("");
    setSuggestionPinned(false);
  }, [open]);

  useEffect(() => {
    setSuggestionPinned(false);
  }, [form.driver_id, form.asset_id, form.trailer_id, form.accident_date]);

  useEffect(() => {
    if (!open) return;
    if (form.load_id || suggestionPinned) return;
    const suggested = suggestionQuery.data?.data;
    if (!suggested?.load_id) return;
    setForm((prev) => ({ ...prev, load_id: suggested.load_id }));
    setSuggestionPinned(true);
  }, [form.load_id, open, suggestionPinned, suggestionQuery.data]);

  const createMutation = useMutation({
    mutationFn: (input: {
      companyId: string;
      generation: number;
      payload: Omit<Parameters<typeof insuranceClaimsApi.create>[0], "operating_company_id">;
    }) => insuranceClaimsApi.create({ ...input.payload, operating_company_id: input.companyId }),
    onSuccess: (claim, input) => {
      if (input.generation !== lifecycleGenerationRef.current) return;
      pushToast("Claim created successfully.", "success");
      onCreated(claim.id, claim.claim_number);
    },
    onError: (error, input) => {
      if (input.generation !== lifecycleGenerationRef.current) return;
      if (!(error instanceof ApiError)) {
        setServerError("Unexpected error while creating claim. Please try again.");
        return;
      }
      if (error.status >= 500) {
        setServerError("Server error while creating claim. Please retry in a moment.");
        return;
      }
      const mapped = mapApi4xxToErrors(error);
      setFieldErrors((prev) => ({ ...prev, ...mapped.fieldErrors }));
      if (mapped.formError) setFormError(mapped.formError);
    },
  });

  useEffect(() => {
    lifecycleGenerationRef.current += 1;
    createMutation.reset();
    setForm(INITIAL_FORM);
    setFieldErrors({});
    setFormError("");
    setServerError("");
    setSuggestionPinned(false);
  }, [operatingCompanyId]);

  const closeModal = () => {
    if (createMutation.isPending) return;
    lifecycleGenerationRef.current += 1;
    createMutation.reset();
    onClose();
  };

  const updateField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setFormError("");
    setServerError("");
  };

  const onSubmit = () => {
    const nextFieldErrors: Partial<Record<keyof FormState, string>> = {};
    if (!form.claim_number.trim()) nextFieldErrors.claim_number = "Claim number is required.";
    if (!form.policy_id) nextFieldErrors.policy_id = "Policy is required.";
    if (!form.accident_date) nextFieldErrors.accident_date = "Accident date is required.";
    if (!form.reported_date) nextFieldErrors.reported_date = "Reported date is required.";
    if (form.accident_date && form.reported_date && form.reported_date < form.accident_date) {
      nextFieldErrors.reported_date = "Reported date must be on or after accident date.";
    }

    const amountClaimedCents = parseCurrencyToCents(form.amount_claimed);
    if (amountClaimedCents === null) nextFieldErrors.amount_claimed = "Amount claimed must be a valid non-negative amount.";
    const amountPaidCents = parseCurrencyToCents(form.amount_paid);
    if (amountPaidCents === null) nextFieldErrors.amount_paid = "Amount paid must be a valid non-negative amount.";
    const deductibleCents = parseCurrencyToCents(form.deductible);
    if (deductibleCents === null) nextFieldErrors.deductible = "Deductible must be a valid non-negative amount.";

    if (form.adjuster_email.trim()) {
      const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.adjuster_email.trim());
      if (!validEmail) nextFieldErrors.adjuster_email = "Enter a valid adjuster email.";
    }

    setFieldErrors(nextFieldErrors);
    setFormError("");
    setServerError("");
    if (Object.keys(nextFieldErrors).length > 0) return;

    createMutation.mutate({
      companyId: operatingCompanyId,
      generation: lifecycleGenerationRef.current,
      payload: {
        claim_number: form.claim_number.trim(),
        policy_id: form.policy_id,
        asset_id: form.asset_id || null,
        driver_id: form.driver_id || null,
        load_id: form.load_id || null,
        accident_report_id: form.accident_report_id || null,
        accident_date: form.accident_date,
        reported_date: form.reported_date,
        status: form.status,
        amount_claimed_cents: typeof amountClaimedCents === "number" ? amountClaimedCents : undefined,
        amount_paid_cents: typeof amountPaidCents === "number" ? amountPaidCents : undefined,
        adjuster_name: form.adjuster_name.trim() || null,
        adjuster_email: form.adjuster_email.trim() || null,
        notes: form.notes.trim() || null,
        fault: form.fault,
        driver_responsible: form.driver_responsible === "" ? null : form.driver_responsible === "true",
        trailer_id: form.trailer_id || null,
        deductible_cents: typeof deductibleCents === "number" ? deductibleCents : undefined,
        recovery_rail: form.recovery_rail,
        repair_books_treatment: form.repair_books_treatment,
      },
    });
  };

  return (
    <ParityDrawer open={open} onClose={closeModal} title="Create Claim" size="wide">
      <form
        className="space-y-4 text-sm"
        data-testid="claim-create-form"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onSubmit();
        }}
      >
        {serverError ? (
          <div className="rounded-sm border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
            {serverError}
          </div>
        ) : null}
        {formError ? (
          <div className="rounded-sm border border-slate-300 bg-slate-100 px-3 py-2 text-xs text-slate-700" role="alert">
            {formError}
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-700">Claim Number *</span>
            <input
              className="w-full rounded-sm border border-gray-300 px-2 py-1"
              value={form.claim_number}
              onChange={(event) => updateField("claim_number", event.target.value)}
            />
            {fieldErrors.claim_number ? <span className="text-xs text-red-700">{fieldErrors.claim_number}</span> : null}
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-700">Policy *</span>
            <EntityPicker
              kind="insurance_policy"
              operatingCompanyId={operatingCompanyId}
              value={form.policy_id || null}
              onChange={(next) => updateField("policy_id", next ?? "")}
              enabled={open}
              placeholder="Select policy"
              nestedInDrawer
            />
            {fieldErrors.policy_id ? (
              <span className="text-xs text-red-700" role="alert">
                Policy is required or invalid.
              </span>
            ) : null}
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-700">Unit / Asset</span>
            <EntityPicker
              kind="unit"
              operatingCompanyId={operatingCompanyId}
              value={form.asset_id || null}
              onChange={(next) => updateField("asset_id", next ?? "")}
              enabled={open}
              placeholder="Unassigned"
              nestedInDrawer
            />
          </label>

          <label className="space-y-1" data-testid="claim-create-driver-field">
            <span className="text-xs font-semibold text-slate-700">Driver</span>
            <DriverPickerWithCreate
              operatingCompanyId={operatingCompanyId}
              value={form.driver_id || null}
              onChange={(next) => updateField("driver_id", next ?? "")}
              open={open}
              shell="drawer"
              placeholder="Unassigned"
            />
          </label>

          <label className="space-y-1" data-testid="claim-create-load-field">
            <span className="text-xs font-semibold text-slate-700">Load</span>
            <EntityPicker
              kind="load"
              operatingCompanyId={operatingCompanyId}
              value={form.load_id || null}
              onChange={(next) => updateField("load_id", next ?? "")}
              enabled={open}
              allowCreate={false}
              placeholder="Unassigned"
              nestedInDrawer
              dataTestId="claim-create-load-picker"
            />
            {suggestionPinned && form.load_id && suggestionQuery.data?.data?.load_id === form.load_id ? (
              <span className="text-[11px] text-slate-600" data-testid="claim-create-load-suggested">
                Auto-filled from active trip for this driver/unit/trailer on the accident date.
              </span>
            ) : null}
            <LoadSuggestionReadError query={suggestionQuery} />
          </label>

          <label className="space-y-1" data-testid="claim-create-trailer-field">
            <span className="text-xs font-semibold text-slate-700">Trailer</span>
            <EntityPicker
              kind="trailer"
              operatingCompanyId={operatingCompanyId}
              value={form.trailer_id || null}
              onChange={(next) => updateField("trailer_id", next ?? "")}
              enabled={open}
              placeholder="Unassigned"
              nestedInDrawer
              dataTestId="claim-create-trailer-picker"
            />
          </label>

          <div className="space-y-1" data-testid="claim-create-accident-field">
            <label htmlFor="claim-create-accident-picker" className="text-xs font-semibold text-slate-700">Accident report</label>
            <Combobox
              id="claim-create-accident-picker"
              options={accidentOptions}
              value={form.accident_report_id || null}
              onChange={(next) => updateField("accident_report_id", next ?? "")}
              placeholder="Unassigned"
              loading={accidentsQuery.isLoading}
              disabled={accidentsQuery.isError}
              error={accidentsQuery.isError ? "Couldn't load accident reports" : undefined}
            />
            {accidentsQuery.isError ? (
              <button
                type="button"
                className="text-xs font-semibold text-slate-700 underline"
                onClick={() => void accidentsQuery.refetch()}
              >
                Retry accident reports
              </button>
            ) : null}
          </div>

          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-700">Status</span>
            <select
              className="w-full rounded-sm border border-gray-300 px-2 py-1"
              value={form.status}
              onChange={(event) => updateField("status", event.target.value as InsuranceClaimStatus)}
            >
              <option value="open">Open</option>
              <option value="investigating">Investigating</option>
              <option value="approved">Approved</option>
              <option value="denied">Denied</option>
              <option value="paid">Paid</option>
              <option value="closed">Closed</option>
            </select>
          </label>

          <label className="space-y-1" data-testid="claim-create-fault-field">
            <span className="text-xs font-semibold text-slate-700">Fault</span>
            <select
              className="w-full rounded-sm border border-gray-300 px-2 py-1"
              value={form.fault}
              onChange={(event) => updateField("fault", event.target.value as InsuranceClaimFault)}
            >
              <option value="undetermined">Undetermined</option>
              <option value="company">Company</option>
              <option value="third_party">Third party</option>
              <option value="shared">Shared</option>
            </select>
          </label>

          <label className="space-y-1" data-testid="claim-create-driver-responsible-field">
            <span className="text-xs font-semibold text-slate-700">Driver Responsible</span>
            <select
              className="w-full rounded-sm border border-gray-300 px-2 py-1"
              value={form.driver_responsible}
              onChange={(event) => updateField("driver_responsible", event.target.value as DriverResponsibleOption)}
            >
              <option value="">Not yet determined</option>
              <option value="true">Yes — driver responsible</option>
              <option value="false">No — driver not responsible</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-700">Accident Date *</span>
            <DatePicker
              className="w-full"
              value={form.accident_date}
              onChange={(next) => updateField("accident_date", next)}
            />
            {fieldErrors.accident_date ? <span className="text-xs text-red-700">{fieldErrors.accident_date}</span> : null}
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-700">Reported Date *</span>
            <DatePicker
              className="w-full"
              value={form.reported_date}
              onChange={(next) => updateField("reported_date", next)}
            />
            {fieldErrors.reported_date ? <span className="text-xs text-red-700">{fieldErrors.reported_date}</span> : null}
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-700">Amount Claimed (USD)</span>
            {/* M-1: dollars-mode QBO money entry; bridged over the string form so parseCurrencyToCents (×100) is byte-for-byte. */}
            <MoneyInput
              valueDollars={form.amount_claimed ? Number(form.amount_claimed) : null}
              onChangeDollars={(d) => updateField("amount_claimed", d == null ? "" : String(d))}
              ariaLabel="Amount Claimed (USD)"
            />
            {fieldErrors.amount_claimed ? <span className="text-xs text-red-700">{fieldErrors.amount_claimed}</span> : null}
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-700">Amount Paid (USD)</span>
            <MoneyInput
              valueDollars={form.amount_paid ? Number(form.amount_paid) : null}
              onChangeDollars={(d) => updateField("amount_paid", d == null ? "" : String(d))}
              ariaLabel="Amount Paid (USD)"
            />
            {fieldErrors.amount_paid ? <span className="text-xs text-red-700">{fieldErrors.amount_paid}</span> : null}
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-700">Adjuster Name</span>
            <input
              className="w-full rounded-sm border border-gray-300 px-2 py-1"
              value={form.adjuster_name}
              onChange={(event) => updateField("adjuster_name", event.target.value)}
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-700">Adjuster Email</span>
            <input
              type="email"
              className="w-full rounded-sm border border-gray-300 px-2 py-1"
              value={form.adjuster_email}
              onChange={(event) => updateField("adjuster_email", event.target.value)}
            />
            {fieldErrors.adjuster_email ? <span className="text-xs text-red-700">{fieldErrors.adjuster_email}</span> : null}
          </label>
        </div>

        {/* WIZARD-CLAIM-ECONOMICS-DEPTH slice 2 — pure capture, no GL posting reads/writes these
            fields. Owner locks #1/#2 (2026-07-22): recovery_rail and repair_books_treatment ALWAYS
            default to "ask" and are never auto-advanced by this form — the user must actively pick a
            value to move past "ask". No $ threshold anywhere: if the driver is at fault/responsible,
            they owe the FULL company-funded repair amount, not just the deductible. */}
        <div className="space-y-3 border-t border-gray-100 pt-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Deductible &amp; Recovery</h3>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="space-y-1">
              <span className="text-xs font-semibold text-slate-700">Deductible (USD)</span>
              <MoneyInput
                valueDollars={form.deductible ? Number(form.deductible) : null}
                onChangeDollars={(d) => updateField("deductible", d == null ? "" : String(d))}
                ariaLabel="Deductible (USD)"
              />
              {fieldErrors.deductible ? <span className="text-xs text-red-700">{fieldErrors.deductible}</span> : null}
            </label>

            <label className="space-y-1" data-testid="claim-create-recovery-rail-field">
              <span className="text-xs font-semibold text-slate-700">Driver Deductible Recovery</span>
              <select
                className="w-full rounded-sm border border-gray-300 px-2 py-1"
                value={form.recovery_rail}
                onChange={(event) => updateField("recovery_rail", event.target.value as InsuranceClaimRecoveryRail)}
              >
                <option value="ask">Ask later (not decided)</option>
                <option value="escrow">Recover from driver escrow</option>
                <option value="settlement">Recover from next settlement</option>
                <option value="split">Split escrow / settlement</option>
              </select>
            </label>

            <label className="space-y-1" data-testid="claim-create-repair-books-field">
              <span className="text-xs font-semibold text-slate-700">Uninsured Repair Books Treatment</span>
              <select
                className="w-full rounded-sm border border-gray-300 px-2 py-1"
                value={form.repair_books_treatment}
                onChange={(event) =>
                  updateField("repair_books_treatment", event.target.value as InsuranceClaimRepairBooksTreatment)
                }
              >
                <option value="ask">Ask later (not decided)</option>
                <option value="expense">Expense</option>
                <option value="capitalize">Capitalize</option>
              </select>
            </label>
          </div>
          <p className="text-xs text-gray-500">
            No dollar threshold applies to either choice above — every claim asks, every time. If the driver is
            at fault or responsible, they owe the full company-funded repair amount (not deductible-only),
            recovered via the same rail selected here.
          </p>
        </div>

        <label className="space-y-1">
          <span className="text-xs font-semibold text-slate-700">Notes</span>
          <textarea
            className="w-full rounded-sm border border-gray-300 px-2 py-1"
            rows={3}
            value={form.notes}
            onChange={(event) => updateField("notes", event.target.value)}
          />
        </label>

        <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
          <button
            type="button"
            className="rounded-sm border border-gray-300 px-3 py-1.5 text-xs"
            onClick={closeModal}
            disabled={createMutation.isPending}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-sm border border-[#1f2a44] bg-[#1f2a44] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0f1729] disabled:opacity-60"
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? "Creating..." : "+ Claim"}
          </button>
        </div>
      </form>
    </ParityDrawer>
  );
}
