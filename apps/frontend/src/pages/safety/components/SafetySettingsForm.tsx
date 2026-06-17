import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { updateSafetySettings } from "../../../api/safety";
import { Button } from "../../../components/Button";

type Props = {
  operatingCompanyId: string;
  settings: Record<string, unknown>;
  onSaved: () => void;
};

export function SafetySettingsForm({ operatingCompanyId, settings, onSaved }: Props) {
  const [activeWindow, setActiveWindow] = useState(String(settings.dashboard_active_window_days ?? 10));
  const [inactiveThreshold, setInactiveThreshold] = useState(String(settings.dashboard_inactive_threshold_days ?? 15));
  const [fineWindow, setFineWindow] = useState(String(settings.default_fine_dispute_window_days ?? 30));
  const [slaDays, setSlaDays] = useState(String(settings.violation_response_sla_days ?? 14));

  const mutation = useMutation({
    mutationFn: () =>
      updateSafetySettings(operatingCompanyId, {
        dashboard_active_window_days: Number(activeWindow),
        dashboard_inactive_threshold_days: Number(inactiveThreshold),
        default_fine_dispute_window_days: Number(fineWindow),
        violation_response_sla_days: Number(slaDays),
      }),
    onSuccess: onSaved,
  });

  return (
    <form
      className="space-y-3 rounded border border-gray-200 bg-white p-3"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">Active window days</label>
          <input
            type="number"
            min={1}
            max={90}
            value={activeWindow}
            onChange={(event) => setActiveWindow(event.target.value)}
            className="rounded border border-gray-300 h-9 px-2 text-[13px]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">Inactive threshold days</label>
          <input
            type="number"
            min={1}
            max={365}
            value={inactiveThreshold}
            onChange={(event) => setInactiveThreshold(event.target.value)}
            className="rounded border border-gray-300 h-9 px-2 text-[13px]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">Fine dispute window days</label>
          <input
            type="number"
            min={1}
            value={fineWindow}
            onChange={(event) => setFineWindow(event.target.value)}
            className="rounded border border-gray-300 h-9 px-2 text-[13px]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">Violation response SLA days</label>
          <input
            type="number"
            min={1}
            value={slaDays}
            onChange={(event) => setSlaDays(event.target.value)}
            className="rounded border border-gray-300 h-9 px-2 text-[13px]"
          />
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" loading={mutation.isPending}>
          Save settings
        </Button>
      </div>
    </form>
  );
}
