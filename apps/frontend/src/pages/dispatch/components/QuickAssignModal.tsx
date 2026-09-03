import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { DriverPickerWithCreate } from "../../../components/drivers/DriverPickerWithCreate";
import { EntityPicker } from "../../../components/EntityPicker";
import type { EntityPickerOption } from "../../../components/parity/entityPickerRegistry";
import { EntityLink } from "../../../components/shared/EntityLink";
import { EntityLinkOrTombstone } from "../../../components/shared/EntityLinkOrTombstone";
import { entityLabel } from "../../../lib/entity-label";
import { listDispatchCancellationReasons } from "../../../api/dispatch";
import { ReferenceSelect } from "../../../components/parity/ReferenceSelect";
import { ListErrorState } from "../../../components/ListErrorState";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  loadId: string;
  loadNumber: string;
  currentUnitId?: string | null;
  hardWarnings: string[];
  onClose: () => void;
  onSubmit: (payload: {
    driver_id: string;
    unit_id?: string;
    trailer_id?: string;
    acknowledged_warnings: string[];
    reason_code?: string;
  }) => Promise<void>;
};

export function QuickAssignModal({ open, operatingCompanyId, loadId, loadNumber, currentUnitId, hardWarnings, onClose, onSubmit }: Props) {
  const [driverId, setDriverId] = useState("");
  const [driverOption, setDriverOption] = useState<EntityPickerOption | null>(null);
  const [unitId, setUnitId] = useState("");
  const [unitOption, setUnitOption] = useState<EntityPickerOption | null>(null);
  const [trailerId, setTrailerId] = useState("");
  const [trailerOption, setTrailerOption] = useState<EntityPickerOption | null>(null);
  const [ackAll, setAckAll] = useState(false);
  const [reasonCode, setReasonCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const scopeGenerationRef = useRef(0);

  const resetDraft = useCallback(() => {
    setDriverId("");
    setDriverOption(null);
    setUnitId("");
    setUnitOption(null);
    setTrailerId("");
    setTrailerOption(null);
    setAckAll(false);
    setReasonCode(null);
  }, []);

  useEffect(() => {
    scopeGenerationRef.current += 1;
    setLoading(false);
    if (open) resetDraft();
  }, [open, operatingCompanyId, loadId, resetDraft]);

  const handleClose = useCallback(() => {
    if (loading) return;
    resetDraft();
    onClose();
  }, [loading, onClose, resetDraft]);

  const hasSelected = Boolean(driverId || unitId || trailerId);
  const isVehicleSwap = Boolean(currentUnitId && unitId && currentUnitId !== unitId);
  const reasonsQuery = useQuery({
    queryKey: ["dispatch", "vehicle-swap-reasons", operatingCompanyId],
    queryFn: () => listDispatchCancellationReasons(operatingCompanyId).then((value) => value.reasons),
    enabled: open && isVehicleSwap && Boolean(operatingCompanyId),
  });

  return (
    <Modal open={open} onClose={handleClose} title={`Quick Assign · ${loadNumber}`}>
      <form
        className="space-y-2"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!driverId) return;
          const submittedGeneration = scopeGenerationRef.current;
          const submittedOnSubmit = onSubmit;
          const submittedPayload = {
            driver_id: driverId,
            unit_id: unitId || undefined,
            trailer_id: trailerId || undefined,
            acknowledged_warnings: ackAll ? [...hardWarnings] : [],
            reason_code: isVehicleSwap ? reasonCode ?? undefined : undefined,
          };
          setLoading(true);
          try {
            await submittedOnSubmit(submittedPayload);
            if (scopeGenerationRef.current !== submittedGeneration) return;
            handleClose();
          } finally {
            if (scopeGenerationRef.current === submittedGeneration) setLoading(false);
          }
        }}
      >
        <div className="text-xs text-slate-600" data-testid="quick-assign-load-entitylink">
          Load:{" "}
          <EntityLink kind="load" id={loadId} label={entityLabel(loadNumber, loadId, "Load")} />
        </div>
        <label className="block text-xs font-semibold text-gray-600">
          Driver <span className="text-red-500">*</span>
          <div className="mt-0.5">
            <DriverPickerWithCreate
              driverRoster="active_or_probation"
              operatingCompanyId={operatingCompanyId}
              value={driverId || null}
              onChange={(next, option) => {
                setDriverId(next ?? "");
                setDriverOption(option ?? null);
              }}
              open={open}
              placeholder="Select driver…"
              className="h-9 w-full text-sm"
              allowClear={false}
              disabled={loading}
              // Standalone Modal chrome → default shell="modal".
            />
          </div>
        </label>
        {isVehicleSwap ? (
          <div className="space-y-1" data-testid="vehicle-swap-reason">
            <label className="block text-xs font-semibold text-gray-600">Vehicle swap reason</label>
            <ReferenceSelect
              value={reasonCode}
              onChange={setReasonCode}
              options={(reasonsQuery.data ?? []).map((reason) => ({
                value: String(reason.reason_code),
                label: String(reason.reason_label ?? reason.display_name ?? reason.reason_code),
                type: String(reason.reason_code),
              }))}
              createKind="load_cancellation_reason"
              operatingCompanyId={operatingCompanyId}
              placeholder="Select reason…"
              loading={reasonsQuery.isLoading}
              disabled={loading || reasonsQuery.isLoading || reasonsQuery.isError}
            />
            {reasonsQuery.isError ? (
              <ListErrorState status={0} message="Vehicle swap reasons unavailable." onRetry={() => void reasonsQuery.refetch()} />
            ) : null}
          </div>
        ) : null}
        <label className="block text-xs font-semibold text-gray-600">
          Unit
          <div className="mt-0.5" data-testid="quick-assign-unit">
            <EntityPicker
              kind="unit"
              operatingCompanyId={operatingCompanyId}
              value={unitId || null}
              onChange={(next, option) => {
                setUnitId(next ?? "");
                setUnitOption(option ?? null);
              }}
              enabled={open}
              disabled={loading}
              placeholder="Select unit (optional)…"
              className="h-9 w-full text-sm"
            />
          </div>
        </label>
        <label className="block text-xs font-semibold text-gray-600">
          Trailer
          <div className="mt-0.5" data-testid="quick-assign-trailer">
            <EntityPicker
              kind="trailer"
              operatingCompanyId={operatingCompanyId}
              value={trailerId || null}
              onChange={(next, option) => {
                setTrailerId(next ?? "");
                setTrailerOption(option ?? null);
              }}
              enabled={open}
              disabled={loading}
              placeholder="Select trailer (optional)…"
              className="h-9 w-full text-sm"
            />
          </div>
        </label>
        {/* Exact Leaves dispatch.modal.quick_assign:driver|unit|trailer —
            pickers alone leave selected identities non-navigable; expose EntityLinks. */}
        {hasSelected ? (
          <div
            className="flex flex-wrap gap-x-3 gap-y-1 rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-700"
            data-testid="quick-assign-modal-entitylinks"
          >
            {driverId ? (
              <span>
                Driver:{" "}
                <EntityLinkOrTombstone kind="driver" id={driverId} name={driverOption?.label} noun="Driver" />
              </span>
            ) : null}
            {unitId ? (
              <span>
                Unit: <EntityLinkOrTombstone kind="unit" id={unitId} name={unitOption?.label} noun="Unit" />
              </span>
            ) : null}
            {trailerId ? (
              <span>
                Trailer:{" "}
                <EntityLinkOrTombstone kind="trailer" id={trailerId} name={trailerOption?.label} noun="Trailer" />
              </span>
            ) : null}
          </div>
        ) : null}
        {hardWarnings.length > 0 ? (
          <label className="flex items-center gap-2 text-xs text-red-700">
            <input type="checkbox" checked={ackAll} onChange={(event) => setAckAll(event.target.checked)} disabled={loading} />
            Owner override: acknowledge hard-block warnings ({hardWarnings.join(", ")})
          </label>
        ) : null}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" size="sm" variant="secondary" onClick={handleClose} disabled={loading}>
            Close
          </Button>
          <Button type="submit" size="sm" loading={loading} disabled={!driverId || (isVehicleSwap && !reasonCode)}>
            Assign
          </Button>
        </div>
      </form>
    </Modal>
  );
}
