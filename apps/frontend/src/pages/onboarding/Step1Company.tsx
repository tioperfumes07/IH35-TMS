import { useState } from "react";

export type CompanyStepData = {
  company_name?: string;
  ein?: string;
  address?: string;
  mc_number?: string;
  dot_number?: string;
  naics_code?: string;
  operating_states?: string[];
};

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS",
  "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY",
  "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV",
  "WI", "WY",
];

type Props = {
  value: CompanyStepData;
  disabled?: boolean;
  onChange: (patch: CompanyStepData) => void;
};

export function Step1Company({ value, disabled, onChange }: Props) {
  const [localStates, setLocalStates] = useState<string[]>(value.operating_states ?? []);

  function toggleState(code: string) {
    const next = localStates.includes(code)
      ? localStates.filter((s) => s !== code)
      : [...localStates, code];
    setLocalStates(next);
    onChange({ ...value, operating_states: next });
  }

  return (
    <div className="space-y-3" data-testid="onboarding-step-company">
      <h2 className="text-base font-semibold text-gray-900">Company information</h2>
      <p className="text-sm text-gray-600">Tell us about your carrier so we can configure dispatch, billing, and compliance defaults.</p>

      <label className="block text-sm">
        <span className="font-medium text-gray-700">Company name</span>
        <input
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
          value={value.company_name ?? ""}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, company_name: e.target.value })}
        />
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-gray-700">EIN</span>
          <input
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
            value={value.ein ?? ""}
            disabled={disabled}
            placeholder="12-3456789"
            onChange={(e) => onChange({ ...value, ein: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-gray-700">NAICS code</span>
          <input
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
            value={value.naics_code ?? ""}
            disabled={disabled}
            placeholder="484121 (General Freight Trucking, Long-Distance)"
            onChange={(e) => onChange({ ...value, naics_code: e.target.value })}
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className="font-medium text-gray-700">Address</span>
        <input
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
          value={value.address ?? ""}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, address: e.target.value })}
        />
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-gray-700">MC #</span>
          <input
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
            value={value.mc_number ?? ""}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, mc_number: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-gray-700">DOT #</span>
          <input
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
            value={value.dot_number ?? ""}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, dot_number: e.target.value })}
          />
        </label>
      </div>

      <div className="text-sm">
        <span className="font-medium text-gray-700">Operating states</span>
        <div className="mt-1 flex flex-wrap gap-1">
          {US_STATES.map((code) => (
            <button
              key={code}
              type="button"
              disabled={disabled}
              onClick={() => toggleState(code)}
              className={`rounded px-2 py-0.5 text-xs ${
                localStates.includes(code) ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"
              }`}
            >
              {code}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
