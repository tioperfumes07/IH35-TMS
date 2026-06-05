import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { Step1Company, type CompanyStepData } from "./Step1Company";
import { Step2QBOConnect, type QboStepData } from "./Step2QBOConnect";
import { Step3SamsaraConnect, type SamsaraStepData } from "./Step3SamsaraConnect";
import { Step4PlaidConnect, type PlaidStepData } from "./Step4PlaidConnect";
import { Step5InviteTeam, type TeamStepData } from "./Step5InviteTeam";
import { Step6SampleData, type SampleStepData, type SampleSeedSummary } from "./Step6SampleData";

export type OnboardingStep = "company" | "qbo" | "samsara" | "plaid" | "team" | "samples" | "complete";

export const ONBOARDING_STEP_ORDER: OnboardingStep[] = [
  "company",
  "qbo",
  "samsara",
  "plaid",
  "team",
  "samples",
];

export const ONBOARDING_STEP_LABELS: Record<OnboardingStep, string> = {
  company: "Company",
  qbo: "QuickBooks",
  samsara: "Samsara",
  plaid: "Bank (Plaid)",
  team: "Invite team",
  samples: "Sample data",
  complete: "Complete",
};

type OnboardingStepData = {
  company?: CompanyStepData;
  qbo?: QboStepData;
  samsara?: SamsaraStepData;
  plaid?: PlaidStepData;
  team?: TeamStepData;
  samples?: SampleStepData;
};

type OnboardingState = {
  company_id: string;
  current_step: OnboardingStep;
  step_data: OnboardingStepData;
  skipped_steps: OnboardingStep[];
  completed_at: string | null;
  updated_at: string;
};

type GetStateResponse = { state: OnboardingState; steps: OnboardingStep[] };
type PatchStateResponse = { state: OnboardingState; invites_sent: number; invites_failed: number };
type SeedResponse = { ok: boolean; summary: SampleSeedSummary };

function getOnboardingState(companyId: string) {
  return apiRequest<GetStateResponse>(
    `/api/v1/onboarding/state?operating_company_id=${encodeURIComponent(companyId)}`
  );
}

function patchOnboardingState(
  companyId: string,
  payload: {
    current_step?: OnboardingStep;
    step_data?: Partial<OnboardingStepData>;
    skipped_steps?: OnboardingStep[];
    mark_complete?: boolean;
    send_team_invites?: boolean;
  }
) {
  return apiRequest<PatchStateResponse>("/api/v1/onboarding/state", {
    method: "PATCH",
    body: { operating_company_id: companyId, ...payload },
  });
}

function seedSampleData(companyId: string) {
  return apiRequest<SeedResponse>("/api/v1/onboarding/seed-sample-data", {
    method: "POST",
    body: { operating_company_id: companyId },
  });
}

export function OnboardingWizard() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const qc = useQueryClient();
  const [activeIndex, setActiveIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const stateQuery = useQuery({
    queryKey: ["onboarding-state", companyId],
    enabled: Boolean(companyId),
    queryFn: () => getOnboardingState(companyId),
  });

  const state = stateQuery.data?.state;
  const stepData: OnboardingStepData = state?.step_data ?? {};
  const completed = state?.current_step === "complete" || Boolean(state?.completed_at);

  const patchMut = useMutation({
    mutationFn: (payload: Parameters<typeof patchOnboardingState>[1]) => patchOnboardingState(companyId, payload),
    onSuccess: (data) => {
      qc.setQueryData(["onboarding-state", companyId], (prev: GetStateResponse | undefined) =>
        prev ? { ...prev, state: data.state } : prev
      );
    },
    onError: (err: Error) => setError(err.message),
  });

  const seedMut = useMutation({
    mutationFn: () => seedSampleData(companyId),
    onSuccess: () => {
      setError(null);
      void stateQuery.refetch();
    },
    onError: (err: Error) => setError(err.message),
  });

  const activeStep = ONBOARDING_STEP_ORDER[activeIndex];

  const canAdvance = useMemo(() => {
    if (activeStep === "company") {
      const c = stepData.company ?? {};
      return Boolean(c.company_name && c.mc_number && c.dot_number);
    }
    return true;
  }, [activeStep, stepData.company]);

  function updateStep<K extends keyof OnboardingStepData>(key: K, patch: OnboardingStepData[K]) {
    setError(null);
    void patchMut.mutateAsync({ current_step: activeStep, step_data: { [key]: patch } as Partial<OnboardingStepData> });
  }

  async function saveAndAdvance() {
    setError(null);
    const isTeamStep = activeStep === "team";
    const nextIndex = Math.min(ONBOARDING_STEP_ORDER.length - 1, activeIndex + 1);
    const nextStep = ONBOARDING_STEP_ORDER[nextIndex];
    await patchMut.mutateAsync({
      current_step: nextStep,
      send_team_invites: isTeamStep,
    });
    setActiveIndex(nextIndex);
  }

  async function completeOnboarding() {
    setError(null);
    await patchMut.mutateAsync({ mark_complete: true });
  }

  if (!companyId) {
    return <div className="rounded border bg-white p-4 text-sm">Select an operating company to begin onboarding.</div>;
  }
  if (stateQuery.isLoading) {
    return <div className="rounded border bg-white p-4 text-sm">Loading onboarding…</div>;
  }
  if (stateQuery.isError) {
    return <div className="rounded border bg-white p-4 text-sm text-red-700">Could not load onboarding state.</div>;
  }

  const progressPct = Math.round(((activeIndex + (completed ? 1 : 0)) / ONBOARDING_STEP_ORDER.length) * 100);

  return (
    <div data-testid="operator-onboarding-wizard" className="mx-auto max-w-4xl space-y-4">
      <PageHeader title="Operator onboarding" subtitle="Six guided steps to a fully configured account" />

      <div className="h-2 w-full overflow-hidden rounded bg-gray-100">
        <div className="h-full bg-blue-600 transition-all" style={{ width: `${progressPct}%` }} />
      </div>

      {completed ? (
        <div className="rounded border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          Onboarding complete. You can revisit any step from settings.
        </div>
      ) : null}

      <div className="rounded border border-gray-200 bg-white p-4">
        <div className="mb-4 flex flex-wrap gap-2">
          {ONBOARDING_STEP_ORDER.map((step, idx) => (
            <button
              key={step}
              type="button"
              className={`rounded px-2 py-1 text-xs ${idx === activeIndex ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"}`}
              onClick={() => setActiveIndex(idx)}
            >
              {idx + 1}. {ONBOARDING_STEP_LABELS[step]}
            </button>
          ))}
        </div>

        {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}

        {activeStep === "company" ? (
          <Step1Company
            value={stepData.company ?? {}}
            disabled={completed}
            onChange={(patch) => updateStep("company", patch)}
          />
        ) : null}
        {activeStep === "qbo" ? (
          <Step2QBOConnect
            companyId={companyId}
            value={stepData.qbo ?? {}}
            disabled={completed}
            onChange={(patch) => updateStep("qbo", patch)}
          />
        ) : null}
        {activeStep === "samsara" ? (
          <Step3SamsaraConnect
            companyId={companyId}
            value={stepData.samsara ?? {}}
            disabled={completed}
            onChange={(patch) => updateStep("samsara", patch)}
          />
        ) : null}
        {activeStep === "plaid" ? (
          <Step4PlaidConnect
            companyId={companyId}
            value={stepData.plaid ?? {}}
            disabled={completed}
            onChange={(patch) => updateStep("plaid", patch)}
          />
        ) : null}
        {activeStep === "team" ? (
          <Step5InviteTeam
            value={stepData.team ?? {}}
            disabled={completed}
            onChange={(patch) => updateStep("team", patch)}
          />
        ) : null}
        {activeStep === "samples" ? (
          <Step6SampleData
            value={stepData.samples ?? {}}
            disabled={completed}
            seeding={seedMut.isPending}
            onSeed={() => void seedMut.mutateAsync()}
          />
        ) : null}

        {!completed ? (
          <div className="mt-6 flex flex-wrap items-center gap-2">
            {activeIndex < ONBOARDING_STEP_ORDER.length - 1 ? (
              <button
                type="button"
                className="rounded bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                disabled={!canAdvance || patchMut.isPending}
                onClick={() => void saveAndAdvance()}
              >
                Save &amp; continue
              </button>
            ) : (
              <button
                type="button"
                className="rounded border border-green-600 px-3 py-1.5 text-sm font-semibold text-green-700 disabled:opacity-50"
                disabled={patchMut.isPending}
                onClick={() => void completeOnboarding()}
              >
                Finish onboarding
              </button>
            )}
            {activeIndex > 0 ? (
              <button
                type="button"
                className="rounded border px-3 py-1.5 text-sm text-gray-700"
                onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
              >
                Back
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
