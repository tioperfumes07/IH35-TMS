import { useMemo, useState } from "react";
import { Button } from "../../../../components/Button";
import { Modal } from "../../../../components/Modal";
import { MoneyInput } from "../../../../components/forms/MoneyInput";

type Props = {
  open: boolean;
  amount: number;
  onClose: () => void;
  onSave: (lines: Array<{ category: string; amount: number }>) => void;
};

export function SplitTransactionModal({ open, amount, onClose, onSave }: Props) {
  const [lines, setLines] = useState<Array<{ category: string; amount: number }>>([
    { category: "", amount: 0 },
    { category: "", amount: 0 },
  ]);
  const total = useMemo(() => lines.reduce((sum, line) => sum + Number(line.amount || 0), 0), [lines]);
  const balanced = Math.abs(total - amount) <= 0.01;

  return (
    <Modal open={open} onClose={onClose} title="Split Transaction">
      <div className="space-y-2 text-xs">
        {lines.map((line, idx) => (
          <div key={idx} className="grid grid-cols-[1fr_140px] gap-2">
            <input
              className="h-8 rounded border border-gray-300 px-2"
              placeholder="Category"
              value={line.category}
              onChange={(event) => {
                const next = [...lines];
                next[idx] = { ...line, category: event.target.value };
                setLines(next);
              }}
            />
            {/* M-1: dollars-mode QBO money entry; line amount is DOLLARS (backend compares dollars), byte-for-byte. */}
            <MoneyInput
              valueDollars={line.amount || null}
              onChangeDollars={(d) => {
                const next = [...lines];
                next[idx] = { ...line, amount: d ?? 0 };
                setLines(next);
              }}
              ariaLabel="Split amount (USD)"
              className="w-full"
            />
          </div>
        ))}
        <button
          type="button"
          className="text-slate-700 underline"
          onClick={() => setLines((prev) => [...prev, { category: "", amount: 0 }])}
        >
          + Create Split Line
        </button>
        <div className={`${balanced ? "text-green-700" : "text-red-700"}`}>
          Total: ${total.toFixed(2)} / Transaction: ${amount.toFixed(2)}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={!balanced} onClick={() => onSave(lines)}>Save Split</Button>
        </div>
      </div>
    </Modal>
  );
}
