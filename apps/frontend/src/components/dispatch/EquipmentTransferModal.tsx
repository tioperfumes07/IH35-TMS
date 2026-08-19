import { useState } from "react";
import { apiRequest } from "../../api/client";
import { Modal } from "../Modal";
import { EntityPicker } from "../parity/EntityPicker";
import type { EntityPickerOption } from "../parity/entityPickerRegistry";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onCreated?: (uuid: string) => void;
  onClose: () => void;
};

export function EquipmentTransferModal({ open, operatingCompanyId, onCreated, onClose }: Props) {
  const [equipmentUuid, setEquipmentUuid] = useState("");
  const [equipmentOption, setEquipmentOption] = useState<EntityPickerOption | null>(null);
  const [fromDriver, setFromDriver] = useState("");
  const [fromDriverOption, setFromDriverOption] = useState<EntityPickerOption | null>(null);
  const [toDriver, setToDriver] = useState("");
  const [toDriverOption, setToDriverOption] = useState<EntityPickerOption | null>(null);
  const [location, setLocation] = useState("");
  const [kind, setKind] = useState<"trailer" | "chassis">("trailer");
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

  const hasSelected = Boolean(equipmentUuid || fromDriver || toDriver);

  return (
    <Modal open={open} onClose={onClose} title="Initiate equipment transfer">
      <div data-testid="equipment-transfer-modal" className="grid gap-2">
        <select
          className="rounded-sm border px-2 py-1"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as typeof kind);
            setEquipmentUuid("");
            setEquipmentOption(null);
          }}
        >
          <option value="trailer">Trailer</option>
          <option value="chassis">Chassis</option>
        </select>
        <EntityPicker
          kind="trailer"
          equipmentKind={kind}
          operatingCompanyId={operatingCompanyId}
          value={equipmentUuid || null}
          onChange={(next, option) => {
            setEquipmentUuid(next ?? "");
            setEquipmentOption(option ?? null);
          }}
          enabled={open}
          placeholder={kind === "chassis" ? "Select chassis" : "Select trailer"}
        />
        <EntityPicker
          kind="driver"
          operatingCompanyId={operatingCompanyId}
          value={fromDriver || null}
          onChange={(next, option) => {
            setFromDriver(next ?? "");
            setFromDriverOption(option ?? null);
          }}
          enabled={open}
          placeholder="From driver"
        />
        <EntityPicker
          kind="driver"
          operatingCompanyId={operatingCompanyId}
          value={toDriver || null}
          onChange={(next, option) => {
            setToDriver(next ?? "");
            setToDriverOption(option ?? null);
          }}
          enabled={open}
          placeholder="To driver"
        />
        {/* Exact Leaves dispatch.modal.equipment_transfer:driver|trailer —
            pickers alone leave selected identities non-navigable; expose EntityLinks. */}
        {hasSelected ? (
          <div
            className="flex flex-wrap gap-x-3 gap-y-1 rounded-sm border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-700"
            data-testid="equipment-transfer-modal-entitylinks"
          >
            {equipmentUuid ? (
              <span>
                {kind === "chassis" ? "Chassis" : "Trailer"}:{" "}
                <EntityLinkOrTombstone kind="trailer" id={equipmentUuid} name={equipmentOption?.label} noun={kind === "chassis" ? "Chassis" : "Trailer"} />
              </span>
            ) : null}
            {fromDriver ? (
              <span>
                From:{" "}
                <EntityLinkOrTombstone kind="driver" id={fromDriver} name={fromDriverOption?.label} noun="Driver" />
              </span>
            ) : null}
            {toDriver ? (
              <span>
                To: <EntityLinkOrTombstone kind="driver" id={toDriver} name={toDriverOption?.label} noun="Driver" />
              </span>
            ) : null}
          </div>
        ) : null}
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
