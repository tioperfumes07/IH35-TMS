import type { Dispatch, SetStateAction } from "react";
import { useQuery } from "@tanstack/react-query";
import { listInsuranceClaims, listInsuranceLawsuits } from "../../../api/insurance";
import { listDrivers, listUnits } from "../../../api/mdata";
import { DatePicker } from "../../../components/forms/DatePicker";
import { MoneyInput } from "../../../components/forms/MoneyInput";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";

export type LegalMatterFormState = {
  matter_number: string;
  type: string;
  status: string;
  severity: string;
  our_role: string;
  opposing_party: string;
  case_number: string;
  court: string;
  description: string;
  internal_notes: string;
  amount_claimed_against_us: string;
  amount_we_seek: string;
  financial_reserve_cents: string;
  next_hearing_date: string;
  statute_of_limitations_at: string;
  attorney_name: string;
  attorney_firm: string;
  attorney_phone: string;
  attorney_email: string;
  /** Linkage FKs (API-ready; schema on legal.matters). */
  insurance_claim_id: string;
  insurance_lawsuit_id: string;
  related_driver_id: string;
  unit_id: string;
};

export const EMPTY_LEGAL_MATTER_FORM: LegalMatterFormState = {
  matter_number: "",
  type: "lawsuit",
  status: "open",
  severity: "medium",
  our_role: "defendant",
  opposing_party: "",
  case_number: "",
  court: "",
  description: "",
  internal_notes: "",
  amount_claimed_against_us: "",
  amount_we_seek: "",
  financial_reserve_cents: "",
  next_hearing_date: "",
  statute_of_limitations_at: "",
  attorney_name: "",
  attorney_firm: "",
  attorney_phone: "",
  attorney_email: "",
  insurance_claim_id: "",
  insurance_lawsuit_id: "",
  related_driver_id: "",
  unit_id: "",
};

export function matterRowToFormState(matter: Record<string, unknown>): LegalMatterFormState {
  const dateOnly = (value: unknown) => (value ? String(value).slice(0, 10) : "");
  return {
    matter_number: String(matter.matter_number ?? ""),
    type: String(matter.type ?? "lawsuit"),
    status: String(matter.status ?? "open"),
    severity: String(matter.severity ?? "medium"),
    our_role: String(matter.our_role ?? "defendant"),
    opposing_party: String(matter.opposing_party ?? ""),
    case_number: String(matter.case_number ?? ""),
    court: String(matter.court ?? ""),
    description: String(matter.description ?? ""),
    internal_notes: String(matter.internal_notes ?? ""),
    amount_claimed_against_us:
      matter.amount_claimed_against_us != null && matter.amount_claimed_against_us !== ""
        ? String(matter.amount_claimed_against_us)
        : "",
    amount_we_seek:
      matter.amount_we_seek != null && matter.amount_we_seek !== "" ? String(matter.amount_we_seek) : "",
    financial_reserve_cents:
      matter.financial_reserve_cents != null && matter.financial_reserve_cents !== ""
        ? String(matter.financial_reserve_cents)
        : "",
    next_hearing_date: dateOnly(matter.next_hearing_date),
    statute_of_limitations_at: dateOnly(matter.statute_of_limitations_at),
    attorney_name: String(matter.attorney_name ?? ""),
    attorney_firm: String(matter.attorney_firm ?? ""),
    attorney_phone: String(matter.attorney_phone ?? ""),
    attorney_email: String(matter.attorney_email ?? ""),
    insurance_claim_id: matter.insurance_claim_id ? String(matter.insurance_claim_id) : "",
    insurance_lawsuit_id: matter.insurance_lawsuit_id ? String(matter.insurance_lawsuit_id) : "",
    related_driver_id: matter.related_driver_id ? String(matter.related_driver_id) : "",
    unit_id: matter.unit_id ? String(matter.unit_id) : "",
  };
}

/** Edit may move between workflow statuses; `closed` is only via closeMatter (+ outcome). */
export const LEGAL_MATTER_EDIT_STATUSES = [
  "open",
  "investigating",
  "litigation",
  "settled",
  "dismissed",
  "judgment",
] as const;

function optionalUuidOrNull(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

export function formStateToUpdatePayload(form: LegalMatterFormState): Record<string, unknown> {
  // Never PATCH status=closed — that bypasses closeMatter (closed_at / outcome / matter_closed).
  const status =
    form.status === "closed" || !(LEGAL_MATTER_EDIT_STATUSES as readonly string[]).includes(form.status)
      ? undefined
      : form.status;
  return {
    type: form.type,
    ...(status !== undefined ? { status } : {}),
    severity: form.severity,
    our_role: form.our_role,
    // Empty → null/"" so intentional clears persist (omit would leave stale DB values).
    opposing_party: form.opposing_party.trim(),
    case_number: form.case_number.trim(),
    court: form.court.trim(),
    description: form.description.trim(),
    internal_notes: form.internal_notes.trim(),
    amount_claimed_against_us: form.amount_claimed_against_us
      ? Number(form.amount_claimed_against_us)
      : null,
    amount_we_seek: form.amount_we_seek ? Number(form.amount_we_seek) : null,
    financial_reserve_cents: form.financial_reserve_cents
      ? Number(form.financial_reserve_cents)
      : null,
    next_hearing_date: form.next_hearing_date || null,
    statute_of_limitations_at: form.statute_of_limitations_at || null,
    attorney_name: form.attorney_name.trim(),
    attorney_firm: form.attorney_firm.trim(),
    attorney_phone: form.attorney_phone.trim(),
    attorney_email: form.attorney_email.trim() || null,
    insurance_claim_id: optionalUuidOrNull(form.insurance_claim_id),
    insurance_lawsuit_id: optionalUuidOrNull(form.insurance_lawsuit_id),
    related_driver_id: optionalUuidOrNull(form.related_driver_id),
    unit_id: optionalUuidOrNull(form.unit_id),
  };
}

export function formStateToCreatePayload(form: LegalMatterFormState): Record<string, unknown> {
  const update = formStateToUpdatePayload(form);
  // Create: omit empties/nulls so DB defaults apply; never send status=closed.
  const body: Record<string, unknown> = { matter_number: form.matter_number.trim() };
  for (const [k, v] of Object.entries(update)) {
    if (v === null || v === undefined || v === "") continue;
    body[k] = v;
  }
  return body;
}

type Props = {
  form: LegalMatterFormState;
  setForm: Dispatch<SetStateAction<LegalMatterFormState>>;
  mode: "create" | "edit";
  /** Required for linkage pickers (claims / lawsuits / drivers / units). */
  operatingCompanyId: string;
};

export function LegalMatterFormFields({ form, setForm, mode, operatingCompanyId }: Props) {
  const claimsQuery = useQuery({
    queryKey: ["legal-matter-form", "claims", operatingCompanyId],
    enabled: Boolean(operatingCompanyId),
    queryFn: () => listInsuranceClaims({ operating_company_id: operatingCompanyId }).then((r) => r.claims),
  });
  const lawsuitsQuery = useQuery({
    queryKey: ["legal-matter-form", "lawsuits", operatingCompanyId],
    enabled: Boolean(operatingCompanyId),
    queryFn: () => listInsuranceLawsuits({ operating_company_id: operatingCompanyId }).then((r) => r.lawsuits),
  });
  const driversQuery = useQuery({
    queryKey: ["legal-matter-form", "drivers", operatingCompanyId],
    enabled: Boolean(operatingCompanyId),
    queryFn: () =>
      listDrivers({ operating_company_id: operatingCompanyId, status: "All", limit: 500 }).then((r) => r.drivers),
  });
  const unitsQuery = useQuery({
    queryKey: ["legal-matter-form", "units", operatingCompanyId],
    enabled: Boolean(operatingCompanyId),
    queryFn: async () => {
      const result = await listUnits({ operating_company_id: operatingCompanyId, limit: 500 });
      return (result.units as Array<{ id: string; unit_code?: string | null; unit_number?: string | null }>).filter(
        (u) => Boolean(u.id),
      );
    },
  });

  return (
    <div className="grid gap-2 md:grid-cols-2" data-testid="legal-matter-form-fields">
      {mode === "create" ? (
        <label className="text-xs text-gray-600">
          Matter number
          <input
            className="mt-1 w-full rounded-sm border border-gray-200 px-2 py-1 text-sm"
            value={form.matter_number}
            onChange={(e) => setForm((f) => ({ ...f, matter_number: e.target.value }))}
          />
        </label>
      ) : null}
      <label className="text-xs text-gray-600">
        Type
        <SelectCombobox
          className="mt-1 w-full rounded-sm border border-gray-200 px-2 py-1 text-sm"
          value={form.type}
          onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
        >
          {["lawsuit", "claim", "demand_letter", "settlement", "regulatory", "other"].map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </SelectCombobox>
      </label>
      {mode === "edit" ? (
        form.status === "closed" ? (
          <div className="text-xs text-gray-600">
            Status
            <div className="mt-1 rounded-sm border border-gray-200 bg-gray-50 px-2 py-1 text-sm text-gray-700">
              closed — use Close matter (with outcome) only; reopen not supported via edit
            </div>
          </div>
        ) : (
          <label className="text-xs text-gray-600">
            Status
            <SelectCombobox
              className="mt-1 w-full rounded-sm border border-gray-200 px-2 py-1 text-sm"
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
            >
              {LEGAL_MATTER_EDIT_STATUSES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </SelectCombobox>
          </label>
        )
      ) : null}
      <label className="text-xs text-gray-600">
        Severity
        <SelectCombobox
          className="mt-1 w-full rounded-sm border border-gray-200 px-2 py-1 text-sm"
          value={form.severity}
          onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}
        >
          {["low", "medium", "high", "critical"].map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </SelectCombobox>
      </label>
      <label className="text-xs text-gray-600">
        Our role
        <SelectCombobox
          className="mt-1 w-full rounded-sm border border-gray-200 px-2 py-1 text-sm"
          value={form.our_role}
          onChange={(e) => setForm((f) => ({ ...f, our_role: e.target.value }))}
        >
          {["defendant", "plaintiff", "third_party", "other"].map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </SelectCombobox>
      </label>
      <label className="text-xs text-gray-600 md:col-span-2">
        Opposing party
        <input
          className="mt-1 w-full rounded-sm border border-gray-200 px-2 py-1 text-sm"
          value={form.opposing_party}
          onChange={(e) => setForm((f) => ({ ...f, opposing_party: e.target.value }))}
        />
      </label>
      <label className="text-xs text-gray-600">
        Case number
        <input
          className="mt-1 w-full rounded-sm border border-gray-200 px-2 py-1 text-sm"
          value={form.case_number}
          onChange={(e) => setForm((f) => ({ ...f, case_number: e.target.value }))}
        />
      </label>
      <label className="text-xs text-gray-600">
        Court
        <input
          className="mt-1 w-full rounded-sm border border-gray-200 px-2 py-1 text-sm"
          value={form.court}
          onChange={(e) => setForm((f) => ({ ...f, court: e.target.value }))}
        />
      </label>

      <label className="text-xs text-gray-600" data-testid="legal-matter-insurance-claim-picker">
        Insurance claim
        <SelectCombobox
          className="mt-1 w-full rounded-sm border border-gray-200 px-2 py-1 text-sm"
          value={form.insurance_claim_id}
          onChange={(e) => setForm((f) => ({ ...f, insurance_claim_id: e.target.value }))}
        >
          <option value="">None</option>
          {(claimsQuery.data ?? []).map((claim) => (
            <option key={claim.id} value={claim.id}>
              {claim.claim_number} — {claim.status}
            </option>
          ))}
        </SelectCombobox>
      </label>
      <label className="text-xs text-gray-600" data-testid="legal-matter-insurance-lawsuit-picker">
        Insurance lawsuit
        <SelectCombobox
          className="mt-1 w-full rounded-sm border border-gray-200 px-2 py-1 text-sm"
          value={form.insurance_lawsuit_id}
          onChange={(e) => setForm((f) => ({ ...f, insurance_lawsuit_id: e.target.value }))}
        >
          <option value="">None</option>
          {(lawsuitsQuery.data ?? []).map((lawsuit) => (
            <option key={lawsuit.id} value={lawsuit.id}>
              {lawsuit.case_number} — {lawsuit.status}
            </option>
          ))}
        </SelectCombobox>
      </label>
      <label className="text-xs text-gray-600" data-testid="legal-matter-related-driver-picker">
        Related driver
        <SelectCombobox
          className="mt-1 w-full rounded-sm border border-gray-200 px-2 py-1 text-sm"
          value={form.related_driver_id}
          onChange={(e) => setForm((f) => ({ ...f, related_driver_id: e.target.value }))}
        >
          <option value="">None</option>
          {(driversQuery.data ?? []).map((driver) => (
            <option key={driver.id} value={driver.id}>
              {[driver.first_name, driver.last_name].filter(Boolean).join(" ") || driver.id.slice(0, 8)}
            </option>
          ))}
        </SelectCombobox>
      </label>
      <label className="text-xs text-gray-600" data-testid="legal-matter-unit-picker">
        Unit
        <SelectCombobox
          className="mt-1 w-full rounded-sm border border-gray-200 px-2 py-1 text-sm"
          value={form.unit_id}
          onChange={(e) => setForm((f) => ({ ...f, unit_id: e.target.value }))}
        >
          <option value="">None</option>
          {(unitsQuery.data ?? []).map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.unit_code || unit.unit_number || unit.id.slice(0, 8)}
            </option>
          ))}
        </SelectCombobox>
      </label>

      <label className="text-xs text-gray-600">
        Amount claimed (against us)
        <MoneyInput
          valueDollars={form.amount_claimed_against_us ? Number(form.amount_claimed_against_us) : null}
          onChangeDollars={(d) => setForm((f) => ({ ...f, amount_claimed_against_us: d == null ? "" : String(d) }))}
          ariaLabel="Amount claimed (against us)"
          className="mt-1 w-full"
        />
      </label>
      <label className="text-xs text-gray-600">
        Amount we seek
        <MoneyInput
          valueDollars={form.amount_we_seek ? Number(form.amount_we_seek) : null}
          onChangeDollars={(d) => setForm((f) => ({ ...f, amount_we_seek: d == null ? "" : String(d) }))}
          ariaLabel="Amount we seek"
          className="mt-1 w-full"
        />
      </label>
      {mode === "edit" ? (
        <label className="text-xs text-gray-600">
          Financial reserve
          <MoneyInput
            valueCents={form.financial_reserve_cents ? Number(form.financial_reserve_cents) : null}
            onChangeCents={(c) =>
              setForm((f) => ({ ...f, financial_reserve_cents: c == null ? "" : String(c) }))
            }
            ariaLabel="Financial reserve"
            className="mt-1 w-full"
          />
        </label>
      ) : null}
      <label className="text-xs text-gray-600">
        Next hearing (date)
        <DatePicker
          className="mt-1 w-full rounded-sm border border-gray-200 px-2 py-1 text-sm"
          value={form.next_hearing_date}
          onChange={(next) => setForm((f) => ({ ...f, next_hearing_date: next }))}
        />
      </label>
      <label className="text-xs text-gray-600">
        Statute of limitations (date)
        <DatePicker
          className="mt-1 w-full rounded-sm border border-gray-200 px-2 py-1 text-sm"
          value={form.statute_of_limitations_at}
          onChange={(next) => setForm((f) => ({ ...f, statute_of_limitations_at: next }))}
        />
      </label>
      <label className="text-xs text-gray-600 md:col-span-2">
        Description
        <textarea
          className="mt-1 min-h-[80px] w-full rounded-sm border border-gray-200 px-2 py-1 text-sm"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
      </label>
      <label className="text-xs text-gray-600 md:col-span-2">
        Internal notes
        <textarea
          className="mt-1 min-h-[60px] w-full rounded-sm border border-gray-200 px-2 py-1 text-sm"
          value={form.internal_notes}
          onChange={(e) => setForm((f) => ({ ...f, internal_notes: e.target.value }))}
        />
      </label>
      <label className="text-xs text-gray-600">
        Attorney name
        <input
          className="mt-1 w-full rounded-sm border border-gray-200 px-2 py-1 text-sm"
          value={form.attorney_name}
          onChange={(e) => setForm((f) => ({ ...f, attorney_name: e.target.value }))}
        />
      </label>
      <label className="text-xs text-gray-600">
        Attorney firm
        <input
          className="mt-1 w-full rounded-sm border border-gray-200 px-2 py-1 text-sm"
          value={form.attorney_firm}
          onChange={(e) => setForm((f) => ({ ...f, attorney_firm: e.target.value }))}
        />
      </label>
      <label className="text-xs text-gray-600">
        Attorney phone
        <input
          className="mt-1 w-full rounded-sm border border-gray-200 px-2 py-1 text-sm"
          value={form.attorney_phone}
          onChange={(e) => setForm((f) => ({ ...f, attorney_phone: e.target.value }))}
        />
      </label>
      <label className="text-xs text-gray-600">
        Attorney email
        <input
          type="email"
          className="mt-1 w-full rounded-sm border border-gray-200 px-2 py-1 text-sm"
          value={form.attorney_email}
          onChange={(e) => setForm((f) => ({ ...f, attorney_email: e.target.value }))}
        />
      </label>
    </div>
  );
}
