import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { IftaStatus } from "../../api/reports";
import { Modal } from "../Modal";

type Props = {
  status: IftaStatus;
};

function ReadyBadge({ label }: { label: string }) {
  const palette =
    label === "awaits Q close"
      ? { bg: "#fef3c7", fg: "#92400e" }
      : label === "pending · awaits backend"
        ? { bg: "#e2e8f0", fg: "#334155" }
        : { bg: "#d1fae5", fg: "#065f46" };
  return (
    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em]" style={{ background: palette.bg, color: palette.fg }}>
      {label}
    </span>
  );
}

export function IftaPreparerCard({ status }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typedConfirm, setTypedConfirm] = useState("");
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const requiredPhrase = `FILE ${status.currentQuarter} IFTA`;
  const canSubmit = typedConfirm.trim().toUpperCase() === requiredPhrase;

  return (
    <section className="rounded border border-[#f59e0b] border-l-[3px] bg-white">
      <div className="flex items-center justify-between border-b border-[#f59e0b] bg-[#fef3c7] px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-[0.04em] text-[#92400e]">IFTA Quarterly Preparer</h3>
        <div className="text-xs text-[#92400e]">
          {status.currentQuarter} due {status.nextDueAt} ({status.daysUntilDue}d)
        </div>
      </div>

      <div className="space-y-2 px-3 py-3 text-xs">
        <div className="grid grid-cols-[24px_1fr_auto] items-center gap-2">
          <span className="font-semibold text-slate-500">1</span>
          <span className="text-slate-700">Pull state-by-state miles and gallons from closed trips</span>
          <ReadyBadge label={status.step1Ready ? "auto · ready" : "pending · awaits backend"} />
        </div>
        <div className="grid grid-cols-[24px_1fr_auto] items-center gap-2">
          <span className="font-semibold text-slate-500">2</span>
          <span className="text-slate-700">Validate fuel tax exceptions and unit-level anomalies</span>
          <ReadyBadge label={status.step2Ready ? "auto · ready" : "pending · awaits backend"} />
        </div>
        <div className="grid grid-cols-[24px_1fr_auto] items-center gap-2">
          <span className="font-semibold text-slate-500">3</span>
          <span className="text-slate-700">Review jurisdiction totals with safety + accounting</span>
          <ReadyBadge label={status.step3Ready ? "auto · ready" : "pending · awaits backend"} />
        </div>
        <div className="grid grid-cols-[24px_1fr_auto] items-center gap-2">
          <span className="font-semibold text-slate-500">4</span>
          <span className="text-slate-700">⚡ Finalize and generate IFTA-ready filing package</span>
          <ReadyBadge label={status.step4WaitsClose ? "awaits Q close" : "auto · ready"} />
        </div>
      </div>

      <div className="border-t border-slate-200 px-3 py-2">
        {status.step4WaitsClose ? (
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-1 rounded border border-[#f59e0b] px-3 py-1.5 text-xs font-semibold text-[#92400e] opacity-60"
          >
            ⚡ Generate IFTA-ready CSV
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="inline-flex items-center gap-1 rounded border border-[#f59e0b] bg-[#fef3c7] px-3 py-1.5 text-xs font-semibold text-[#92400e] hover:bg-[#fde68a]"
          >
            ⚡ Generate IFTA-ready CSV
          </button>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2 text-xs text-slate-600">
        <span>↑ Safety officer notified {status.daysUntilDue}d before due date · expense tracked + reminder</span>
        <Link to="/reports/ifta" className="font-semibold text-[#1f2a44] hover:underline">
          Open IFTA preparer →
        </Link>
      </div>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirm IFTA Filing">
        <div className="space-y-3 text-sm">
          <p>Are you sure? This finalizes the IFTA filing for {status.currentQuarter} {currentYear}. Owner-only action.</p>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Type confirmation phrase</span>
            <input
              value={typedConfirm}
              onChange={(event) => setTypedConfirm(event.target.value)}
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              placeholder={requiredPhrase}
            />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700" onClick={() => setConfirmOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              disabled={!canSubmit}
              className="rounded border border-[#f59e0b] bg-[#fef3c7] px-3 py-1.5 text-xs font-semibold text-[#92400e] disabled:opacity-50"
              onClick={() => setConfirmOpen(false)}
            >
              Submit
            </button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
