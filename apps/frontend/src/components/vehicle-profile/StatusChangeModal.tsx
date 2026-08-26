import { useEffect, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { Modal } from "../Modal";
import { MoneyInput } from "../forms/MoneyInput";
import { Button } from "../Button";
import { SelectCombobox } from "../shared/SelectCombobox";
import { patchUnit } from "../../api/mdata";
import { ApiError } from "../../api/client";

export type UnitLifecycleStatus =
  | "InService"
  | "OutOfService"
  | "InMaintenance"
  | "Sold"
  | "Damaged"
  | "Transferred";

const STATUS_OPTIONS: Array<{ value: UnitLifecycleStatus; label: string }> = [
  { value: "InService", label: "Active (In Service)" },
  { value: "OutOfService", label: "Out of Service" },
  { value: "InMaintenance", label: "In Maintenance" },
  { value: "Damaged", label: "Damaged" },
  { value: "Sold", label: "Sold" },
  { value: "Transferred", label: "Transferred" },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function StatusChangeModal({
  open,
  unitId,
  companyId,
  currentStatus,
  initialTarget,
  onClose,
  onSaved,
}: {
  open: boolean;
  unitId: string;
  companyId: string;
  currentStatus: string;
  initialTarget?: UnitLifecycleStatus | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [targetStatus, setTargetStatus] = useState<UnitLifecycleStatus>("OutOfService");
  const [notes, setNotes] = useState("");
  const [soldDate, setSoldDate] = useState("");
  const [soldTo, setSoldTo] = useState("");
  const [soldPrice, setSoldPrice] = useState("");
  const [transferredDate, setTransferredDate] = useState("");
  const [transferredTo, setTransferredTo] = useState<"TRK" | "TRANSP" | "USMCA">("TRK");
  const [damageDate, setDamageDate] = useState("");
  const [damageDescription, setDamageDescription] = useState("");
  const [oosDate, setOosDate] = useState("");
  const [oosReason, setOosReason] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    const fallback =
      initialTarget && STATUS_OPTIONS.some((o) => o.value === initialTarget)
        ? initialTarget
        : STATUS_OPTIONS.find((o) => o.value !== currentStatus)?.value ?? "OutOfService";
    setTargetStatus(fallback);
    setError("");
    setNotes("");
    setSoldDate("");
    setTransferredDate(todayIso());
    setDamageDate(todayIso());
    setOosDate(todayIso());
  }, [open, initialTarget, currentStatus]);

  const submit = async () => {
    setError("");
    const body: Record<string, unknown> = { status: targetStatus, status_change_reason: notes || null };
    if (targetStatus === "Sold") {
      if (!soldDate || !notes.trim()) {
        setError("Sold requires sold date and notes.");
        return;
      }
      body.sold_date = soldDate;
      body.sold_to = soldTo || null;
      body.sold_price = soldPrice ? Number(soldPrice) : null;
    }
    if (targetStatus === "Transferred") {
      if (!transferredDate || !notes.trim()) {
        setError("Transferred requires date and notes.");
        return;
      }
      body.transferred_date = transferredDate;
      body.transferred_to_entity = transferredTo;
    }
    if (targetStatus === "Damaged") {
      if (!damageDate || !damageDescription.trim()) {
        setError("Damaged requires damage date and description.");
        return;
      }
      body.damage_date = damageDate;
      body.damage_description = damageDescription;
    }
    if (targetStatus === "OutOfService") {
      if (!oosDate || !oosReason.trim()) {
        setError("OOS requires date and reason.");
        return;
      }
      body.oos_date = oosDate;
      body.oos_reason = oosReason;
    }
    setPending(true);
    try {
      await patchUnit(unitId, companyId, body);
      onSaved();
      onClose();
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.status === 409 &&
        (err.data as { error?: string } | null)?.error === "E_UNIT_HAS_OPEN_WO"
      ) {
        const n = (err.data as { open_wo_count?: number } | null)?.open_wo_count ?? 0;
        const verb = targetStatus === "Sold" ? "sell" : "transfer";
        setError(`Cannot ${verb} — ${n} open work order(s); close them first.`);
      } else {
        setError("Failed to save status.");
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal open={open} title="Change unit status" onClose={onClose}>
      <div className="space-y-2 text-sm" data-testid="vp-status-change-modal">
        <p className="text-xs text-gray-500">Current status: {currentStatus}</p>
        <div>
          <span className="block text-sm">New status *</span>
          <SelectCombobox
            id="vp-status-target"
            className="mt-1 w-full"
            value={targetStatus}
            onChange={(e) => setTargetStatus(e.target.value as UnitLifecycleStatus)}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </SelectCombobox>
        </div>
        {targetStatus === "Sold" ? (
          <>
            <div>
              <span className="block">Sold date *</span>
              <DatePicker className="mt-1 w-full" value={soldDate} onChange={(next) => setSoldDate(next)} />
            </div>
            <label className="block">
              Sold to
              <input className="mt-1 w-full rounded-sm border px-2 py-1" value={soldTo} onChange={(e) => setSoldTo(e.target.value)} />
            </label>
            <label className="block">
              Sold price
              <MoneyInput valueDollars={soldPrice ? Number(soldPrice) : null} onChangeDollars={(d) => setSoldPrice(d == null ? "" : String(d))} ariaLabel="Sold price (USD)" className="mt-1 w-full" />
            </label>
          </>
        ) : null}
        {targetStatus === "Transferred" ? (
          <>
            <div>
              <span className="block">Transferred date *</span>
              <DatePicker className="mt-1 w-full" value={transferredDate} onChange={(next) => setTransferredDate(next)} />
            </div>
            <label className="block">
              Entity *
              <select className="mt-1 w-full border px-2 py-1" value={transferredTo} onChange={(e) => setTransferredTo(e.target.value as "TRK" | "TRANSP" | "USMCA")}>
                <option value="TRK">TRK</option>
                <option value="TRANSP">TRANSP</option>
                <option value="USMCA">USMCA</option>
              </select>
            </label>
          </>
        ) : null}
        {targetStatus === "Damaged" ? (
          <>
            <div>
              <span className="block">Damage date *</span>
              <DatePicker className="mt-1 w-full" value={damageDate} onChange={(next) => setDamageDate(next)} />
            </div>
            <label className="block">
              Description *
              <textarea className="mt-1 w-full border px-2 py-1" value={damageDescription} onChange={(e) => setDamageDescription(e.target.value)} />
            </label>
          </>
        ) : null}
        {targetStatus === "OutOfService" ? (
          <>
            <div>
              <span className="block">OOS date *</span>
              <DatePicker className="mt-1 w-full" value={oosDate} onChange={(next) => setOosDate(next)} />
            </div>
            <label className="block">
              OOS reason *
              <input className="mt-1 w-full border px-2 py-1" value={oosReason} onChange={(e) => setOosReason(e.target.value)} />
            </label>
          </>
        ) : null}
        <label className="block">
          Notes {targetStatus === "Sold" || targetStatus === "Transferred" ? "*" : ""}
          <textarea className="mt-1 w-full border px-2 py-1" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        {error ? <p className="text-red-600">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" loading={pending} onClick={() => void submit()}>
            Confirm
          </Button>
        </div>
      </div>
    </Modal>
  );
}
