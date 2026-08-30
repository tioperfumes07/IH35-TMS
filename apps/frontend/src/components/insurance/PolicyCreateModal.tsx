import { useEffect, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiRequest } from "../../api/client";
import { insurancePoliciesApi, listInsuranceTypeCatalog, type InsurancePolicyStatus } from "../../api/insurance";
import { formatQueryErrorDetail } from "../../lib/tableError";
import { ListErrorState } from "../ListErrorState";
import { ParityDrawer } from "../parity/ParityDrawer";
import { EntityPicker } from "../parity/EntityPicker";
import type { EntityPickerOption } from "../parity/entityPickerRegistry";
import { ReferenceSelect } from "../parity/ReferenceSelect";
import { MoneyInput } from "../forms/MoneyInput";
import { useToast } from "../Toast";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onCreated: (policyId?: string, label?: string) => void;
};

type FormState = {
  insurer_vendor_id: string;
  insurer_name: string;
  policy_number: string;
  coverage_type: string;
  effective_date: string;
  expiry_date: string;
  total_premium: string;
  down_payment: string;
  installment_count: string;
  due_day: string;
  pay_day: string;
  late_fee_pct: string;
  insurer_email: string;
  agent_contact: string;
  status: InsurancePolicyStatus;
};

const INITIAL_FORM: FormState = {
  insurer_vendor_id: "",
  insurer_name: "",
  policy_number: "",
  coverage_type: "",
  effective_date: "",
  expiry_date: "",
  total_premium: "",
  down_payment: "",
  installment_count: "",
  due_day: "",
  pay_day: "",
  late_fee_pct: "",
  insurer_email: "",
  agent_contact: "",
  status: "pending",
};

function parseCurrencyToCents(raw: string) {
  if (!raw.trim()) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

function parseOptionalInt(raw: string) {
  if (!raw.trim()) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value)) return null;
  return value;
}

function parseOptionalNumber(raw: string) {
  if (!raw.trim()) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return value;
}

function mapApi4xxToFieldErrors(error: ApiError): {
  fieldErrors: Partial<Record<keyof FormState | "covered_units", string>>;
  formError?: string;
} {
  const payload = (error.data ?? {}) as {
    error?: string;
    details?: {
      fieldErrors?: Record<string, string[] | string>;
      formErrors?: string[];
    };
    message?: string;
  };
  const fieldErrors: Partial<Record<keyof FormState | "covered_units", string>> = {};

  const fromDetails = payload.details?.fieldErrors ?? {};
  for (const [key, value] of Object.entries(fromDetails)) {
    const message = Array.isArray(value) ? value[0] : value;
    if (!message) continue;
    if (key in INITIAL_FORM || key === "covered_units") {
      fieldErrors[key as keyof FormState | "covered_units"] = String(message);
    }
  }

  if (payload.error === "coverage_type_not_found") {
    fieldErrors.coverage_type = "Selected coverage type is not active for this company.";
  }
  if (payload.error === "insurance_vendor_not_found") {
    fieldErrors.insurer_name =
      "No vendor matches this insurer name. Pick an existing vendor or use + Add new (writes mdata.vendors).";
  }
  if (payload.error === "forbidden") {
    return { fieldErrors, formError: "You are not allowed to create insurance policies." };
  }

  const formError = payload.details?.formErrors?.[0] || payload.message || payload.error;
  return {
    fieldErrors,
    formError: formError ? String(formError).replaceAll("_", " ") : "Unable to create policy.",
  };
}

export function PolicyCreateModal({ open, operatingCompanyId, onClose, onCreated }: Props) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [selectedUnits, setSelectedUnits] = useState<EntityPickerOption[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormState | "covered_units", string>>>({});
  const [formError, setFormError] = useState<string>("");
  const [serverError, setServerError] = useState<string>("");

  const typesQuery = useQuery({
    queryKey: ["insurance", "type-catalog", operatingCompanyId],
    enabled: open && Boolean(operatingCompanyId),
    queryFn: () => listInsuranceTypeCatalog({ operating_company_id: operatingCompanyId }).then((result) => result.types),
  });

  useEffect(() => {
    if (!open) return;
    setForm(INITIAL_FORM);
    setSelectedUnits([]);
    setFieldErrors({});
    setFormError("");
    setServerError("");
  }, [open]);

  const createMutation = useMutation({
    mutationFn: async (next: { payload: Omit<FormState, "total_premium" | "down_payment">; totalPremiumCents?: number; downPaymentCents?: number; unitIds: string[] }) => {
      const created = await insurancePoliciesApi.create({
        operating_company_id: operatingCompanyId,
        vendor_id: next.payload.insurer_vendor_id,
        insurer_name: next.payload.insurer_name.trim(),
        policy_number: next.payload.policy_number.trim(),
        coverage_type: next.payload.coverage_type as Parameters<typeof insurancePoliciesApi.create>[0]["coverage_type"],
        effective_date: next.payload.effective_date,
        expiry_date: next.payload.expiry_date,
        total_premium_cents: next.totalPremiumCents,
        down_payment_cents: next.downPaymentCents,
        installment_count: next.payload.installment_count ? Number(next.payload.installment_count) : undefined,
        due_day: next.payload.due_day ? Number(next.payload.due_day) : null,
        pay_day: next.payload.pay_day ? Number(next.payload.pay_day) : null,
        late_fee_pct: next.payload.late_fee_pct ? Number(next.payload.late_fee_pct) : undefined,
        insurer_email: next.payload.insurer_email.trim() || null,
        agent_contact: next.payload.agent_contact.trim() || null,
        status: next.payload.status,
      });

      for (const assetId of next.unitIds) {
        await apiRequest(`/api/v1/insurance/policies/${created.id}/units`, {
          method: "POST",
          body: {
            operating_company_id: operatingCompanyId,
            asset_id: assetId,
            insured_value_cents: 0,
          },
        });
      }
      return created;
    },
    onSuccess: (created) => {
      pushToast("Policy created successfully.", "success");
      onCreated(created?.id, created?.policy_number ?? form.policy_number.trim());
    },
    onError: (error) => {
      if (!(error instanceof ApiError)) {
        setServerError("Unexpected error while creating policy. Please try again.");
        return;
      }
      if (error.status >= 500) {
        setServerError("Server error while creating policy. Please retry in a moment.");
        return;
      }
      const mapped = mapApi4xxToFieldErrors(error);
      setFieldErrors((prev) => ({ ...prev, ...mapped.fieldErrors }));
      if (mapped.formError) setFormError(mapped.formError);
    },
  });

  const addCoveredUnit = (unitId: string | null, option?: EntityPickerOption | null) => {
    if (!unitId || !option) return;
    setSelectedUnits((current) => current.some((unit) => unit.value === unitId) ? current : [...current, option]);
    setFieldErrors((current) => ({ ...current, covered_units: undefined }));
  };

  const updateField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setFormError("");
    setServerError("");
  };

  const onSubmit = () => {
    const nextFieldErrors: Partial<Record<keyof FormState | "covered_units", string>> = {};

    if (!form.insurer_vendor_id.trim() || !form.insurer_name.trim()) {
      nextFieldErrors.insurer_name = "Select an insurer vendor (or + Add new).";
    }
    if (!form.policy_number.trim()) nextFieldErrors.policy_number = "Policy number is required.";
    if (!form.coverage_type) nextFieldErrors.coverage_type = "Coverage type is required.";
    if (!form.effective_date) nextFieldErrors.effective_date = "Effective date is required.";
    if (!form.expiry_date) nextFieldErrors.expiry_date = "Expiry date is required.";
    if (!selectedUnits.length) nextFieldErrors.covered_units = "Select at least one covered unit.";

    if (form.effective_date && form.expiry_date && form.expiry_date < form.effective_date) {
      nextFieldErrors.expiry_date = "Expiry date must be on or after effective date.";
    }

    const totalPremiumCents = parseCurrencyToCents(form.total_premium);
    if (totalPremiumCents === null) nextFieldErrors.total_premium = "Total premium must be a valid non-negative amount.";

    const downPaymentCents = parseCurrencyToCents(form.down_payment);
    if (downPaymentCents === null) nextFieldErrors.down_payment = "Down payment must be a valid non-negative amount.";

    const installmentCount = parseOptionalInt(form.installment_count);
    if (installmentCount === null || (typeof installmentCount === "number" && installmentCount < 0)) {
      nextFieldErrors.installment_count = "Installment count must be 0 or higher.";
    }

    const dueDay = parseOptionalInt(form.due_day);
    if (dueDay === null || (typeof dueDay === "number" && (dueDay < 1 || dueDay > 31))) {
      nextFieldErrors.due_day = "Due day must be between 1 and 31.";
    }

    const payDay = parseOptionalInt(form.pay_day);
    if (payDay === null || (typeof payDay === "number" && (payDay < 1 || payDay > 31))) {
      nextFieldErrors.pay_day = "Pay day must be between 1 and 31.";
    }

    const lateFee = parseOptionalNumber(form.late_fee_pct);
    if (lateFee === null || (typeof lateFee === "number" && (lateFee < 0 || lateFee > 999.99))) {
      nextFieldErrors.late_fee_pct = "Late fee % must be between 0 and 999.99.";
    }

    if (form.insurer_email.trim()) {
      const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.insurer_email.trim());
      if (!validEmail) nextFieldErrors.insurer_email = "Enter a valid insurer email.";
    }

    setFieldErrors(nextFieldErrors);
    setFormError("");
    setServerError("");
    if (Object.keys(nextFieldErrors).length > 0) return;

    createMutation.mutate({
      payload: {
        ...form,
      },
      totalPremiumCents: typeof totalPremiumCents === "number" ? totalPremiumCents : undefined,
      downPaymentCents: typeof downPaymentCents === "number" ? downPaymentCents : undefined,
      unitIds: selectedUnits.map((unit) => unit.value),
    });
  };

  return (
    <ParityDrawer open={open} onClose={onClose} title="Create Policy" size="wide">
      <form
        className="space-y-4 text-sm"
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
            <span className="text-xs font-semibold text-slate-700">Insurer (vendor) *</span>
            {/* CLS-SILENT-CAP / FAIL-INS-VENDOR-UX: EntityPicker server-search + allowCreate → mdata.vendors R=W. */}
            <EntityPicker
              kind="vendor"
              allowCreate
              nestedInDrawer
              operatingCompanyId={operatingCompanyId}
              value={form.insurer_vendor_id || null}
              onChange={(next, option) => {
                const id = next ?? "";
                setForm((current) => ({
                  ...current,
                  insurer_vendor_id: id,
                  insurer_name: option?.label ?? (id ? current.insurer_name : ""),
                }));
                setFieldErrors((current) => ({ ...current, insurer_name: undefined }));
                setFormError("");
                setServerError("");
              }}
              enabled={open}
              placeholder="Select insurer vendor"
              dataField="policy-insurer-vendor"
              className="w-full"
            />
            {fieldErrors.insurer_name ? <span className="text-xs text-red-700">{fieldErrors.insurer_name}</span> : null}
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-700">Policy Number *</span>
            <input
              className="w-full rounded-sm border border-gray-300 px-2 py-1"
              value={form.policy_number}
              onChange={(event) => updateField("policy_number", event.target.value)}
            />
            {fieldErrors.policy_number ? <span className="text-xs text-red-700">{fieldErrors.policy_number}</span> : null}
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-700">Type *</span>
            {/*
              LST-PICKER-01 (guard 1864): bare <select> had zero inline create — operators had to leave
              the policy form for TypeCatalogAdmin. ReferenceSelect createKind=insurance_coverage_type
              posts insurance.type_catalog (same table the list reads). Value is CODE (not UUID).
            */}
            {typesQuery.isError ? (
              <ListErrorState
                title="Couldn't load coverage types"
                {...formatQueryErrorDetail(typesQuery.error)}
                onRetry={() => void typesQuery.refetch()}
                className="py-4"
              />
            ) : (
              <ReferenceSelect
                value={form.coverage_type || null}
                onChange={(next) => updateField("coverage_type", next ?? "")}
                options={(typesQuery.data ?? []).map((type) => ({ value: type.code, label: type.name }))}
                createKind="insurance_coverage_type"
                createdValueField="code"
                operatingCompanyId={operatingCompanyId}
                placeholder="Select type"
                onOptionCreated={async (opt) => {
                  updateField("coverage_type", opt.value);
                  await queryClient.invalidateQueries({ queryKey: ["insurance", "type-catalog", operatingCompanyId] });
                }}
              />
            )}
            {fieldErrors.coverage_type ? <span className="text-xs text-red-700">{fieldErrors.coverage_type}</span> : null}
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-700">Status</span>
            <select
              className="w-full rounded-sm border border-gray-300 px-2 py-1"
              value={form.status}
              onChange={(event) => updateField("status", event.target.value as InsurancePolicyStatus)}
            >
              <option value="pending">Pending</option>
              <option value="active">Active</option>
              <option value="expired">Expired</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-700">Effective Date *</span>
            <DatePicker
              className="w-full"
              value={form.effective_date}
              onChange={(next) => updateField("effective_date", next)}
            />
            {fieldErrors.effective_date ? <span className="text-xs text-red-700">{fieldErrors.effective_date}</span> : null}
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-700">Expiry Date *</span>
            <DatePicker
              className="w-full"
              value={form.expiry_date}
              onChange={(next) => updateField("expiry_date", next)}
            />
            {fieldErrors.expiry_date ? <span className="text-xs text-red-700">{fieldErrors.expiry_date}</span> : null}
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-700">Total Premium (USD)</span>
            {/* M-1: dollars-mode QBO money entry; bridged so parseCurrencyToCents (×100) is byte-for-byte. */}
            <MoneyInput
              valueDollars={form.total_premium ? Number(form.total_premium) : null}
              onChangeDollars={(d) => updateField("total_premium", d == null ? "" : String(d))}
              ariaLabel="Total Premium (USD)"
            />
            {fieldErrors.total_premium ? <span className="text-xs text-red-700">{fieldErrors.total_premium}</span> : null}
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-700">Down Payment (USD)</span>
            <MoneyInput
              valueDollars={form.down_payment ? Number(form.down_payment) : null}
              onChangeDollars={(d) => updateField("down_payment", d == null ? "" : String(d))}
              ariaLabel="Down Payment (USD)"
            />
            {fieldErrors.down_payment ? <span className="text-xs text-red-700">{fieldErrors.down_payment}</span> : null}
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-700">Installments</span>
            <input
              type="number"
              min="0"
              className="w-full rounded-sm border border-gray-300 px-2 py-1"
              value={form.installment_count}
              onChange={(event) => updateField("installment_count", event.target.value)}
            />
            {fieldErrors.installment_count ? <span className="text-xs text-red-700">{fieldErrors.installment_count}</span> : null}
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-700">Due Day</span>
            <input
              type="number"
              min="1"
              max="31"
              className="w-full rounded-sm border border-gray-300 px-2 py-1"
              value={form.due_day}
              onChange={(event) => updateField("due_day", event.target.value)}
            />
            {fieldErrors.due_day ? <span className="text-xs text-red-700">{fieldErrors.due_day}</span> : null}
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-700">Pay Day</span>
            <input
              type="number"
              min="1"
              max="31"
              className="w-full rounded-sm border border-gray-300 px-2 py-1"
              value={form.pay_day}
              onChange={(event) => updateField("pay_day", event.target.value)}
            />
            {fieldErrors.pay_day ? <span className="text-xs text-red-700">{fieldErrors.pay_day}</span> : null}
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-700">Late Fee %</span>
            <input
              type="number"
              min="0"
              max="999.99"
              step="0.01"
              className="w-full rounded-sm border border-gray-300 px-2 py-1"
              value={form.late_fee_pct}
              onChange={(event) => updateField("late_fee_pct", event.target.value)}
            />
            {fieldErrors.late_fee_pct ? <span className="text-xs text-red-700">{fieldErrors.late_fee_pct}</span> : null}
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-700">Insurer Email</span>
            <input
              type="email"
              className="w-full rounded-sm border border-gray-300 px-2 py-1"
              value={form.insurer_email}
              onChange={(event) => updateField("insurer_email", event.target.value)}
            />
            {fieldErrors.insurer_email ? <span className="text-xs text-red-700">{fieldErrors.insurer_email}</span> : null}
          </label>
        </div>

        <label className="space-y-1">
          <span className="text-xs font-semibold text-slate-700">Agent Contact</span>
          <input
            className="w-full rounded-sm border border-gray-300 px-2 py-1"
            value={form.agent_contact}
            onChange={(event) => updateField("agent_contact", event.target.value)}
          />
        </label>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">Covered Units *</span>
            <span className="text-xs text-slate-500">{selectedUnits.length} selected</span>
          </div>
          <EntityPicker
            kind="unit"
            operatingCompanyId={operatingCompanyId}
            value={null}
            onChange={addCoveredUnit}
            enabled={open}
            nestedInDrawer
            placeholder="Search units…"
            ariaLabel="Add covered unit"
            dataTestId="policy-create-unit-search"
          />
          <div className="flex flex-wrap gap-1.5" data-testid="policy-create-selected-units">
            {selectedUnits.map((unit) => (
              <button
                key={unit.value}
                type="button"
                className="rounded-full border border-gray-300 bg-gray-50 px-2 py-1 text-xs text-slate-700"
                onClick={() => setSelectedUnits((current) => current.filter((item) => item.value !== unit.value))}
                aria-label={`Remove ${unit.label}`}
              >
                {unit.label} ×
              </button>
            ))}
          </div>
          {fieldErrors.covered_units ? <span className="text-xs text-red-700">{fieldErrors.covered_units}</span> : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
          <button type="button" className="rounded-sm border border-gray-300 px-3 py-1.5 text-xs" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-sm border border-[#1f2a44] bg-[#1f2a44] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0f1729] disabled:opacity-60"
            disabled={createMutation.isPending || typesQuery.isError}
          >
            {createMutation.isPending ? "Creating..." : "+ Policy"}
          </button>
        </div>
      </form>
    </ParityDrawer>
  );
}
