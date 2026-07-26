import { useState } from "react";
import { apiRequest } from "../../api/client";
import { Modal } from "../Modal";
import { EntityPicker } from "../parity/EntityPicker";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onCreated?: (uuid: string) => void;
  onClose: () => void;
};

export function EquipmentTransferModal({ open, operatingCompanyId, onCreated, onClose }: Props) {
  const [equipmentUuid, setEquipmentUuid] = useState("");
  const [fromDriver, setFromDriver] = useState("");
  const [toDriver, setToDriver] = useState("");
  const [location, setLocation] = useState("");
  const [kind, setKind] = useState<"truck" | "trailer" | "chassis">("trailer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiRequest<{ uuid: string }>("/api/v1/dispatch/equipment-transfers/initiate", {
        method: "POST",
        body: {
          operating_company_id: operatingCompanyId,
          equipment_uuid: equipmentUuid,
          equipment_kind: kind,
          from_driver_uuid: fromDriver,
          to_driver_uuid: toDriver,
          transfer_location: location,
        },
      });
      onCreated?.(res.uuid);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to initiate transfer");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Initiate equipment transfer">
      <div data-testid="equipment-transfer-modal" className="grid gap-2">
        <select className="rounded-sm border px-2 py-1" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="truck">Truck</option>
          <option value="trailer">Trailer</option>
          <option value="chassis">Chassis</option>
        </select>
        {/* C1 PICKER LAW — the two DRIVER legs are migrated; the equipment leg is NOT, and that is a
            RULING rather than an oversight. The owner's binding clause is that a raw-uuid may only
            become a picker when the id resolves to an ENFORCED FK.
              from/to_driver_uuid -> dispatch.equipment_transfer_requests.*_driver_uuid
                                     REFERENCES mdata.drivers(id)
                                     (db/migrations/202606080204_equipment_transfer_requests.sql:9,:10)
                                     => MIGRATED
              equipment_uuid      -> dispatch.equipment_transfer_requests.equipment_uuid
                                     plain uuid, NO FK anywhere in db/migrations
                                     (202606080204_equipment_transfer_requests.sql:7)
                                     => reported, left as-is
            Second, independent reason not to wire it: the backend validates equipment_uuid against
            mdata.equipment ONLY (apps/backend/src/dispatch/equipment-transfer/request.service.ts:56-66),
            with no branch on equipment_kind — while the selector above offers "truck". A unit picker
            would read mdata.units and hand back an id this route rejects with equipment_not_found,
            i.e. the picker's read table and the write's accepted table DISAGREE. Both defects are
            reported in the PR; neither is papered over here. */}
        <input className="rounded-sm border px-2 py-1" placeholder="Equipment UUID" value={equipmentUuid} onChange={(e) => setEquipmentUuid(e.target.value)} />
        <EntityPicker
          kind="driver"
          operatingCompanyId={operatingCompanyId}
          value={fromDriver || null}
          onChange={(next) => setFromDriver(next ?? "")}
          enabled={open}
          placeholder="From driver"
        />
        <EntityPicker
          kind="driver"
          operatingCompanyId={operatingCompanyId}
          value={toDriver || null}
          onChange={(next) => setToDriver(next ?? "")}
          enabled={open}
          placeholder="To driver"
        />
        <input className="rounded-sm border px-2 py-1" placeholder="Transfer location" value={location} onChange={(e) => setLocation(e.target.value)} />
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        <div className="mt-1 flex gap-2">
          <button type="button" className="rounded-sm bg-[#1F2A44] px-3 py-1 text-white disabled:opacity-50" disabled={busy} onClick={submit}>
            Initiate dual-confirm transfer
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default EquipmentTransferModal;
