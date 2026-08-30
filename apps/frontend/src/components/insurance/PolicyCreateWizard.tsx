import { useEffect, useMemo, useRef, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../api/client";
import {
  createPolicyWithBills,
  listInsuranceTypeCatalog,
  type AllocationMethod,
  type InsuranceCoverageType,
} from "../../api/insurance";
import { ListErrorState } from "../ListErrorState";
import { ParityDrawer } from "../parity/ParityDrawer";
import { EntityPicker } from "../parity/EntityPicker";
import type { EntityPickerOption } from "../parity/entityPickerRegistry";
import { ReferenceSelect } from "../parity/ReferenceSelect";
import { MoneyInput } from "../forms/MoneyInput";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";
import { useToast } from "../Toast";
import { formatQueryErrorDetail } from "../../lib/tableError";
import { useCostPerVehicle } from "./useCostPerVehicle";
import { formatUsdCents } from "../../lib/money";
import { userFacingApiError } from "../../lib/api-error-message";

/** Map with-bills 409s Cascade hit live (insurance_vendor_not_found on free-text insurer). */
export function mapPolicyWithBillsError(err: unknown): string {
  if (err instanceof ApiError) {
    const payload = (err.data ?? {}) as { error?: string; detail?: string; message?: string };
    if (payload.error === "insurance_vendor_not_found") {
      return "No vendor matches this insurer name. Pick an existing vendor or use + Add new in the Insurer dropdown (writes mdata.vendors — same table premium bills use).";
    }
    if (payload.error === "insurance_seed_bank_account_not_found") {
      return "No active bank account for this company to seed premium bills.";
    }
    if (payload.error === "asset_not_found") {
      return payload.detail
        ? `Covered unit not found: ${payload.detail}`
        : "A selected covered unit could not be resolved for this company.";
    }
    if (payload.error === "coverage_type_not_found") {
      return "Selected coverage type is not active for this company.";
    }
    if (typeof payload.message === "string" && payload.message.trim()) return payload.message;
    if (typeof payload.error === "string" && payload.error.trim()) {
      return payload.error.replaceAll("_", " ");
    }
    return `Unable to create policy (HTTP ${err.status}).`;
  }
  return userFacingApiError(err, "Unexpected error creating policy.");
}

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onCreated: (policyId?: string) => void;
};

type Step1 = {
  /** Canonical mdata.vendors id — picker value (R=W with premium-bill vendor lookup). */
  insurer_vendor_id: string;
  /** Resolved vendor_name submitted as insurer_name (atomic writer matches lower(trim(vendor_name))). */
  insurer_name: string;
  policy_number: string;
  coverage_type: string;
  effective_date: string;
  expiry_date: string;
  status: string;
  insurer_email: string;
  agent_contact: string;
};

type Step3 = {
  total_premium: string;
  down_payment: string;
  term_months: string;
  allocation_method: AllocationMethod;
};

type BillPreviewRow = {
  bill_number: number;
  amount_cents: number;
  per_vehicle_cents: number | null;
};

const ALLOCATION_LABELS: Record<AllocationMethod, string> = {
  equal_split: "Equal split (default)",
  pro_rata: "Pro-rata by value",
  weighted: "Weighted custom %",
};

function parsePremiumCents(raw: string): number | null {
  if (!raw.trim()) return null;
  const v = Number(raw);
  if (!Number.isFinite(v) || v <= 0) return null;
  return Math.round(v * 100);
}

const INITIAL_STEP1: Step1 = {
  insurer_vendor_id: "",
  insurer_name: "",
  policy_number: "",
  coverage_type: "",
  effective_date: "",
  expiry_date: "",
  status: "active",
  insurer_email: "",
  agent_contact: "",
};

const INITIAL_STEP3: Step3 = {
  total_premium: "",
  down_payment: "",
  term_months: "12",
  allocation_method: "equal_split",
};

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full transition-all ${
            i + 1 === current ? "w-6 bg-emerald-600" : i + 1 < current ? "w-3 bg-emerald-400" : "w-3 bg-gray-200"
          }`}
        />
      ))}
      <span className="ml-2 text-xs text-slate-500">
        Step {current} of {total}
      </span>
    </div>
  );
}

export function PolicyCreateWizard({ open, operatingCompanyId, onClose, onCreated }: Props) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [step1, setStep1] = useState<Step1>(INITIAL_STEP1);
  const [step1Errors, setStep1Errors] = useState<Partial<Record<keyof Step1, string>>>({});
  const [selectedUnits, setSelectedUnits] = useState<EntityPickerOption[]>([]);
  const [unitPickerValue, setUnitPickerValue] = useState<string | null>(null);
  const [step3, setStep3] = useState<Step3>(INITIAL_STEP3);
  const [step3Errors, setStep3Errors] = useState<Partial<Record<keyof Step3, string>>>({});
  const [serverError, setServerError] = useState("");

  // INS-MONEY-F6843A-POLICY-WITH-BILLS-CREATE-MUTABLE-SCOPE-PENDING-DISMISS: createMutation used to
  // submit a zero-input mutate() whose mutationFn/onSuccess closed over the LIVE operatingCompanyId
  // (and, transitively, vendor/unit selections made under a possibly-earlier company — this wizard
  // only reset its form state on `open`, never on an operatingCompanyId change while already open).
  // Same scope-generation-snapshot idiom already used by PaymentScheduleTab.tsx's markPaidMutation /
  // units/UnitPermitsTab.tsx's deleteMutation: a ref bumped on scope-key change, the mutation's
  // variables carry an immutable snapshot (including the generation), and onSuccess/onError bail if
  // the generation has since moved on.
  const scopeGenerationRef = useRef(0);

  const typesQuery = useQuery({
    queryKey: ["insurance", "type-catalog", operatingCompanyId],
    enabled: open && Boolean(operatingCompanyId),
    queryFn: () => listInsuranceTypeCatalog({ operating_company_id: operatingCompanyId }).then((r) => r.types),
  });

  useEffect(() => {
    // Bump the generation on EVERY mount of this effect (open transition OR a company switch while
    // already open) — a mutation snapshot taken before this point is now stale and its
    // onSuccess/onError must not touch the toast/onCreated callback for whatever is now visible.
    scopeGenerationRef.current += 1;
    if (!open) return;
    setStep(1);
    setStep1(INITIAL_STEP1);
    setStep1Errors({});
    setSelectedUnits([]);
    setUnitPickerValue(null);
    setStep3(INITIAL_STEP3);
    setStep3Errors({});
    setServerError("");
  }, [open, operatingCompanyId]);

  const premiumCents = useMemo(() => parsePremiumCents(step3.total_premium) ?? 0, [step3.total_premium]);
  const downPaymentCents = useMemo(() => parsePremiumCents(step3.down_payment) ?? 0, [step3.down_payment]);
  const termMonths = useMemo(() => {
    const v = Number(step3.term_months);
    return Number.isInteger(v) && v > 0 ? v : 0;
  }, [step3.term_months]);

  const costInfo = useCostPerVehicle(premiumCents, termMonths, selectedUnits.length, step3.allocation_method);

  const billPreview = useMemo(() => {
    if (premiumCents <= 0 || termMonths <= 0) return [];
    const monthlyAmounts: number[] = [];
    const base = Math.floor(premiumCents / termMonths);
    const remainder = premiumCents - base * termMonths;
    for (let i = 0; i < termMonths; i++) {
      monthlyAmounts.push(base + (i < remainder ? 1 : 0));
    }
    return monthlyAmounts;
  }, [premiumCents, termMonths]);

  const formatMoney = (cents: number) => formatUsdCents(cents);

  const billPreviewRows = useMemo((): BillPreviewRow[] => {
    const perVehicle =
      costInfo.costPerVehiclePerMonthCents.length > 0
        ? (costInfo.costPerVehiclePerMonthCents[0] ?? 0)
        : null;
    return billPreview.map((amount, i) => ({
      bill_number: i + 1,
      amount_cents: amount,
      per_vehicle_cents: perVehicle,
    }));
  }, [billPreview, costInfo.costPerVehiclePerMonthCents]);

  const billPreviewColumns = useMemo(
    (): Array<ParityColumn<BillPreviewRow>> => [
      {
        key: "bill_number",
        label: "Bill #",
        sortable: true,
        render: (row) => row.bill_number,
      },
      {
        key: "amount_cents",
        label: "Amount",
        sortable: true,
        render: (row) => (
          <span className="font-medium text-slate-800">{formatUsdCents(row.amount_cents)}</span>
        ),
      },
      {
        key: "per_vehicle_cents",
        label: "Per vehicle / mo",
        sortable: true,
        render: (row) =>
          row.per_vehicle_cents == null ? "—" : formatUsdCents(row.per_vehicle_cents),
      },
    ],
    [],
  );

  const validateStep1 = () => {
    const errors: Partial<Record<keyof Step1, string>> = {};
    if (!step1.insurer_vendor_id.trim() || !step1.insurer_name.trim()) {
      errors.insurer_name = "Select an insurer vendor (or + Add new).";
    }
    if (!step1.policy_number.trim()) errors.policy_number = "Policy number is required.";
    if (!step1.coverage_type) errors.coverage_type = "Coverage type is required.";
    if (!step1.effective_date) errors.effective_date = "Effective date is required.";
    if (!step1.expiry_date) errors.expiry_date = "Expiry date is required.";
    if (step1.effective_date && step1.expiry_date && step1.expiry_date < step1.effective_date) {
      errors.expiry_date = "Expiry must be on or after effective date.";
    }
    if (step1.insurer_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(step1.insurer_email.trim())) {
      errors.insurer_email = "Enter a valid email.";
    }
    setStep1Errors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateStep3 = () => {
    const errors: Partial<Record<keyof Step3, string>> = {};
    const p = parsePremiumCents(step3.total_premium);
    if (p === null) errors.total_premium = "Enter a valid premium amount.";
    const t = Number(step3.term_months);
    if (!Number.isInteger(t) || t < 1) errors.term_months = "Term must be at least 1 month.";
    setStep3Errors(errors);
    return Object.keys(errors).length === 0;
  };

  const createMutation = useMutation({
    mutationFn: (input: { payload: Parameters<typeof createPolicyWithBills>[0]; generation: number }) =>
      createPolicyWithBills(input.payload),
    onSuccess: (result, input) => {
      if (input.generation !== scopeGenerationRef.current) return;
      pushToast(
        `Policy created + ${result.billCount} bills scheduled (${formatMoney(result.totalAmountCents)} total).`,
        "success"
      );
      onCreated(result.policyId);
    },
    onError: (err, input) => {
      if (input.generation !== scopeGenerationRef.current) return;
      setServerError(mapPolicyWithBillsError(err));
    },
  });
  const resetCreateMutation = createMutation.reset;

  useEffect(() => {
    resetCreateMutation();
  }, [operatingCompanyId, resetCreateMutation]);

  const submitCreatePolicy = () => {
    createMutation.mutate({
      payload: {
        operating_company_id: operatingCompanyId,
        vendor_id: step1.insurer_vendor_id,
        insurer_name: step1.insurer_name.trim(),
        policy_number: step1.policy_number.trim(),
        coverage_type: step1.coverage_type as InsuranceCoverageType,
        effective_date: step1.effective_date,
        expiry_date: step1.expiry_date,
        total_premium_cents: premiumCents,
        down_payment_cents: downPaymentCents,
        term_months: termMonths,
        allocation_method: step3.allocation_method,
        unit_ids: selectedUnits.map((unit) => unit.value),
        status: step1.status as "active" | "pending",
        insurer_email: step1.insurer_email.trim() || null,
        agent_contact: step1.agent_contact.trim() || null,
      },
      generation: scopeGenerationRef.current,
    });
  };

  // Refuse drawer dismissal (X / backdrop / Escape, all routed through ParityDrawer's onClose) and
  // the step-1 Cancel button while the create-with-bills write is actually in flight — a raw
  // onClose during persistence let the wizard close as if nothing were happening while a policy +
  // bill set could still land moments later, inviting a confused duplicate re-submit.
  const guardedOnClose = () => {
    if (createMutation.isPending) return;
    onClose();
  };

  const title = [
    "Step 1 — Carrier & Type",
    "Step 2 — Select Vehicles",
    "Step 3 — Premium & Term",
    "Step 4 — Review Bills",
  ][step - 1]!;

  return (
    <ParityDrawer open={open} onClose={guardedOnClose} title={title} size="wide">
      <div className="space-y-4 text-sm">
        <StepIndicator current={step} total={4} />

        {serverError ? (
          <div className="rounded-sm border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
            {serverError}
          </div>
        ) : null}

        {step === 1 && (
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Insurer (vendor) *" error={step1Errors.insurer_name}>
              {/* FAIL-INS-VENDOR-UX / CLS-SILENT-CAP: EntityPicker → mdata.vendors (atomic bill vendor match). */}
              <EntityPicker
                kind="vendor"
                allowCreate
                nestedInDrawer
                operatingCompanyId={operatingCompanyId}
                value={step1.insurer_vendor_id || null}
                onChange={(next, option) => {
                  const id = next ?? "";
                  setStep1((s) => ({
                    ...s,
                    insurer_vendor_id: id,
                    insurer_name: option?.label ?? (id ? s.insurer_name : ""),
                  }));
                  setStep1Errors((e) => ({ ...e, insurer_name: undefined }));
                  setServerError("");
                }}
                enabled={open}
                placeholder="Select insurer vendor"
                dataField="policy-wizard-insurer-vendor"
                className="w-full"
              />
            </Field>
            <Field label="Policy Number *" error={step1Errors.policy_number}>
              <input
                className="w-full rounded-sm border border-gray-300 px-2 py-1"
                value={step1.policy_number}
                onChange={(e) => setStep1((s) => ({ ...s, policy_number: e.target.value }))}
              />
            </Field>
            <Field label="Coverage Type *" error={step1Errors.coverage_type}>
              {typesQuery.isError ? (
                <ListErrorState
                  title="Couldn't load coverage types"
                  {...formatQueryErrorDetail(typesQuery.error)}
                  onRetry={() => void typesQuery.refetch()}
                  className="py-4"
                />
              ) : (
                // LST-PICKER-01 (guard 1864): bare <select> → ReferenceSelect inline create.
                // Value is coverage CODE (policies store coverage_type text, not type_catalog UUID).
                <ReferenceSelect
                  value={step1.coverage_type || null}
                  onChange={(next) => setStep1((s) => ({ ...s, coverage_type: next ?? "" }))}
                  options={(typesQuery.data ?? []).map((t) => ({ value: t.code, label: t.name }))}
                  createKind="insurance_coverage_type"
                  createdValueField="code"
                  operatingCompanyId={operatingCompanyId}
                  placeholder="Select type"
                  onOptionCreated={async (opt) => {
                    setStep1((s) => ({ ...s, coverage_type: opt.value }));
                    await queryClient.invalidateQueries({ queryKey: ["insurance", "type-catalog", operatingCompanyId] });
                  }}
                />
              )}
            </Field>
            <Field label="Status">
              <select
                className="w-full rounded-sm border border-gray-300 px-2 py-1"
                value={step1.status}
                onChange={(e) => setStep1((s) => ({ ...s, status: e.target.value }))}
              >
                <option value="active">Active</option>
                <option value="pending">Pending</option>
              </select>
            </Field>
            <Field label="Effective Date *" error={step1Errors.effective_date}>
              <DatePicker
                className="w-full"
                value={step1.effective_date}
                onChange={(next) => setStep1((s) => ({ ...s, effective_date: next }))}
              />
            </Field>
            <Field label="Expiry Date *" error={step1Errors.expiry_date}>
              <DatePicker
                className="w-full"
                value={step1.expiry_date}
                onChange={(next) => setStep1((s) => ({ ...s, expiry_date: next }))}
              />
            </Field>
            <Field label="Insurer Email" error={step1Errors.insurer_email}>
              <input
                type="email"
                className="w-full rounded-sm border border-gray-300 px-2 py-1"
                value={step1.insurer_email}
                onChange={(e) => setStep1((s) => ({ ...s, insurer_email: e.target.value }))}
              />
            </Field>
            <Field label="Agent Contact">
              <input
                className="w-full rounded-sm border border-gray-300 px-2 py-1"
                value={step1.agent_contact}
                onChange={(e) => setStep1((s) => ({ ...s, agent_contact: e.target.value }))}
              />
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">Select Vehicles *</span>
              <span className="text-xs font-medium text-slate-600">
                {selectedUnits.length} selected
              </span>
            </div>
            <EntityPicker
              kind="unit"
              operatingCompanyId={operatingCompanyId}
              value={unitPickerValue}
              onChange={(unitId, option) => {
                if (!unitId || !option) return;
                setSelectedUnits((current) => current.some((unit) => unit.value === unitId) ? current : [...current, option]);
                setUnitPickerValue(null);
              }}
              enabled={open}
              nestedInDrawer
              placeholder="Search by unit / VIN..."
              ariaLabel="Add covered unit"
              dataTestId="policy-wizard-unit-search"
            />
            <div className="flex flex-wrap gap-1.5" data-testid="policy-wizard-selected-units">
              {selectedUnits.map((unit) => (
                <button
                  key={unit.value}
                  type="button"
                  onClick={() => setSelectedUnits((current) => current.filter((item) => item.value !== unit.value))}
                  className="rounded-full border border-gray-300 bg-gray-50 px-2 py-1 text-xs text-slate-700"
                  aria-label={`Remove ${unit.label}`}
                >
                  {unit.label} ×
                </button>
              ))}
            </div>
            {selectedUnits.length === 0 && (
              <p className="text-xs text-slate-700">Select at least one vehicle to continue.</p>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Total Premium (USD) *" error={step3Errors.total_premium}>
                {/* M-1: dollars-mode QBO money entry; bridged so parsePremiumCents (×100) is byte-for-byte. */}
                <MoneyInput
                  valueDollars={step3.total_premium ? Number(step3.total_premium) : null}
                  onChangeDollars={(d) => setStep3((s) => ({ ...s, total_premium: d == null ? "" : String(d) }))}
                  ariaLabel="Total Premium (USD)"
                />
              </Field>
              <Field label="Down Payment (USD)">
                <MoneyInput
                  valueDollars={step3.down_payment ? Number(step3.down_payment) : null}
                  onChangeDollars={(d) => setStep3((s) => ({ ...s, down_payment: d == null ? "" : String(d) }))}
                  ariaLabel="Down Payment (USD)"
                />
              </Field>
              <Field label="Term (months) *" error={step3Errors.term_months}>
                <input
                  type="number"
                  min="1"
                  max="120"
                  className="w-full rounded-sm border border-gray-300 px-2 py-1"
                  value={step3.term_months}
                  onChange={(e) => setStep3((s) => ({ ...s, term_months: e.target.value }))}
                />
              </Field>
            </div>
            <Field label="Allocation Method">
              <div className="grid grid-cols-1 gap-1.5">
                {(Object.keys(ALLOCATION_LABELS) as AllocationMethod[]).map((method) => (
                  <label key={method} className="flex cursor-pointer items-center gap-2 text-xs text-slate-700">
                    <input
                      type="radio"
                      name="allocation_method"
                      value={method}
                      checked={step3.allocation_method === method}
                      onChange={() => setStep3((s) => ({ ...s, allocation_method: method }))}
                    />
                    {ALLOCATION_LABELS[method]}
                  </label>
                ))}
              </div>
            </Field>
            {premiumCents > 0 && termMonths > 0 && selectedUnits.length > 0 ? (
              <div className="rounded-sm border border-slate-200 bg-slate-100 px-4 py-3">
                <p className="text-xs font-semibold text-slate-700">Cost per vehicle insured per month</p>
                <p className="mt-0.5 text-lg font-bold text-slate-700">{costInfo.costPerVehicleDisplay}</p>
                <p className="mt-0.5 text-xs text-slate-600">
                  {selectedUnits.length} vehicle{selectedUnits.length !== 1 ? "s" : ""} ·{" "}
                  {formatMoney(costInfo.totalMonthlyPremiumCents)} / mo total · {termMonths} month term
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-400">Enter premium and term to see per-vehicle cost.</p>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <div className="rounded-sm border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="font-semibold text-slate-700">Carrier</span>
                <span className="text-slate-700">{step1.insurer_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-slate-700">Policy #</span>
                <span className="text-slate-700">{step1.policy_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-slate-700">Vehicles</span>
                <span className="text-slate-700">{selectedUnits.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-slate-700">Total premium</span>
                <span className="text-slate-700">{formatMoney(premiumCents)}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-slate-700">Per vehicle / mo</span>
                <span className="font-semibold text-slate-700">{costInfo.costPerVehicleDisplay}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-slate-700">Allocation</span>
                <span className="text-slate-700">{ALLOCATION_LABELS[step3.allocation_method]}</span>
              </div>
            </div>
            <p className="text-xs font-semibold text-slate-700">
              Bill schedule — {billPreview.length} monthly bills
            </p>
            <div className="max-h-48 overflow-y-auto">
              <ParityTable<BillPreviewRow>
                columns={billPreviewColumns}
                rows={billPreviewRows}
                rowKey={(row) => String(row.bill_number)}
                emptyText="Enter premium and term to preview bills."
                storageKey="insurance-policy-create-bill-schedule"
                tableTestId="policy-create-bill-schedule"
                pageSizeOptions={[12, 24, 60, 120]}
                initialPageSize={12}
                stickyHeader
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-gray-100 pt-3">
          <button
            type="button"
            className="rounded-sm border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50"
            onClick={step === 1 ? guardedOnClose : () => setStep((s) => s - 1)}
          >
            {step === 1 ? "Cancel" : "Back"}
          </button>
          <div className="flex gap-2">
            {step < 4 && (
              <button
                type="button"
                disabled={step === 2 && selectedUnits.length === 0}
                className="rounded-sm border border-[#1f2a44] bg-[#1f2a44] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0f1729] disabled:opacity-50"
                onClick={() => {
                  if (step === 1 && !validateStep1()) return;
                  if (step === 3 && !validateStep3()) return;
                  setStep((s) => s + 1);
                }}
              >
                Next
              </button>
            )}
            {step === 4 && (
              <button
                type="button"
                disabled={createMutation.isPending}
                className="rounded-sm border border-[#1f2a44] bg-[#1f2a44] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#0f1729] disabled:opacity-50"
                onClick={submitCreatePolicy}
              >
                {createMutation.isPending
                  ? "Creating..."
                  : `+ Create policy + schedule ${billPreview.length} bills`}
              </button>
            )}
          </div>
        </div>
      </div>
    </ParityDrawer>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-semibold text-slate-700">{label}</span>
      {children}
      {error ? <span className="block text-xs text-red-700">{error}</span> : null}
    </label>
  );
}
