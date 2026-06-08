import { useState } from "react";
import type { IftaFiling } from "../../../api/reports-ifta";
import { Step1MileageReview } from "./Step1MileageReview";
import { Step2FuelReview } from "./Step2FuelReview";
import { Step3JurisdictionCalc } from "./Step3JurisdictionCalc";
import { Step4FinalReview } from "./Step4FinalReview";

const STEPS = [
  { id: 1, label: "Mileage" },
  { id: 2, label: "Fuel" },
  { id: 3, label: "Tax calc" },
  { id: 4, label: "Final review" },
] as const;

type Props = {
  filing: IftaFiling;
  isOwner: boolean;
  onSaveMilesOverrides: (overrides: Record<string, number>) => Promise<void>;
  onSaveFuelOverrides: (overrides: Record<string, number>) => Promise<void>;
  onOwnerApprove: (payload: { wf064_confirm: true; confirm_phrase: "APPROVE"; hold_seconds_elapsed: number }) => Promise<void>;
  onMarkFiled: (confirmationNumber: string) => Promise<void>;
  savingOverrides?: boolean;
  approving?: boolean;
  filingPending?: boolean;
};

export function StepWizard({
  filing,
  isOwner,
  onSaveMilesOverrides,
  onSaveFuelOverrides,
  onOwnerApprove,
  onMarkFiled,
  savingOverrides,
  approving,
  filingPending,
}: Props) {
  const [activeStep, setActiveStep] = useState(1);

  return (
    <div className="space-y-3" data-ifta-step-wizard="true">
      <nav className="flex flex-wrap gap-2">
        {STEPS.map((step) => (
          <button
            key={step.id}
            type="button"
            className={
              activeStep === step.id
                ? "rounded border border-amber-500 bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900"
                : "rounded border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
            }
            onClick={() => setActiveStep(step.id)}
            data-ifta-wizard-step={step.id}
          >
            Step {step.id} · {step.label}
          </button>
        ))}
      </nav>

      {activeStep === 1 ? (
        <Step1MileageReview filing={filing} onSaveOverrides={onSaveMilesOverrides} saving={savingOverrides} />
      ) : null}
      {activeStep === 2 ? (
        <Step2FuelReview filing={filing} onSaveOverrides={onSaveFuelOverrides} saving={savingOverrides} />
      ) : null}
      {activeStep === 3 ? <Step3JurisdictionCalc filing={filing} /> : null}
      {activeStep === 4 ? (
        <Step4FinalReview
          filing={filing}
          isOwner={isOwner}
          onOwnerApprove={onOwnerApprove}
          onMarkFiled={onMarkFiled}
          approving={approving}
          filingPending={filingPending}
        />
      ) : null}
    </div>
  );
}
