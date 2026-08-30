import { useState } from "react";
import { Button } from "../Button";
import { DatePicker } from "../forms/DatePicker";
import { useStagedListFilters } from "../table";

export type DispatchAlertRange = { from: string; to: string };
const EMPTY_RANGE: DispatchAlertRange = { from: "", to: "" };

export function DispatchAlertServerControls({
  value,
  onApply,
}: {
  value: DispatchAlertRange;
  onApply: (value: DispatchAlertRange) => void;
}) {
  const [applied, setApplied] = useState(value);
  const staged = useStagedListFilters({
    applied,
    empty: EMPTY_RANGE,
    onApply: (next) => {
      setApplied(next);
      onApply(next);
    },
  });
  const invalid = Boolean(staged.draft.from && staged.draft.to && staged.draft.from > staged.draft.to);

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-sm border bg-white p-3" data-testid="dispatch-alert-server-controls">
      <label className="flex min-w-40 flex-col gap-1 text-xs font-medium text-slate-700">
        From
        <DatePicker value={staged.draft.from} onChange={(from) => staged.setDraft((current) => ({ ...current, from }))} />
      </label>
      <label className="flex min-w-40 flex-col gap-1 text-xs font-medium text-slate-700">
        To
        <DatePicker value={staged.draft.to} onChange={(to) => staged.setDraft((current) => ({ ...current, to }))} />
      </label>
      <Button type="button" size="sm" disabled={invalid} onClick={staged.apply}>Apply</Button>
      <Button type="button" size="sm" variant="secondary" onClick={staged.cancel}>Cancel</Button>
      <Button type="button" size="sm" variant="ghost" onClick={staged.reset}>Reset</Button>
      {invalid ? <span className="text-xs text-red-700">From must be on or before To.</span> : null}
    </div>
  );
}
