type IdentityStepProps = {
  value: Record<string, string>;
  onChange: (patch: Record<string, string>) => void;
  disabled?: boolean;
};

export function OnboardingStepIdentity({ value, onChange, disabled }: IdentityStepProps) {
  const field = (key: string, label: string, type = "text") => (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      <input
        type={type}
        className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        value={value[key] ?? ""}
        disabled={disabled}
        onChange={(e) => onChange({ [key]: e.target.value })}
      />
    </label>
  );

  return (
    <div data-testid="onboarding-step-identity" className="grid gap-3 sm:grid-cols-2">
      {field("first_name", "First name")}
      {field("last_name", "Last name")}
      {field("phone", "Phone")}
      {field("email", "Email", "email")}
      {field("cdl_number", "CDL number")}
      {field("cdl_state", "CDL state")}
      {field("cdl_class", "CDL class")}
    </div>
  );
}
