import type { ReactNode } from "react";

type Props = {
  label: string;
  name: string;
  dirty?: boolean;
  error?: string | null;
  hint?: string;
  ownerOnly?: boolean;
  children: ReactNode;
};

export function FormField({ label, name, dirty = false, error, hint, ownerOnly = false, children }: Props) {
  return (
    <label className="block space-y-0.5" htmlFor={name}>
      <span className="flex items-center gap-1 text-[11px] font-medium text-gray-700">
        {label}
        {ownerOnly ? <span className="text-[10px] text-amber-700">(Owner)</span> : null}
        {dirty ? <span className="inline-block h-1.5 w-1.5 rounded-full bg-yellow-400" title="Modified" aria-hidden /> : null}
      </span>
      {children}
      {hint ? <span className="text-[10px] text-gray-500">{hint}</span> : null}
      {error ? <span className="text-[10px] text-red-600">{error}</span> : null}
    </label>
  );
}
