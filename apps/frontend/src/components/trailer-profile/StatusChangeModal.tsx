import { useEffect, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { Modal } from "../Modal";
import { MoneyInput } from "../forms/MoneyInput";
import { Button } from "../Button";
import { putTrailerStatus, type TrailerStatus } from "../../api/fleet-trailers";

const STATUS_OPTIONS: Array<{ value: TrailerStatus; label: string }> = [
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

type Props = {
  open: boolean;
  trailerId: string;
  companyId: string;
  currentStatus: string;
  onClose: () => void;
  onSaved?: () => void;
};

export function StatusChangeModal({ open, trailerId, companyId, currentStatus, onClose, onSaved }: Props) {
  const [targetStatus, setTargetStatus] = useState<TrailerStatus>("OutOfService");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(todayIso());
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
    setEffectiveDate(todayIso());
    setError("");
  }, [open]);

  const submit = async () => {
    setError("");
    if (!reason.trim()) {
      setError("Reason is required.");
      return;
    }
    const body: Parameters<typeof putTrailerStatus>[2] = {
      status: targetStatus,
      reason: reason.trim(),
      note: note.trim() || undefined,
      effective_date: effectiveDate || undefined,
    };
    if (targetStatus === "Sold") {
      if (!soldDate) {
        setError("Sold requires sold date.");
        return;
      }
      body.sold_date = soldDate;
      body.sold_to = soldTo || undefined;
      body.sold_price = soldPrice ? Number(soldPrice) : undefined;
    }
    if (targetStatus === "Transferred") {
      if (!transferredDate) {
        setError("Transferred requires transfer date.");
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
      body.damage_description = damageDescription.trim();
    }
    if (targetStatus === "OutOfService") {
      if (!oosDate || !oosReason.trim()) {
        setError("OOS requires date and reason.");
        return;
      }
      body.oos_date = oosDate;
      body.oos_reason = oosReason.trim();
    }
    setPending(true);
    try {
      await putTrailerStatus(trailerId, companyId, body);
      onSaved?.();
      onClose();
    } catch {
      setError("Failed to save status. Check transition rules and required lifecycle fields.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal open={open} title="Change trailer status" onClose={onClose}>
      <div className="space-y-2 text-sm" data-testid="tp-status-change-modal">
        <p className="text-xs text-gray-500">Current status: {currentStatus}</p>
        <label className="block">
          New status *
          <select
            className="mt-1 w-full rounded border px-2 py-1"
            value={targetStatus}
            onChange={(e) => setTargetStatus(e.target.value as TrailerStatus)}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          Reason *
          <textarea className="mt-1 w-full rounded border px-2 py-1" value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <label className="block">
          Note
          <textarea className="mt-1 w-full rounded border px-2 py-1" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <label className="block">
          Effective date
          <DatePicker
            className="mt-1 w-full rounded border px-2 py-1"
            value={effectiveDate}
            onChange={(next) => setEffectiveDate(next)}
          />
        </label>
        {targetStatus === "Sold" ? (
          <>
            <label className="block">
              Sold date *
              <DatePicker className="mt-1 w-full rounded border px-2 py-1" value={soldDate} onChange={(next) => setSoldDate(next)} />
            </label>
            <label className="block">
              Sold to
              <input className="mt-1 w-full rounded border px-2 py-1" value={soldTo} onChange={(e) => setSoldTo(e.target.value)} />
            </label>
            <label className="block">
              Sold price
              {/* M-1: dollars-mode; sold_price = numeric(12,2) DOLLARS, submit Number(soldPrice) byte-for-byte. */}
              <MoneyInput valueDollars={soldPrice ? Number(soldPrice) : null} onChangeDollars={(d) => setSoldPrice(d == null ? "" : String(d))} ariaLabel="Sold price (USD)" className="mt-1 w-full" />
            </label>
          </>
        ) : null}
        {targetStatus === "Transferred" ? (
          <>
            <label className="block">
              Transferred date *
              <DatePicker className="mt-1 w-full border px-2 py-1" value={transferredDate} onChange={(next) => setTransferredDate(next)} />
            </label>
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
            <label className="block">
              Damage date *
              <DatePicker className="mt-1 w-full border px-2 py-1" value={damageDate} onChange={(next) => setDamageDate(next)} />
            </label>
            <label className="block">
              Description *
              <textarea className="mt-1 w-full border px-2 py-1" value={damageDescription} onChange={(e) => setDamageDescription(e.target.value)} />
            </label>
          </>
        ) : null}
        {targetStatus === "OutOfService" ? (
          <>
            <label className="block">
              OOS date *
              <DatePicker className="mt-1 w-full border px-2 py-1" value={oosDate} onChange={(next) => setOosDate(next)} />
            </label>
            <label className="block">
              OOS reason *
              <input className="mt-1 w-full border px-2 py-1" value={oosReason} onChange={(e) => setOosReason(e.target.value)} />
            </label>
          </>
        ) : null}
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
