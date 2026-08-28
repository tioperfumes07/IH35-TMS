import { useEffect, useMemo, useRef, useState } from "react";
import { resolveApiUrl } from "../../api/client";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { CbpWaitTimesWidget } from "../../components/border-crossing/CbpWaitTimesWidget";
import {
  initialWizardForm,
  useBorderCrossingApi,
  type WizardFormState,
} from "../../components/border-crossing/borderCrossingApi";
import { WizardStep1 } from "../../components/border-crossing/WizardStep1";
import { WizardStep2 } from "../../components/border-crossing/WizardStep2";
import { WizardStep3 } from "../../components/border-crossing/WizardStep3";
import { WizardStep4 } from "../../components/border-crossing/WizardStep4";
import { WizardStep5 } from "../../components/border-crossing/WizardStep5";
import { WizardStep6 } from "../../components/border-crossing/WizardStep6";
import { userFacingApiError } from "../../lib/api-error-message";

const STEPS = ["Load", "Port", "Cargo", "Broker", "FAST", "Review"];

export function BorderCrossingWizardPage() {
  const { selectedCompanyId } = useCompanyContext();
  const { ports, brokers, portsLoading, brokersLoading, portsError, brokersError } = useBorderCrossingApi(
    selectedCompanyId ?? undefined,
  );
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<WizardFormState>(initialWizardForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    crossingId?: string;
    emanifestReference?: string;
    fastCardVerified?: boolean;
    fastCardWarning?: string | null;
  } | null>(null);
  const scopeGeneration = useRef(0);

  useEffect(() => {
    scopeGeneration.current += 1;
    setStep(0);
    setForm(initialWizardForm);
    setError(null);
    setResult(null);
    setSubmitting(false);
  }, [selectedCompanyId]);

  const patch = (next: Partial<WizardFormState>) => setForm((prev) => ({ ...prev, ...next }));

  const canNext = useMemo(() => {
    if (step === 0) return Boolean(form.unitId && form.direction);
    if (step === 1) return Boolean(form.portOfEntryId && form.plannedDate);
    if (step === 2) return Boolean(form.commodity.trim());
    return true;
  }, [step, form]);

  const catalogSettled = !portsLoading && (!selectedCompanyId || !brokersLoading);
  const showPortsEmpty = Boolean(selectedCompanyId) && catalogSettled && !portsError && ports.length === 0;
  const showBrokersEmpty =
    Boolean(selectedCompanyId) && catalogSettled && !brokersError && step === 3 && brokers.length === 0;

  const submitWizard = async () => {
    if (!selectedCompanyId) {
      setError("Select an operating company first.");
      return;
    }
    const input = {
      companyId: selectedCompanyId,
      form: { ...form },
      generation: scopeGeneration.current,
    };
    setSubmitting(true);
    setError(null);
    try {
      const plannedIso = new Date(input.form.plannedDate).toISOString();
      const res = await fetch(resolveApiUrl("/api/v1/border-crossing/wizard"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operating_company_id: input.companyId,
          load_id: input.form.loadId || undefined,
          unit_id: input.form.unitId,
          driver_id: input.form.driverId || undefined,
          direction: input.form.direction,
          port_of_entry_id: input.form.portOfEntryId,
          planned_date: plannedIso,
          commodity: input.form.commodity,
          commodity_value: input.form.commodityValue ? Number(input.form.commodityValue) : undefined,
          weight: input.form.weight ? Number(input.form.weight) : undefined,
          hazmat: input.form.hazmat,
          customs_broker_id: input.form.customsBrokerId || undefined,
          bond_number: input.form.bondNumber || undefined,
        }),
      });
      const payload = (await res.json()) as {
        error?: string;
        crossing_id?: string;
        emanifest_reference?: string;
        fast_card_verified?: boolean;
        fast_card_warning?: string | null;
      };
      if (!res.ok) throw new Error(payload.error ?? "Wizard submission failed");
      if (scopeGeneration.current !== input.generation) return;
      setResult({
        crossingId: payload.crossing_id,
        emanifestReference: payload.emanifest_reference,
        fastCardVerified: payload.fast_card_verified,
        fastCardWarning: payload.fast_card_warning,
      });
      setStep(5);
    } catch (err) {
      if (scopeGeneration.current !== input.generation) return;
      setError(userFacingApiError(err, "Wizard submission failed"));
    } finally {
      if (scopeGeneration.current === input.generation) setSubmitting(false);
    }
  };

  const pdfUrl =
    result?.crossingId && selectedCompanyId
      ? `/api/v1/border-crossing/${result.crossingId}/emanifest.pdf?operating_company_id=${encodeURIComponent(selectedCompanyId)}`
      : null;

  return (
    <div data-testid="border-crossing-wizard-page" className="mx-auto max-w-4xl space-y-4">
      <PageHeader
        title="Border Crossing Wizard"
        subtitle="Prepare northbound and southbound crossings with eManifest V1 and CBP wait times."
        actions={
          <Link to="/dispatch/border-crossing/history" className="rounded-sm border px-3 py-1.5 text-sm">
            History
          </Link>
        }
      />

      {!selectedCompanyId ? (
        <p className="rounded-sm border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700" data-testid="border-crossing-need-company">
          Select an operating company to load entity-scoped customs brokers and submit a crossing.
        </p>
      ) : null}
      {portsError ? (
        <ListErrorBanner message={portsError} onRetry={() => window.location.reload()} />
      ) : null}
      {brokersError ? (
        <ListErrorBanner message={brokersError} onRetry={() => window.location.reload()} />
      ) : null}
      {showPortsEmpty ? (
        <p className="rounded-sm border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700" data-testid="border-crossing-ports-honest-empty">
          No ports of entry are available yet. Ports populate from the border-crossing ports catalog; until then the
          Port step has nothing to select.
        </p>
      ) : null}
      {showBrokersEmpty ? (
        <p className="rounded-sm border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700" data-testid="border-crossing-brokers-honest-empty">
          No customs brokers for this company. Brokers appear after they are created for the active entity (Broker
          step can stay empty until then).
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="rounded-sm border border-gray-200 bg-white p-4">
          <div className="mb-4 flex flex-wrap gap-2">
            {STEPS.map((label, idx) => (
              <button
                key={label}
                type="button"
                className={`rounded-sm px-2 py-1 text-xs ${idx === step ? "bg-[#1F2A44] text-white" : "bg-gray-100"}`}
                disabled={submitting}
                onClick={() => setStep(idx)}
              >
                {idx + 1}. {label}
              </button>
            ))}
          </div>

          {step === 0 && <WizardStep1 form={form} onChange={patch} operatingCompanyId={selectedCompanyId ?? ""} />}
          {step === 1 && <WizardStep2 form={form} ports={ports} onChange={patch} />}
          {step === 2 && <WizardStep3 form={form} onChange={patch} />}
          {step === 3 && (
            <WizardStep4
              form={form}
              brokers={brokers}
              operatingCompanyId={selectedCompanyId ?? ""}
              onChange={patch}
            />
          )}
          {step === 4 && (
            <WizardStep5
              driverId={form.driverId}
              fastCardVerified={result?.fastCardVerified ?? null}
              fastCardWarning={result?.fastCardWarning ?? null}
              checking={false}
            />
          )}
          {step === 5 && <WizardStep6 form={form} ports={ports} result={result} />}

          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

          <div className="mt-4 flex flex-wrap gap-2">
            {step > 0 ? (
              <button type="button" className="rounded-sm border px-3 py-1.5 text-sm" disabled={submitting} onClick={() => setStep(step - 1)}>
                Back
              </button>
            ) : null}
            {step < 4 ? (
              <button
                type="button"
                className="rounded-sm bg-[#1F2A44] px-3 py-1.5 text-sm text-white disabled:opacity-50"
                disabled={submitting || !canNext}
                onClick={() => setStep(step + 1)}
              >
                Next
              </button>
            ) : null}
            {step === 4 ? (
              <button
                type="button"
                className="rounded-sm bg-[#1F2A44] px-3 py-1.5 text-sm text-white disabled:opacity-50"
                disabled={submitting || !canNext}
                onClick={() => void submitWizard()}
              >
                {submitting ? "Generating…" : "Generate eManifest & log crossing"}
              </button>
            ) : null}
            {step === 5 && pdfUrl ? (
              <a href={pdfUrl} className="rounded-sm border px-3 py-1.5 text-sm" target="_blank" rel="noreferrer">
                Print eManifest PDF
              </a>
            ) : null}
          </div>
        </div>

        <CbpWaitTimesWidget />
      </div>
    </div>
  );
}
