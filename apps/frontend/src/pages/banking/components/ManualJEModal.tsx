import { useMemo, useState } from "react";
import { createManualJe } from "../../../api/banking";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { useToast } from "../../../components/Toast";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onSaved: () => void;
};

export function ManualJEModal({ open, operatingCompanyId, onClose, onSaved }: Props) {
  const { pushToast } = useToast();
  const [date, setDate] = useState("");
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState<Array<{ account_id: string; dr_amount: number; cr_amount: number }>>([
    { account_id: "", dr_amount: 0, cr_amount: 0 },
    { account_id: "", dr_amount: 0, cr_amount: 0 },
  ]);
  const [loading, setLoading] = useState(false);

  const totalDr = useMemo(() => lines.reduce((sum, line) => sum + Number(line.dr_amount || 0), 0), [lines]);
  const totalCr = useMemo(() => lines.reduce((sum, line) => sum + Number(line.cr_amount || 0), 0), [lines]);
  const balanced = Math.abs(totalDr - totalCr) <= 0.0001 && lines.every((line) => line.account_id.trim().length > 0);

  const save = async () => {
    setLoading(true);
    try {
      await createManualJe(operatingCompanyId, { date, memo, lines });
      pushToast("Manual JE created", "success");
      onSaved();
      onClose();
    } catch (error) {
      pushToast(String((error as Error).message || "Failed"), "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Manual Journal Entry">
      <div className="space-y-2 text-xs">
        <label className="block">
          Date
          <input type="date" className="mt-1 h-8 w-full rounded border border-gray-300 px-2" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="block">
          Memo
          <input className="mt-1 h-8 w-full rounded border border-gray-300 px-2" value={memo} onChange={(e) => setMemo(e.target.value)} />
        </label>
        <div className="space-y-1">
          {lines.map((line, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_120px_120px] gap-2">
              <input
                className="h-8 rounded border border-gray-300 px-2"
                placeholder="Account ID"
                value={line.account_id}
                onChange={(e) => {
                  const next = [...lines];
                  next[idx] = { ...line, account_id: e.target.value };
                  setLines(next);
                }}
              />
              <input
                type="number"
                step="0.01"
                className="h-8 rounded border border-gray-300 px-2"
                placeholder="DR"
                value={line.dr_amount}
                onChange={(e) => {
                  const next = [...lines];
                  next[idx] = { ...line, dr_amount: Number(e.target.value) };
                  setLines(next);
                }}
              />
              <input
                type="number"
                step="0.01"
                className="h-8 rounded border border-gray-300 px-2"
                placeholder="CR"
                value={line.cr_amount}
                onChange={(e) => {
                  const next = [...lines];
                  next[idx] = { ...line, cr_amount: Number(e.target.value) };
                  setLines(next);
                }}
              />
            </div>
          ))}
        </div>
        <button type="button" className="text-blue-700 underline" onClick={() => setLines((prev) => [...prev, { account_id: "", dr_amount: 0, cr_amount: 0 }])}>
          + Create JE Line
        </button>
        <div className={balanced ? "text-green-700" : "text-red-700"}>
          DR ${totalDr.toFixed(2)} / CR ${totalCr.toFixed(2)} {balanced ? "Balanced" : "Unbalanced"}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={!balanced || !date} loading={loading} onClick={() => void save()}>
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}
