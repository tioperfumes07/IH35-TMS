import { useState } from "react";

export type SampleSeedSummary = {
  customer_id: string;
  vendor_id: string;
  driver_id: string;
  unit_id: string;
  load_id: string;
};

export type SampleStepData = {
  seeded?: boolean;
  last_seeded_at?: string;
  summary?: SampleSeedSummary;
};

type Props = {
  value: SampleStepData;
  disabled?: boolean;
  seeding?: boolean;
  onSeed: () => void;
};

export function Step6SampleData({ value, disabled, seeding, onSeed }: Props) {
  const [optIn, setOptIn] = useState<boolean>(value.seeded ?? true);

  return (
    <div className="space-y-3" data-testid="onboarding-step-samples">
      <h2 className="text-base font-semibold text-gray-900">Seed sample data (optional)</h2>
      <p className="text-sm text-gray-600">
        Add one sample customer, vendor, driver, truck, and load so you can explore every module with realistic data.
        Sample rows are flagged and can be removed later from admin tools.
      </p>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={optIn}
          disabled={disabled}
          onChange={(e) => setOptIn(e.target.checked)}
        />
        <span>Seed sample data for tutorial</span>
      </label>

      {value.seeded ? (
        <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          Sample data seeded{value.last_seeded_at ? ` at ${value.last_seeded_at}` : ""}.
          {value.summary ? (
            <ul className="mt-1 list-disc pl-5 text-xs">
              <li>Customer: Sample Customer Inc</li>
              <li>Vendor: Sample Vendor Co</li>
              <li>Driver: John Tester</li>
              <li>Truck: TEST-001</li>
              <li>Load: LD-SAMPLE-001</li>
            </ul>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        disabled={disabled || !optIn || seeding}
        onClick={onSeed}
        className="rounded bg-[#1F2A44] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {seeding ? "Seeding…" : value.seeded ? "Re-seed sample data" : "Seed sample data"}
      </button>
    </div>
  );
}
