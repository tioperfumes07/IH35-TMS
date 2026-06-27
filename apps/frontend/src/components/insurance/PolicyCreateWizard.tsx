import { useEffect, useMemo, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  createPolicyWithBills,
  listInsuranceTypeCatalog,
  type AllocationMethod,
  type InsuranceCoverageType,
} from "../../api/insurance";
import { listUnits } from "../../api/mdata";
import { Modal } from "../Modal";
import { MoneyInput } from "../forms/MoneyInput";
import { useToast } from "../Toast";
import { useCostPerVehicle } from "./useCostPerVehicle";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onCreated: () => void;
};

type UnitRow = {
  id: string;
  unit_code?: string | null;
  unit_number?: string | null;
  vin?: string | null;
  asset_type?: string | null;
  status?: string | null;
  operating_company_id?: string | null;
};

type Step1 = {
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

const ALLOCATION_LABELS: Record<AllocationMethod, string> = {
  equal_split: "Equal split (default)",
  pro_rata: "Pro-rata by value",
  weighted: "Weighted custom %",
};

const UNIT_TYPE_CHIPS = ["All", "Tractor", "Trailer", "Reefer", "TRK", "TRANSP"] as const;

function unitLabel(unit: UnitRow) {
  return unit.unit_code ?? unit.unit_number ?? unit.id.slice(0, 8);
}

function unitMatchesChip(unit: UnitRow, chip: string): boolean {
  if (chip === "All") return true;
  const t = (unit.asset_type ?? "").toLowerCase();
  const code = (unit.unit_code ?? "").toUpperCase();
  const oci = (unit.operating_company_id ?? "").toLowerCase();
  if (chip === "Tractor") return t.includes("tractor") || t.includes("truck");
  if (chip === "Trailer") return t.includes("trailer");
  if (chip === "Reefer") return t.includes("reefer");
  if (chip === "TRK") return code.includes("TRK") || oci.includes("trk");
  if (chip === "TRANSP") return code.includes("TRANSP") || oci.includes("transp");
  return true;
}

function parsePremiumCents(raw: string): number | null {
  if (!raw.trim()) return null;
  const v = Number(raw);
  if (!Number.isFinite(v) || v <= 0) return null;
  return Math.round(v * 100);
}

const INITIAL_STEP1: Step1 = {
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
  const [step, setStep] = useState(1);
  const [step1, setStep1] = useState<Step1>(INITIAL_STEP1);
  const [step1Errors, setStep1Errors] = useState<Partial<Record<keyof Step1, string>>>({});
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
  const [unitSearchQuery, setUnitSearchQuery] = useState("");
  const [activeChip, setActiveChip] = useState<(typeof UNIT_TYPE_CHIPS)[number]>("All");
  const [step3, setStep3] = useState<Step3>(INITIAL_STEP3);
  const [step3Errors, setStep3Errors] = useState<Partial<Record<keyof Step3, string>>>({});
  const [serverError, setServerError] = useState("");

  const typesQuery = useQuery({
    queryKey: ["insurance", "type-catalog", operatingCompanyId],
    enabled: open && Boolean(operatingCompanyId),
    queryFn: () => listInsuranceTypeCatalog({ operating_company_id: operatingCompanyId }).then((r) => r.types),
  });

  const unitsQuery = useQuery({
    queryKey: ["insurance", "wizard", "units", operatingCompanyId],
    enabled: open && Boolean(operatingCompanyId),
    queryFn: () => listUnits({ operating_company_id: operatingCompanyId, limit: 500 }).then((r) => r.units as UnitRow[]),
  });

  const allUnits = useMemo(() => (unitsQuery.data ?? []).filter((u) => Boolean(u.id)), [unitsQuery.data]);

  const filteredUnits = useMemo(() => {
    let rows = allUnits;
    if (activeChip !== "All") rows = rows.filter((u) => unitMatchesChip(u, activeChip));
    if (unitSearchQuery.trim()) {
      const q = unitSearchQuery.toLowerCase();
      rows = rows.filter(
        (u) =>
          (u.unit_code ?? "").toLowerCase().includes(q) ||
          (u.unit_number ?? "").toLowerCase().includes(q) ||
          (u.vin ?? "").toLowerCase().includes(q)
      );
    }
    return rows;
  }, [allUnits, activeChip, unitSearchQuery]);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setStep1(INITIAL_STEP1);
    setStep1Errors({});
    setSelectedUnitIds([]);
    setUnitSearchQuery("");
    setActiveChip("All");
    setStep3(INITIAL_STEP3);
    setStep3Errors({});
    setServerError("");
  }, [open]);

  const premiumCents = useMemo(() => parsePremiumCents(step3.total_premium) ?? 0, [step3.total_premium]);
  const downPaymentCents = useMemo(() => parsePremiumCents(step3.down_payment) ?? 0, [step3.down_payment]);
  const termMonths = useMemo(() => {
    const v = Number(step3.term_months);
    return Number.isInteger(v) && v > 0 ? v : 0;
  }, [step3.term_months]);

  const costInfo = useCostPerVehicle(premiumCents, termMonths, selectedUnitIds.length, step3.allocation_method);

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

  const formatMoney = (cents: number) =>
    `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const validateStep1 = () => {
    const errors: Partial<Record<keyof Step1, string>> = {};
    if (!step1.insurer_name.trim()) errors.insurer_name = "Insurer name is required.";
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
    mutationFn: () =>
      createPolicyWithBills({
        operating_company_id: operatingCompanyId,
        insurer_name: step1.insurer_name.trim(),
        policy_number: step1.policy_number.trim(),
        coverage_type: step1.coverage_type as InsuranceCoverageType,
        effective_date: step1.effective_date,
        expiry_date: step1.expiry_date,
        total_premium_cents: premiumCents,
        down_payment_cents: downPaymentCents,
        term_months: termMonths,
        allocation_method: step3.allocation_method,
        unit_ids: selectedUnitIds,
        status: step1.status as "active" | "pending",
        insurer_email: step1.insurer_email.trim() || null,
        agent_contact: step1.agent_contact.trim() || null,
      }),
    onSuccess: (result) => {
      pushToast(
        `Policy created + ${result.billCount} bills scheduled (${formatMoney(result.totalAmountCents)} total).`,
        "success"
      );
      onCreated();
    },
    onError: (err) => {
      setServerError(String((err as Error)?.message ?? "Unexpected error creating policy."));
    },
  });

  const title = [
    "Step 1 — Carrier & Type",
    "Step 2 — Select Vehicles",
    "Step 3 — Premium & Term",
    "Step 4 — Review Bills",
  ][step - 1]!;

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-4 text-sm">
        <StepIndicator current={step} total={4} />

        {serverError ? (
          <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
            {serverError}
          </div>
        ) : null}

        {step === 1 && (
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Insurer Name *" error={step1Errors.insurer_name}>
              <input
                className="w-full rounded border border-gray-300 px-2 py-1"
                value={step1.insurer_name}
                onChange={(e) => setStep1((s) => ({ ...s, insurer_name: e.target.value }))}
              />
            </Field>
            <Field label="Policy Number *" error={step1Errors.policy_number}>
              <input
                className="w-full rounded border border-gray-300 px-2 py-1"
                value={step1.policy_number}
                onChange={(e) => setStep1((s) => ({ ...s, policy_number: e.target.value }))}
              />
            </Field>
            <Field label="Coverage Type *" error={step1Errors.coverage_type}>
              <select
                className="w-full rounded border border-gray-300 px-2 py-1"
                value={step1.coverage_type}
                onChange={(e) => setStep1((s) => ({ ...s, coverage_type: e.target.value }))}
              >
                <option value="">Select type</option>
                {(typesQuery.data ?? []).map((t) => (
                  <option key={t.id} value={t.code}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select
                className="w-full rounded border border-gray-300 px-2 py-1"
                value={step1.status}
                onChange={(e) => setStep1((s) => ({ ...s, status: e.target.value }))}
              >
                <option value="active">Active</option>
                <option value="pending">Pending</option>
              </select>
            </Field>
            <Field label="Effective Date *" error={step1Errors.effective_date}>
              <DatePicker
                className="w-full rounded border border-gray-300 px-2 py-1"
                value={step1.effective_date}
                onChange={(next) => setStep1((s) => ({ ...s, effective_date: next }))}
              />
            </Field>
            <Field label="Expiry Date *" error={step1Errors.expiry_date}>
              <DatePicker
                className="w-full rounded border border-gray-300 px-2 py-1"
                value={step1.expiry_date}
                onChange={(next) => setStep1((s) => ({ ...s, expiry_date: next }))}
              />
            </Field>
            <Field label="Insurer Email" error={step1Errors.insurer_email}>
              <input
                type="email"
                className="w-full rounded border border-gray-300 px-2 py-1"
                value={step1.insurer_email}
                onChange={(e) => setStep1((s) => ({ ...s, insurer_email: e.target.value }))}
              />
            </Field>
            <Field label="Agent Contact">
              <input
                className="w-full rounded border border-gray-300 px-2 py-1"
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
                {selectedUnitIds.length} of {allUnits.length} selected
              </span>
            </div>
            <input
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs"
              placeholder="Search by unit / VIN..."
              value={unitSearchQuery}
              onChange={(e) => setUnitSearchQuery(e.target.value)}
            />
            <div className="flex flex-wrap gap-1.5">
              {UNIT_TYPE_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setActiveChip(chip)}
                  className={`rounded-full px-3 py-0.5 text-xs font-medium transition-colors ${
                    activeChip === chip
                      ? "bg-emerald-600 text-white"
                      : "bg-gray-100 text-slate-700 hover:bg-gray-200"
                  }`}
                >
                  {chip}
                </button>
              ))}
            </div>
            {selectedUnitIds.length === 0 && (
              <p className="text-xs text-amber-700">Select at least one vehicle to continue.</p>
            )}
            <div className="max-h-52 overflow-y-auto rounded border border-gray-200 p-2">
              {unitsQuery.isLoading ? (
                <p className="text-xs text-slate-500">Loading units...</p>
              ) : filteredUnits.length === 0 ? (
                <p className="text-xs text-slate-500">No units match the current filter.</p>
              ) : (
                filteredUnits.map((unit) => (
                  <label key={unit.id} className="flex cursor-pointer items-center gap-2 py-1 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={selectedUnitIds.includes(unit.id)}
                      onChange={() => {
                        setSelectedUnitIds((prev) =>
                          prev.includes(unit.id) ? prev.filter((id) => id !== unit.id) : [...prev, unit.id]
                        );
                      }}
                    />
                    <span className="font-medium">{unitLabel(unit)}</span>
                    {unit.asset_type ? <span className="text-slate-400">{unit.asset_type}</span> : null}
                    {unit.vin ? <span className="text-slate-400 font-mono">{unit.vin}</span> : null}
                    {unit.status ? <span className="text-slate-400">({unit.status})</span> : null}
                  </label>
                ))
              )}
            </div>
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
                  className="w-full rounded border border-gray-300 px-2 py-1"
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
            {premiumCents > 0 && termMonths > 0 && selectedUnitIds.length > 0 ? (
              <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3">
                <p className="text-xs font-semibold text-emerald-800">Cost per vehicle insured per month</p>
                <p className="mt-0.5 text-lg font-bold text-emerald-700">{costInfo.costPerVehicleDisplay}</p>
                <p className="mt-0.5 text-xs text-emerald-600">
                  {selectedUnitIds.length} vehicle{selectedUnitIds.length !== 1 ? "s" : ""} ·{" "}
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
            <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs space-y-1">
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
                <span className="text-slate-700">{selectedUnitIds.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-slate-700">Total premium</span>
                <span className="text-slate-700">{formatMoney(premiumCents)}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-slate-700">Per vehicle / mo</span>
                <span className="font-semibold text-emerald-700">{costInfo.costPerVehicleDisplay}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-slate-700">Allocation</span>
                <span className="text-slate-700">{ALLOCATION_LABELS[step3.allocation_method]}</span>
              </div>
            </div>
            <p className="text-xs font-semibold text-slate-700">
              Bill schedule — {billPreview.length} monthly bills
            </p>
            <div className="max-h-48 overflow-x-auto overflow-y-auto rounded border border-gray-200 bg-white">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-gray-50 text-slate-500">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Bill #</th>
                    <th className="px-3 py-1.5 font-medium">Amount</th>
                    <th className="px-3 py-1.5 font-medium">Per vehicle / mo</th>
                  </tr>
                </thead>
                <tbody>
                  {billPreview.map((amount, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-3 py-1.5 text-slate-700">{i + 1}</td>
                      <td className="px-3 py-1.5 font-medium text-slate-800">{formatMoney(amount)}</td>
                      <td className="px-3 py-1.5 text-slate-600">
                        {costInfo.costPerVehiclePerMonthCents.length > 0
                          ? formatMoney(costInfo.costPerVehiclePerMonthCents[0] ?? 0)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-gray-100 pt-3">
          <button
            type="button"
            className="rounded border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50"
            onClick={step === 1 ? onClose : () => setStep((s) => s - 1)}
          >
            {step === 1 ? "Cancel" : "Back"}
          </button>
          <div className="flex gap-2">
            {step < 4 && (
              <button
                type="button"
                disabled={step === 2 && selectedUnitIds.length === 0}
                className="rounded border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
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
                className="rounded border border-emerald-600 bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending
                  ? "Creating..."
                  : `+ Create policy + schedule ${billPreview.length} bills`}
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
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
