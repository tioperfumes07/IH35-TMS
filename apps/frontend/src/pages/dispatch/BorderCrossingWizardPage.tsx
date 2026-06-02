import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader";
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

const STEPS = ["Load", "Port", "Cargo", "Broker", "FAST", "Review"];

export function BorderCrossingWizardPage() {
  const { selectedCompanyId } = useCompanyContext();
  const { ports, brokers } = useBorderCrossingApi(selectedCompanyId ?? undefined);
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

  const patch = (next: Partial<WizardFormState>) => setForm((prev) => ({ ...prev, ...next }));

  const canNext = useMemo(() => {
    if (step === 0) return Boolean(form.unitId && form.direction);
    if (step === 1) return Boolean(form.portOfEntryId && form.plannedDate);
    if (step === 2) return Boolean(form.commodity.trim());
    return true;
  }, [step, form]);

  const submitWizard = async () => {
    if (!selectedCompanyId) {
      setError("Select an operating company first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const plannedIso = new Date(form.plannedDate).toISOString();
      const res = await fetch("/api/v1/border-crossing/wizard", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operating_company_id: selectedCompanyId,
          load_id: form.loadId || undefined,
          unit_id: form.unitId,
          driver_id: form.driverId || undefined,
          direction: form.direction,
          port_of_entry_id: form.portOfEntryId,
          planned_date: plannedIso,
          commodity: form.commodity,
          commodity_value: form.commodityValue ? Number(form.commodityValue) : undefined,
          weight: form.weight ? Number(form.weight) : undefined,
          hazmat: form.hazmat,
          customs_broker_id: form.customsBrokerId || undefined,
          bond_number: form.bondNumber || undefined,
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
      setResult({
        crossingId: payload.crossing_id,
        emanifestReference: payload.emanifest_reference,
        fastCardVerified: payload.fast_card_verified,
        fastCardWarning: payload.fast_card_warning,
      });
      setStep(5);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
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
        subtitle="Northbound/southbound crossing prep · eManifest V1 · CBP wait times"
        actions={
          <Link to="/dispatch/border-crossing/history" className="rounded border px-3 py-1.5 text-sm">
            History
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="rounded border border-gray-200 bg-white p-4">
          <div className="mb-4 flex flex-wrap gap-2">
            {STEPS.map((label, idx) => (
              <button
                key={label}
                type="button"
                className={`rounded px-2 py-1 text-xs ${idx === step ? "bg-blue-600 text-white" : "bg-gray-100"}`}
                onClick={() => setStep(idx)}
              >
                {idx + 1}. {label}
              </button>
            ))}
          </div>

          {step === 0 && <WizardStep1 form={form} onChange={patch} />}
          {step === 1 && <WizardStep2 form={form} ports={ports} onChange={patch} />}
          {step === 2 && <WizardStep3 form={form} onChange={patch} />}
          {step === 3 && <WizardStep4 form={form} brokers={brokers} onChange={patch} />}
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
              <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={() => setStep(step - 1)}>
                Back
              </button>
            ) : null}
            {step < 4 ? (
              <button
                type="button"
                className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                disabled={!canNext}
                onClick={() => setStep(step + 1)}
              >
                Next
              </button>
            ) : null}
            {step === 4 ? (
              <button
                type="button"
                className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                disabled={submitting || !canNext}
                onClick={() => void submitWizard()}
              >
                {submitting ? "Generating…" : "Generate eManifest & log crossing"}
              </button>
            ) : null}
            {step === 5 && pdfUrl ? (
              <a href={pdfUrl} className="rounded border px-3 py-1.5 text-sm" target="_blank" rel="noreferrer">
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
