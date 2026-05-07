import { useState } from "react";
import { Button } from "../../../components/Button";

type Props = {
  open: boolean;
  title: string;
  entries: Array<Record<string, unknown>>;
  lineBounds: { min: number; max: number };
  initialLineNumber?: number;
  onSubmit: (lineNumber: number, explanation: string) => Promise<void>;
  onClose?: () => void;
};

export function ExhibitDrawer({ open, title, entries, lineBounds, initialLineNumber, onSubmit, onClose }: Props) {
  const [lineNumber, setLineNumber] = useState(initialLineNumber ?? lineBounds.min);
  const [explanation, setExplanation] = useState("");
  if (!open) return null;
  return (
    <section className="rounded border border-gray-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {onClose ? (
          <button type="button" className="text-xs text-gray-600 underline" onClick={onClose}>
            Close
          </button>
        ) : null}
      </div>
      <div className="grid gap-2 text-xs md:grid-cols-[120px_1fr_120px]">
        <label>
          Line Number
          <input className="mt-1 h-8 w-full rounded border border-gray-300 px-2" type="number" min={lineBounds.min} max={lineBounds.max} value={lineNumber} onChange={(e) => setLineNumber(Number(e.target.value || lineBounds.min))} />
        </label>
        <label className="md:col-span-1">
          Explanation
          <input className="mt-1 h-8 w-full rounded border border-gray-300 px-2" value={explanation} onChange={(e) => setExplanation(e.target.value)} />
        </label>
        <div className="flex items-end">
          <Button
            size="sm"
            onClick={async () => {
              if (explanation.trim().length < 3) return;
              await onSubmit(lineNumber, explanation.trim());
              setExplanation("");
            }}
          >
            + Create Entry
          </Button>
        </div>
      </div>

      <div className="mt-3 space-y-2 text-xs">
        {entries.map((entry) => (
          <div key={String(entry.id)} className="rounded border border-gray-200 px-2 py-1">
            <span className="font-semibold text-gray-700">Line {String(entry.line_number)}:</span> {String(entry.explanation ?? "")}
          </div>
        ))}
        {entries.length === 0 ? <div className="text-gray-500">No exhibit entries yet.</div> : null}
      </div>
    </section>
  );
}
