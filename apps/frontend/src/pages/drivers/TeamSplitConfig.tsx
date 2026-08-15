import { useMemo, useState } from "react";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { Button } from "../../components/Button";
import { DriverPickerWithCreate } from "../../components/drivers/DriverPickerWithCreate";
import { Modal } from "../../components/Modal";
import { StatusBadge } from "../../components/StatusBadge";
import { useTeamSplits } from "../../hooks/useTeamSplits";
import { entityLabel } from "../../lib/entity-label";
import { EntityLink } from "../../components/shared/EntityLink";
import { EntityPicker } from "../../components/parity/EntityPicker";
import { Link, useSearchParams } from "react-router-dom";

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
  const { data, isLoading, isError, refetch, create, endConfig } = useTeamSplits(operatingCompanyId);
  const [searchParams, setSearchParams] = useSearchParams();
  const teamId = searchParams.get("team_id");
  // LST-F5185 — visible EntityPicker (URL-only ?driver_id= is not reverse chrome).
  const driverId = searchParams.get("driver_id")?.trim() ?? "";

  const [createOpen, setCreateOpen] = useState(false);
  const [primaryDriverId, setPrimaryDriverId] = useState("");
  const [secondaryDriverId, setSecondaryDriverId] = useState("");
  const [primaryRatio, setPrimaryRatio] = useState(0.6);
  const [secondaryRatio, setSecondaryRatio] = useState(0.4);
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string | null>(null);

  function setDriverId(next: string) {
    const p = new URLSearchParams(searchParams);
    if (next) p.set("driver_id", next);
    else p.delete("driver_id");
    setSearchParams(p, { replace: true });
  }

  const configs = data?.configs ?? [];
  const active = useMemo(
    () => configs.filter((row) => row.status === "active")
      .filter((row) => !teamId || row.id === teamId)
      .filter((row) => !driverId || row.primary_driver_id === driverId || row.secondary_driver_id === driverId),
    [configs, driverId, teamId]
  );

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
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-900">Team split configs</h2>
          <label className="block min-w-[240px] text-xs text-slate-600">
            Driver
            <div className="mt-1">
              <EntityPicker
                kind="driver"
                operatingCompanyId={operatingCompanyId}
                value={driverId || null}
                onChange={(next) => setDriverId(next ?? "")}
                allowCreate={false}
                placeholder="All drivers"
                className="w-full"
                dataTestId="team-split-config-filter-driver"
              />
            </div>
          </label>
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          Create config
        </Button>
      </div>
      {teamId || driverId ? (
        <Link className="text-xs font-semibold text-slate-700 underline" to="/drivers/team-splits">
          Clear driver/config target
        </Link>
      ) : null}

      {isLoading ? <p className="text-xs text-gray-500">Loading team split configs…</p> : null}
      {isError ? (
        <p className="text-xs text-red-700">
          Team split configurations unavailable.{" "}
          <button type="button" className="font-semibold underline" onClick={() => void refetch()}>Retry</button>
        </p>
      ) : null}
      {active.length === 0 && !isLoading && !isError ? <p className="text-xs text-gray-500">No active team split configs.</p> : null}

      <div className="space-y-2">
        {active.map((row) => (
          <div key={row.id} className="rounded-sm border border-gray-200 bg-white p-3" data-team-split-config-id={row.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-gray-900">
                  <EntityLink kind="driver" id={row.primary_driver_id} label={entityLabel(row.primary_driver_name, row.primary_driver_id, "Driver")} /> /{" "}
                  <EntityLink kind="driver" id={row.secondary_driver_id} label={entityLabel(row.secondary_driver_name, row.secondary_driver_id, "Driver")} />
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

      <Modal variant="drawer" open={createOpen} onClose={() => setCreateOpen(false)} title="Create team split config">
        <div className="space-y-3">
          <label className="block text-xs font-medium text-gray-700">
            Primary driver
            <div className="mt-1">
              <DriverPickerWithCreate
                operatingCompanyId={operatingCompanyId}
                value={primaryDriverId || null}
                onChange={(next) => setPrimaryDriverId(next ?? "")}
                open={createOpen}
                placeholder="Select driver…"
                dataField="team-split-primary-driver"
              />
            </div>
          </label>
          <label className="block text-xs font-medium text-gray-700">
            Secondary driver
            <div className="mt-1">
              <DriverPickerWithCreate
                operatingCompanyId={operatingCompanyId}
                value={secondaryDriverId || null}
                onChange={(next) => setSecondaryDriverId(next ?? "")}
                open={createOpen}
                placeholder="Select driver…"
                dataField="team-split-secondary-driver"
              />
            </div>
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
            <textarea className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1 text-sm" value={memo} onChange={(e) => setMemo(e.target.value)} />
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
