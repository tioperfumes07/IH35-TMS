import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ApiError } from "../../api/client";
import {
  insuranceLawsuitsApi,
  listInsuranceClaims,
  type InsuranceLawsuitStatus,
} from "../../api/insurance";
import { Modal } from "../Modal";
import { useToast } from "../Toast";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onCreated: () => void;
};

type FormState = {
  case_number: string;
  plaintiff: string;
  defendant: string;
  court_name: string;
  filed_date: string;
  status: InsuranceLawsuitStatus;
  claim_id: string;
  demand: string;
  settlement: string;
  attorney_name: string;
  attorney_email: string;
  notes: string;
};

const INITIAL_FORM: FormState = {
  case_number: "",
  plaintiff: "",
  defendant: "",
  court_name: "",
  filed_date: "",
  status: "filed",
  claim_id: "",
  demand: "",
  settlement: "",
  attorney_name: "",
  attorney_email: "",
  notes: "",
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
    return { fieldErrors, formError: "You are not allowed to create insurance lawsuits." };
  }
  const formError = payload.details?.formErrors?.[0] || payload.message || payload.error;
  return {
    fieldErrors,
    formError: formError ? String(formError).replaceAll("_", " ") : "Unable to create lawsuit.",
  };
}

export function LawsuitCreateModal({ open, operatingCompanyId, onClose, onCreated }: Props) {
  const { pushToast } = useToast();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [formError, setFormError] = useState("");
  const [serverError, setServerError] = useState("");

  const claimsQuery = useQuery({
    queryKey: ["insurance", "lawsuit-create", "claims", operatingCompanyId],
    enabled: open && Boolean(operatingCompanyId),
    queryFn: () => listInsuranceClaims({ operating_company_id: operatingCompanyId }).then((result) => result.claims),
  });

  useEffect(() => {
    if (!open) return;
    setForm(INITIAL_FORM);
    setFieldErrors({});
    setFormError("");
    setServerError("");
  }, [open]);

  const createMutation = useMutation({
    mutationFn: (payload: { demandCents?: number; settlementCents?: number }) =>
      insuranceLawsuitsApi.create({
        operating_company_id: operatingCompanyId,
        case_number: form.case_number.trim(),
        plaintiff: form.plaintiff.trim(),
        defendant: form.defendant.trim(),
        court_name: form.court_name.trim(),
        filed_date: form.filed_date,
        status: form.status,
        claim_id: form.claim_id || null,
        demand_cents: payload.demandCents,
        settlement_cents: payload.settlementCents,
        attorney_name: form.attorney_name.trim() || null,
        attorney_email: form.attorney_email.trim() || null,
        notes: form.notes.trim() || null,
      }),
    onSuccess: () => {
      pushToast("Lawsuit created successfully.", "success");
      onCreated();
    },
    onError: (error) => {
      if (!(error instanceof ApiError)) {
        setServerError("Unexpected error while creating lawsuit. Please try again.");
        return;
      }
      if (error.status >= 500) {
        setServerError("Server error while creating lawsuit. Please retry in a moment.");
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
    if (!form.case_number.trim()) nextFieldErrors.case_number = "Case number is required.";
    if (!form.plaintiff.trim()) nextFieldErrors.plaintiff = "Plaintiff is required.";
    if (!form.defendant.trim()) nextFieldErrors.defendant = "Defendant is required.";
    if (!form.court_name.trim()) nextFieldErrors.court_name = "Court name is required.";
    if (!form.filed_date) nextFieldErrors.filed_date = "Filed date is required.";

    const demandCents = parseCurrencyToCents(form.demand);
    if (demandCents === null) nextFieldErrors.demand = "Demand must be a valid non-negative amount.";
    const settlementCents = parseCurrencyToCents(form.settlement);
    if (settlementCents === null) nextFieldErrors.settlement = "Settlement must be a valid non-negative amount.";

    if (form.attorney_email.trim()) {
      const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.attorney_email.trim());
      if (!validEmail) nextFieldErrors.attorney_email = "Enter a valid attorney email.";
    }

    setFieldErrors(nextFieldErrors);
    setFormError("");
    setServerError("");
    if (Object.keys(nextFieldErrors).length > 0) return;

    createMutation.mutate({
      demandCents: typeof demandCents === "number" ? demandCents : undefined,
      settlementCents: typeof settlementCents === "number" ? settlementCents : undefined,
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Create Lawsuit">
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
            <span className="text-xs font-semibold text-slate-700">Case Number *</span>
            <input
              className="w-full rounded border border-gray-300 px-2 py-1"
              value={form.case_number}
              onChange={(event) => updateField("case_number", event.target.value)}
            />
            {fieldErrors.case_number ? <span className="text-xs text-red-700">{fieldErrors.case_number}</span> : null}
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-700">Status</span>
            <select
              className="w-full rounded border border-gray-300 px-2 py-1"
              value={form.status}
              onChange={(event) => updateField("status", event.target.value as InsuranceLawsuitStatus)}
            >
              <option value="filed">Filed</option>
              <option value="active">Active</option>
              <option value="settled">Settled</option>
              <option value="dismissed">Dismissed</option>
              <option value="judgment">Judgment</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-700">Plaintiff *</span>
            <input
              className="w-full rounded border border-gray-300 px-2 py-1"
              value={form.plaintiff}
              onChange={(event) => updateField("plaintiff", event.target.value)}
            />
            {fieldErrors.plaintiff ? <span className="text-xs text-red-700">{fieldErrors.plaintiff}</span> : null}
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-700">Defendant *</span>
            <input
              className="w-full rounded border border-gray-300 px-2 py-1"
              value={form.defendant}
              onChange={(event) => updateField("defendant", event.target.value)}
            />
            {fieldErrors.defendant ? <span className="text-xs text-red-700">{fieldErrors.defendant}</span> : null}
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-700">Court Name *</span>
            <input
              className="w-full rounded border border-gray-300 px-2 py-1"
              value={form.court_name}
              onChange={(event) => updateField("court_name", event.target.value)}
            />
            {fieldErrors.court_name ? <span className="text-xs text-red-700">{fieldErrors.court_name}</span> : null}
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-700">Filed Date *</span>
            <input
              type="date"
              className="w-full rounded border border-gray-300 px-2 py-1"
              value={form.filed_date}
              onChange={(event) => updateField("filed_date", event.target.value)}
            />
            {fieldErrors.filed_date ? <span className="text-xs text-red-700">{fieldErrors.filed_date}</span> : null}
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-700">Linked Claim</span>
            <select
              className="w-full rounded border border-gray-300 px-2 py-1"
              value={form.claim_id}
              onChange={(event) => updateField("claim_id", event.target.value)}
            >
              <option value="">Unlinked</option>
              {(claimsQuery.data ?? []).map((claim) => (
                <option key={claim.id} value={claim.id}>
                  {claim.claim_number}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-700">Demand (USD)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              className="w-full rounded border border-gray-300 px-2 py-1"
              value={form.demand}
              onChange={(event) => updateField("demand", event.target.value)}
            />
            {fieldErrors.demand ? <span className="text-xs text-red-700">{fieldErrors.demand}</span> : null}
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-700">Settlement (USD)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              className="w-full rounded border border-gray-300 px-2 py-1"
              value={form.settlement}
              onChange={(event) => updateField("settlement", event.target.value)}
            />
            {fieldErrors.settlement ? <span className="text-xs text-red-700">{fieldErrors.settlement}</span> : null}
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-700">Attorney Name</span>
            <input
              className="w-full rounded border border-gray-300 px-2 py-1"
              value={form.attorney_name}
              onChange={(event) => updateField("attorney_name", event.target.value)}
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-700">Attorney Email</span>
            <input
              type="email"
              className="w-full rounded border border-gray-300 px-2 py-1"
              value={form.attorney_email}
              onChange={(event) => updateField("attorney_email", event.target.value)}
            />
            {fieldErrors.attorney_email ? <span className="text-xs text-red-700">{fieldErrors.attorney_email}</span> : null}
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
            {createMutation.isPending ? "Creating..." : "+ Lawsuit"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
