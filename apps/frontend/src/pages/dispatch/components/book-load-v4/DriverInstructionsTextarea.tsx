import type { UseFormRegister } from "react-hook-form";

type Props = {
  register: UseFormRegister<Record<string, unknown>>;
};

export function DriverInstructionsTextarea({ register }: Props) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-700">Driver instructions</span>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-semibold text-amber-900">Visible to driver</span>
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-semibold text-emerald-900">New</span>
      </div>
      <textarea {...register("driver_instructions_text")} rows={3} className="w-full resize-y rounded border border-gray-300 px-2 py-1 text-sm" />
      <p className="text-[9px] text-gray-500">
        Prints on driver dispatch sheet · shows in driver mobile app · driver marks &apos;read&apos; on receipt · edits audit-logged on save
      </p>
    </div>
  );
}
