import { useState } from "react";
import { apiRequest } from "../../api/client";
import { Modal } from "../Modal";

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
        <select className="rounded border px-2 py-1" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="truck">Truck</option>
          <option value="trailer">Trailer</option>
          <option value="chassis">Chassis</option>
        </select>
        <input className="rounded border px-2 py-1" placeholder="Equipment UUID" value={equipmentUuid} onChange={(e) => setEquipmentUuid(e.target.value)} />
        <input className="rounded border px-2 py-1" placeholder="From driver UUID" value={fromDriver} onChange={(e) => setFromDriver(e.target.value)} />
        <input className="rounded border px-2 py-1" placeholder="To driver UUID" value={toDriver} onChange={(e) => setToDriver(e.target.value)} />
        <input className="rounded border px-2 py-1" placeholder="Transfer location" value={location} onChange={(e) => setLocation(e.target.value)} />
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        <div className="mt-1 flex gap-2">
          <button type="button" className="rounded bg-[#1F2A44] px-3 py-1 text-white disabled:opacity-50" disabled={busy} onClick={submit}>
            Initiate dual-confirm transfer
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default EquipmentTransferModal;
