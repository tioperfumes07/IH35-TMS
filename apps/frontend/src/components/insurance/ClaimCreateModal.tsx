import { useEffect, useMemo, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ApiError } from "../../api/client";
import {
  insuranceClaimsApi,
  listInsurancePolicies,
  type InsuranceClaimStatus,
} from "../../api/insurance";
import { listUnits } from "../../api/mdata";
import { Modal } from "../Modal";
import { MoneyInput } from "../forms/MoneyInput";
import { useToast } from "../Toast";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onCreated: () => void;
};

type FormState = {
  claim_number: string;
  policy_id: string;
  asset_id: string;
  accident_date: string;
  reported_date: string;
  status: InsuranceClaimStatus;
  amount_claimed: string;
  amount_paid: string;
  adjuster_name: string;
  adjuster_email: string;
  notes: string;
};

type UnitOption = {
  id: string;
  unit_code?: string | null;
  unit_number?: string | null;
  status?: string | null;
};

const INITIAL_FORM: FormState = {
  claim_number: "",
  policy_id: "",
  asset_id: "",
  accident_date: "",
  reported_date: "",
  status: "open",
  amount_claimed: "",
  amount_paid: "",
  adjuster_name: "",
  adjuster_email: "",
  notes: "",
};

function unitLabel(unit: UnitOption) {
  return unit.unit_code || unit.unit_number || unit.id.slice(0, 8);
}

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
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [formError, setFormError] = useState("");
  const [serverError, setServerError] = useState("");

  const policiesQuery = useQuery({
    queryKey: ["insurance", "claim-create", "policies", operatingCompanyId],
    enabled: open && Boolean(operatingCompanyId),
    queryFn: () => listInsurancePolicies({ operating_company_id: operatingCompanyId }).then((result) => result.policies),
  });

  const unitsQuery = useQuery({
    queryKey: ["insurance", "claim-create", "units", operatingCompanyId],
    enabled: open && Boolean(operatingCompanyId),
    queryFn: async () => {
      const result = await listUnits({ operating_company_id: operatingCompanyId });
      return (result.units as UnitOption[]).filter((unit) => Boolean(unit.id));
    },
  });

  const units = useMemo(() => unitsQuery.data ?? [], [unitsQuery.data]);

  useEffect(() => {
    if (!open) return;
    setForm(INITIAL_FORM);
    setFieldErrors({});
    setFormError("");
    setServerError("");
  }, [open]);

  const createMutation = useMutation({
    mutationFn: (payload: { amountClaimedCents?: number; amountPaidCents?: number }) =>
      insuranceClaimsApi.create({
        operating_company_id: operatingCompanyId,
        claim_number: form.claim_number.trim(),
        policy_id: form.policy_id,
        asset_id: form.asset_id || null,
        accident_date: form.accident_date,
        reported_date: form.reported_date,
        status: form.status,
        amount_claimed_cents: payload.amountClaimedCents,
        amount_paid_cents: payload.amountPaidCents,
        adjuster_name: form.adjuster_name.trim() || null,
        adjuster_email: form.adjuster_email.trim() || null,
        notes: form.notes.trim() || null,
      }),
    onSuccess: () => {
      pushToast("Claim created successfully.", "success");
      onCreated();
    },
    onError: (error) => {
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

    if (form.adjuster_email.trim()) {
      const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.adjuster_email.trim());
      if (!validEmail) nextFieldErrors.adjuster_email = "Enter a valid adjuster email.";
    }

    setFieldErrors(nextFieldErrors);
    setFormError("");
    setServerError("");
    if (Object.keys(nextFieldErrors).length > 0) return;

    createMutation.mutate({
      amountClaimedCents: typeof amountClaimedCents === "number" ? amountClaimedCents : undefined,
      amountPaidCents: typeof amountPaidCents === "number" ? amountPaidCents : undefined,
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Create Claim">
      <form
        className="space-y-4 text-sm"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        {serverError ? (
          <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
            {serverError}
          </div>
        ) : null}
        {formError ? (
          <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800" role="alert">
            {formError}
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-700">Claim Number *</span>
            <input
              className="w-full rounded border border-gray-300 px-2 py-1"
              value={form.claim_number}
              onChange={(event) => updateField("claim_number", event.target.value)}
            />
            {fieldErrors.claim_number ? <span className="text-xs text-red-700">{fieldErrors.claim_number}</span> : null}
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-700">Policy *</span>
            <select
              className="w-full rounded border border-gray-300 px-2 py-1"
              value={form.policy_id}
              onChange={(event) => updateField("policy_id", event.target.value)}
            >
              <option value="">Select policy</option>
              {(policiesQuery.data ?? []).map((policy) => (
                <option key={policy.id} value={policy.id}>
                  {policy.policy_number} — {policy.insurer_name}
                </option>
              ))}
            </select>
            {fieldErrors.policy_id ? <span className="text-xs text-red-700">{fieldErrors.policy_id}</span> : null}
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-700">Unit / Asset</span>
            <select
              className="w-full rounded border border-gray-300 px-2 py-1"
              value={form.asset_id}
              onChange={(event) => updateField("asset_id", event.target.value)}
            >
              <option value="">Unassigned</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unitLabel(unit)}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-700">Status</span>
            <select
              className="w-full rounded border border-gray-300 px-2 py-1"
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

          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-700">Accident Date *</span>
            <DatePicker
              className="w-full rounded border border-gray-300 px-2 py-1"
              value={form.accident_date}
              onChange={(next) => updateField("accident_date", next)}
            />
            {fieldErrors.accident_date ? <span className="text-xs text-red-700">{fieldErrors.accident_date}</span> : null}
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-700">Reported Date *</span>
            <DatePicker
              className="w-full rounded border border-gray-300 px-2 py-1"
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
              className="w-full rounded border border-gray-300 px-2 py-1"
              value={form.adjuster_name}
              onChange={(event) => updateField("adjuster_name", event.target.value)}
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-700">Adjuster Email</span>
            <input
              type="email"
              className="w-full rounded border border-gray-300 px-2 py-1"
              value={form.adjuster_email}
              onChange={(event) => updateField("adjuster_email", event.target.value)}
            />
            {fieldErrors.adjuster_email ? <span className="text-xs text-red-700">{fieldErrors.adjuster_email}</span> : null}
          </label>
        </div>

        <label className="space-y-1">
          <span className="text-xs font-semibold text-slate-700">Notes</span>
          <textarea
            className="w-full rounded border border-gray-300 px-2 py-1"
            rows={3}
            value={form.notes}
            onChange={(event) => updateField("notes", event.target.value)}
          />
        </label>

        <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
          <button type="button" className="rounded border border-gray-300 px-3 py-1.5 text-xs" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="rounded border border-[#16A34A] bg-[#16A34A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-60"
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? "Creating..." : "+ Claim"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
