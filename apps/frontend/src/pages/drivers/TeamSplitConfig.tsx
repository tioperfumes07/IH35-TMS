import { useEffect, useMemo, useRef, useState } from "react";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { Button } from "../../components/Button";
import { DriverPickerWithCreate } from "../../components/drivers/DriverPickerWithCreate";
import { Modal } from "../../components/Modal";
import { StatusBadge } from "../../components/StatusBadge";
import { useTeamSplits } from "../../hooks/useTeamSplits";
import { entityLabel } from "../../lib/entity-label";
import { EntityLink } from "../../components/shared/EntityLink";
import { EntityPicker } from "../../components/parity/EntityPicker";
import { useStagedListFilters } from "../../components/table";
import { Link, useSearchParams } from "react-router-dom";

type Props = {
  operatingCompanyId: string;
};

const EMPTY_FILTERS = {
  driverId: "",
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
  // LV-DRIVERS-TEAM-SPLIT-FILTER-SILENT-APPLY — stage until Apply; URL on Apply/Reset.
  const driverIdFromUrl = searchParams.get("driver_id")?.trim() ?? "";

  function patchListSearchParam(next: { driverId: string }) {
    const p = new URLSearchParams(searchParams);
    if (next.driverId) p.set("driver_id", next.driverId);
    else p.delete("driver_id");
    setSearchParams(p, { replace: true });
  }

  const [applied, setApplied] = useState(() => ({
    ...EMPTY_FILTERS,
    driverId: driverIdFromUrl,
  }));
  const staged = useStagedListFilters({
    applied,
    empty: EMPTY_FILTERS,
    onApply: (next) => {
      setApplied(next);
      patchListSearchParam(next);
    },
  });
  const filterDraft = staged.draft;

  useEffect(() => {
    setApplied((prev) => ({ ...prev, driverId: driverIdFromUrl }));
  }, [driverIdFromUrl]);

  function setDriverId(next: string) {
    staged.setDraft((d) => ({ ...d, driverId: next }));
  }

  // Sibling reverse guard matches `driverId` in the active-list filter predicate.
  const driverId = applied.driverId.trim();

  const [createOpen, setCreateOpen] = useState(false);
  const [primaryDriverId, setPrimaryDriverId] = useState("");
  const [secondaryDriverId, setSecondaryDriverId] = useState("");
  const [primaryRatio, setPrimaryRatio] = useState(0.6);
  const [secondaryRatio, setSecondaryRatio] = useState(0.4);
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [endError, setEndError] = useState<string | null>(null);
  const createGenerationRef = useRef(0);

  const resetCreateDraft = () => {
    setPrimaryDriverId("");
    setSecondaryDriverId("");
    setPrimaryRatio(0.6);
    setSecondaryRatio(0.4);
    setMemo("");
    setError(null);
  };

  const closeCreate = () => {
    createGenerationRef.current += 1;
    create.reset();
    setCreateOpen(false);
    resetCreateDraft();
  };

  useEffect(() => {
    createGenerationRef.current += 1;
    create.reset();
    endConfig.reset();
    setCreateOpen(false);
    resetCreateDraft();
    setEndError(null);
  }, [operatingCompanyId]);

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
    const input = { companyId: operatingCompanyId, generation: createGenerationRef.current };
    try {
      await create.mutateAsync({
        companyId: input.companyId,
        payload: {
          primary_driver_id: primaryDriverId,
          secondary_driver_id: secondaryDriverId,
          primary_ratio: primaryRatio,
          secondary_ratio: secondaryRatio,
          memo: memo || undefined,
        },
      });
      if (input.generation !== createGenerationRef.current || input.companyId !== operatingCompanyId) return;
      setCreateOpen(false);
      resetCreateDraft();
    } catch (err) {
      if (input.generation !== createGenerationRef.current || input.companyId !== operatingCompanyId) return;
      setError(err instanceof Error ? err.message : "Failed to create team split config");
    }
  }

  async function handleEnd(id: string) {
    const companyId = operatingCompanyId;
    setEndError(null);
    try {
      await endConfig.mutateAsync({ companyId, id });
    } catch (err) {
      if (companyId !== operatingCompanyId) return;
      setEndError(err instanceof Error ? err.message : "Failed to end team split config");
    }
  }

  return (
    <div className="space-y-3 px-2" data-testid="team-split-config-panel">
      <div className="relative flex flex-wrap items-end justify-between gap-2" data-testid="team-split-config-filters">
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-900">Team split configs</h2>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block min-w-[240px] text-xs text-slate-600">
              Driver
              <div className="mt-1">
                <EntityPicker
                  kind="driver"
                  operatingCompanyId={operatingCompanyId}
                  value={filterDraft.driverId || null}
                  onChange={(next) => setDriverId(next ?? "")}
                  allowCreate={false}
                  placeholder="All drivers"
                  className="w-full"
                  dataTestId="team-split-config-filter-driver"
                />
              </div>
            </label>
            <Button type="button" size="sm" data-testid="team-split-config-filter-apply" onClick={staged.apply} disabled={!staged.dirty}>
              Apply
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              data-testid="team-split-config-filter-cancel"
              onClick={staged.cancel}
              disabled={!staged.dirty}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              data-testid="team-split-config-filter-reset"
              onClick={() => {
                staged.cancel();
                setApplied(EMPTY_FILTERS);
                patchListSearchParam(EMPTY_FILTERS);
              }}
            >
              Reset
            </Button>
          </div>
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          Create config
        </Button>
      </div>
      {teamId || driverId || staged.dirty ? (
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
      {endError ? <p className="text-xs text-red-700" data-testid="team-split-end-error">{endError}</p> : null}
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
                <Button type="button" variant="secondary" onClick={() => void handleEnd(row.id)} loading={endConfig.isPending}>
                  End config
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Modal
        variant="drawer"
        open={createOpen}
        onClose={closeCreate}
        title="Create team split config"
        confirmDiscardOnClose
        isDirty={Boolean(primaryDriverId || secondaryDriverId || memo || primaryRatio !== 0.6 || secondaryRatio !== 0.4)}
      >
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
            <Button type="button" variant="secondary" onClick={closeCreate}>
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
