import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listDrivers } from "../../api/mdata";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { StatusBadge } from "../../components/StatusBadge";
import { useTeamSplits } from "../../hooks/useTeamSplits";

type Props = {
  operatingCompanyId: string;
};

const RATIO_PRESETS = [
  { label: "50 / 50", primary: 0.5, secondary: 0.5 },
  { label: "60 / 40", primary: 0.6, secondary: 0.4 },
  { label: "70 / 30", primary: 0.7, secondary: 0.3 },
] as const;

export function TeamSplitConfigPanel() {
  const { selectedCompanyId } = useCompanyContext();
  if (!selectedCompanyId) {
    return <p className="px-2 py-2 text-xs text-gray-500">Select an operating company to manage team split configs.</p>;
  }
  return <TeamSplitConfig operatingCompanyId={selectedCompanyId} />;
}

export function TeamSplitConfig({ operatingCompanyId }: Props) {
  const { data, isLoading, create, endConfig } = useTeamSplits(operatingCompanyId);
  const driversQuery = useQuery({
    queryKey: ["drivers", "team-splits", operatingCompanyId],
    queryFn: () => listDrivers({ operating_company_id: operatingCompanyId }).then((res) => res.drivers),
    enabled: Boolean(operatingCompanyId),
  });
  const driverOptions = useMemo(
    () =>
      (driversQuery.data ?? []).map((driver) => ({
        value: driver.id,
        label: `${driver.first_name} ${driver.last_name}`,
      })),
    [driversQuery.data]
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [primaryDriverId, setPrimaryDriverId] = useState("");
  const [secondaryDriverId, setSecondaryDriverId] = useState("");
  const [primaryRatio, setPrimaryRatio] = useState(0.6);
  const [secondaryRatio, setSecondaryRatio] = useState(0.4);
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string | null>(null);

  const configs = data?.configs ?? [];
  const active = useMemo(() => configs.filter((row) => row.status === "active"), [configs]);

  async function handleCreate() {
    setError(null);
    if (!primaryDriverId || !secondaryDriverId) {
      setError("Select both drivers.");
      return;
    }
    try {
      await create.mutateAsync({
        primary_driver_id: primaryDriverId,
        secondary_driver_id: secondaryDriverId,
        primary_ratio: primaryRatio,
        secondary_ratio: secondaryRatio,
        memo: memo || undefined,
      });
      setCreateOpen(false);
      setMemo("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create team split config");
    }
  }

  return (
    <div className="space-y-3 px-2" data-testid="team-split-config-panel">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900">Team split configs</h2>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          Create config
        </Button>
      </div>

      {isLoading ? <p className="text-xs text-gray-500">Loading team split configs…</p> : null}
      {active.length === 0 && !isLoading ? <p className="text-xs text-gray-500">No active team split configs.</p> : null}

      <div className="space-y-2">
        {active.map((row) => (
          <div key={row.id} className="rounded border border-gray-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-gray-900">
                  {row.primary_driver_name || row.primary_driver_id} / {row.secondary_driver_name || row.secondary_driver_id}
                </div>
                <div className="text-xs text-gray-600">
                  {Math.round(Number(row.primary_ratio) * 100)}% / {Math.round(Number(row.secondary_ratio) * 100)}%
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={row.status} />
                <Button type="button" variant="secondary" onClick={() => endConfig.mutate(row.id)}>
                  End config
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create team split config">
        <div className="space-y-3">
          <label className="block text-xs font-medium text-gray-700">
            Primary driver
            <SelectCombobox
              className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-[13px]"
              value={primaryDriverId}
              onChange={(e) => setPrimaryDriverId(e.target.value)}
            >
              <option value="">Select driver…</option>
              {driverOptions.map((driver) => (
                <option key={driver.value} value={driver.value}>
                  {driver.label}
                </option>
              ))}
            </SelectCombobox>
          </label>
          <label className="block text-xs font-medium text-gray-700">
            Secondary driver
            <SelectCombobox
              className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-[13px]"
              value={secondaryDriverId}
              onChange={(e) => setSecondaryDriverId(e.target.value)}
            >
              <option value="">Select driver…</option>
              {driverOptions.map((driver) => (
                <option key={driver.value} value={driver.value}>
                  {driver.label}
                </option>
              ))}
            </SelectCombobox>
          </label>
          <div className="flex flex-wrap gap-2">
            {RATIO_PRESETS.map((preset) => (
              <Button
                key={preset.label}
                type="button"
                variant="secondary"
                onClick={() => {
                  setPrimaryRatio(preset.primary);
                  setSecondaryRatio(preset.secondary);
                }}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <label className="block text-xs font-medium text-gray-700">
            Memo
            <textarea className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm" value={memo} onChange={(e) => setMemo(e.target.value)} />
          </label>
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleCreate}>
              Save config
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
