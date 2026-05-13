import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { legalMattersApi, type LegalMatterRow } from "../../../api/legal-matters";
import { Button } from "../../../components/Button";
import { PageHeader } from "../../../components/layout/PageHeader";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { LegalModuleTabs } from "../LegalModuleTabs";

export function LegalMatterNewPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const navigate = useNavigate();
  const [form, setForm] = useState({
    matter_number: "",
    type: "lawsuit",
    severity: "medium",
    our_role: "defendant",
    opposing_party: "",
    case_number: "",
    court: "",
    description: "",
    internal_notes: "",
    amount_claimed_against_us: "",
    amount_we_seek: "",
    next_hearing_date: "",
    statute_of_limitations_at: "",
    attorney_name: "",
    attorney_firm: "",
    attorney_phone: "",
    attorney_email: "",
  });

  const createMut = useMutation<{ matter: LegalMatterRow }, Error, void>({
    mutationFn: () =>
      legalMattersApi.create(companyId, {
        matter_number: form.matter_number.trim(),
        type: form.type,
        severity: form.severity,
        our_role: form.our_role,
        opposing_party: form.opposing_party.trim() || undefined,
        case_number: form.case_number.trim() || undefined,
        court: form.court.trim() || undefined,
        description: form.description.trim() || undefined,
        internal_notes: form.internal_notes.trim() || undefined,
        amount_claimed_against_us: form.amount_claimed_against_us ? Number(form.amount_claimed_against_us) : undefined,
        amount_we_seek: form.amount_we_seek ? Number(form.amount_we_seek) : undefined,
        next_hearing_date: form.next_hearing_date || undefined,
        statute_of_limitations_at: form.statute_of_limitations_at || undefined,
        attorney_name: form.attorney_name.trim() || undefined,
        attorney_firm: form.attorney_firm.trim() || undefined,
        attorney_phone: form.attorney_phone.trim() || undefined,
        attorney_email: form.attorney_email.trim() || undefined,
      }),
    onSuccess: (data) => navigate(`/legal/matters/${String(data.matter.id ?? "")}`),
  });

  return (
    <div className="space-y-3">
      <PageHeader title="Create legal matter" subtitle="Create a matter record" />
      <LegalModuleTabs activeTabId="matters" />
      {!companyId ? (
        <p className="text-sm text-gray-600">Select an operating company.</p>
      ) : (
        <div className="mx-auto max-w-3xl space-y-3 rounded border border-gray-200 bg-white p-4">
          <div className="grid gap-2 md:grid-cols-2">
            <label className="text-xs text-gray-600">
              Matter number
              <input
                className="mt-1 w-full rounded border border-gray-200 px-2 py-1 text-sm"
                value={form.matter_number}
                onChange={(e) => setForm((f) => ({ ...f, matter_number: e.target.value }))}
              />
            </label>
            <label className="text-xs text-gray-600">
              Type
              <select
                className="mt-1 w-full rounded border border-gray-200 px-2 py-1 text-sm"
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              >
                {["lawsuit", "claim", "demand_letter", "settlement", "regulatory", "other"].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-gray-600">
              Severity
              <select
                className="mt-1 w-full rounded border border-gray-200 px-2 py-1 text-sm"
                value={form.severity}
                onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}
              >
                {["low", "medium", "high", "critical"].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-gray-600">
              Our role
              <select
                className="mt-1 w-full rounded border border-gray-200 px-2 py-1 text-sm"
                value={form.our_role}
                onChange={(e) => setForm((f) => ({ ...f, our_role: e.target.value }))}
              >
                {["defendant", "plaintiff", "third_party", "other"].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-gray-600 md:col-span-2">
              Opposing party
              <input
                className="mt-1 w-full rounded border border-gray-200 px-2 py-1 text-sm"
                value={form.opposing_party}
                onChange={(e) => setForm((f) => ({ ...f, opposing_party: e.target.value }))}
              />
            </label>
            <label className="text-xs text-gray-600">
              Case number
              <input
                className="mt-1 w-full rounded border border-gray-200 px-2 py-1 text-sm"
                value={form.case_number}
                onChange={(e) => setForm((f) => ({ ...f, case_number: e.target.value }))}
              />
            </label>
            <label className="text-xs text-gray-600">
              Court
              <input
                className="mt-1 w-full rounded border border-gray-200 px-2 py-1 text-sm"
                value={form.court}
                onChange={(e) => setForm((f) => ({ ...f, court: e.target.value }))}
              />
            </label>
            <label className="text-xs text-gray-600">
              Amount claimed (against us)
              <input
                inputMode="decimal"
                className="mt-1 w-full rounded border border-gray-200 px-2 py-1 text-sm"
                value={form.amount_claimed_against_us}
                onChange={(e) => setForm((f) => ({ ...f, amount_claimed_against_us: e.target.value }))}
              />
            </label>
            <label className="text-xs text-gray-600">
              Amount we seek
              <input
                inputMode="decimal"
                className="mt-1 w-full rounded border border-gray-200 px-2 py-1 text-sm"
                value={form.amount_we_seek}
                onChange={(e) => setForm((f) => ({ ...f, amount_we_seek: e.target.value }))}
              />
            </label>
            <label className="text-xs text-gray-600">
              Next hearing (date)
              <input
                type="date"
                className="mt-1 w-full rounded border border-gray-200 px-2 py-1 text-sm"
                value={form.next_hearing_date}
                onChange={(e) => setForm((f) => ({ ...f, next_hearing_date: e.target.value }))}
              />
            </label>
            <label className="text-xs text-gray-600">
              Statute of limitations (date)
              <input
                type="date"
                className="mt-1 w-full rounded border border-gray-200 px-2 py-1 text-sm"
                value={form.statute_of_limitations_at}
                onChange={(e) => setForm((f) => ({ ...f, statute_of_limitations_at: e.target.value }))}
              />
            </label>
            <label className="text-xs text-gray-600 md:col-span-2">
              Description
              <textarea
                className="mt-1 min-h-[80px] w-full rounded border border-gray-200 px-2 py-1 text-sm"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </label>
            <label className="text-xs text-gray-600 md:col-span-2">
              Internal notes
              <textarea
                className="mt-1 min-h-[60px] w-full rounded border border-gray-200 px-2 py-1 text-sm"
                value={form.internal_notes}
                onChange={(e) => setForm((f) => ({ ...f, internal_notes: e.target.value }))}
              />
            </label>
            <label className="text-xs text-gray-600">
              Attorney name
              <input
                className="mt-1 w-full rounded border border-gray-200 px-2 py-1 text-sm"
                value={form.attorney_name}
                onChange={(e) => setForm((f) => ({ ...f, attorney_name: e.target.value }))}
              />
            </label>
            <label className="text-xs text-gray-600">
              Attorney firm
              <input
                className="mt-1 w-full rounded border border-gray-200 px-2 py-1 text-sm"
                value={form.attorney_firm}
                onChange={(e) => setForm((f) => ({ ...f, attorney_firm: e.target.value }))}
              />
            </label>
          </div>
          <div className="flex gap-2">
            <Link to="/legal/matters">
              <Button variant="secondary">Cancel</Button>
            </Link>
            <Button
              disabled={createMut.isPending || !form.matter_number.trim()}
              onClick={() => void createMut.mutate()}
            >
              Save
            </Button>
          </div>
          {createMut.isError ? <p className="text-sm text-red-600">Could not create matter.</p> : null}
        </div>
      )}
    </div>
  );
}
