import { useEffect, useMemo, useState } from "react";
import { Modal } from "../Modal";

type LocationNode = { code: string; label: string; x: number; y: number };

const TRACTOR_POINTS: LocationNode[] = [
  { code: "STEER-L", label: "Steer L", x: 20, y: 55 },
  { code: "STEER-R", label: "Steer R", x: 20, y: 85 },
  { code: "D1L", label: "D1L", x: 90, y: 55 },
  { code: "D1R", label: "D1R", x: 90, y: 85 },
  { code: "D2L", label: "D2L", x: 120, y: 55 },
  { code: "D2R", label: "D2R", x: 120, y: 85 },
  { code: "ENGINE", label: "Engine", x: 35, y: 20 },
  { code: "CAB", label: "Cab", x: 75, y: 20 },
  { code: "SLEEPER", label: "Sleeper", x: 115, y: 20 },
];

const TRAILER_POINTS: LocationNode[] = [
  { code: "T1L", label: "T1L", x: 230, y: 55 },
  { code: "T1R", label: "T1R", x: 230, y: 85 },
  { code: "T2L", label: "T2L", x: 260, y: 55 },
  { code: "T2R", label: "T2R", x: 260, y: 85 },
  { code: "T3L", label: "T3L", x: 290, y: 55 },
  { code: "T3R", label: "T3R", x: 290, y: 85 },
  { code: "T4L", label: "T4L", x: 320, y: 55 },
  { code: "T4R", label: "T4R", x: 320, y: 85 },
  { code: "REEFER-UNIT", label: "Reefer", x: 220, y: 20 },
  { code: "REAR-DOORS", label: "Rear Doors", x: 330, y: 20 },
];

type Props = {
  open: boolean;
  unitUuid?: string;
  selectedCodes: string[];
  multiSelect?: boolean;
  onClose: () => void;
  onApply: (codes: string[]) => void;
};

export function PartLocationMapDialog({ open, selectedCodes, multiSelect = true, onClose, onApply }: Props) {
  const [draft, setDraft] = useState<string[]>(selectedCodes);
  useEffect(() => {
    if (open) setDraft(selectedCodes);
  }, [open, selectedCodes]);

  const allPoints = useMemo(() => [...TRACTOR_POINTS, ...TRAILER_POINTS], []);

  const toggleCode = (code: string) => {
    setDraft((current) => {
      const exists = current.includes(code);
      if (exists) return current.filter((item) => item !== code);
      if (!multiSelect) return [code];
      return [...current, code];
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Part location map">
      <div className="space-y-3">
        <svg viewBox="0 0 360 120" className="h-[180px] w-full rounded border border-gray-200 bg-white">
          <rect x="15" y="35" width="125" height="30" rx="6" fill="#eef5ff" stroke="#93c5fd" />
          <rect x="210" y="35" width="130" height="30" rx="6" fill="#ecfdf5" stroke="#86efac" />
          {allPoints.map((point) => {
            const active = draft.includes(point.code);
            return (
              <g key={point.code} onClick={() => toggleCode(point.code)} className="cursor-pointer">
                <circle cx={point.x} cy={point.y} r={8} fill={active ? "#2563eb" : "#e5e7eb"} stroke={active ? "#1e3a8a" : "#9ca3af"} />
                <text x={point.x + 11} y={point.y + 4} fontSize="9" fill="#111827">
                  {point.label}
                </text>
              </g>
            );
          })}
        </svg>

        <div className="flex flex-wrap gap-1">
          {draft.map((code) => (
            <span key={code} className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-800">
              {code}
            </span>
          ))}
          {draft.length === 0 ? <span className="text-xs text-gray-500">No locations selected</span> : null}
        </div>

        <div className="flex items-center justify-between">
          <button type="button" onClick={onClose} className="rounded border border-gray-300 px-2 py-1 text-xs">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onApply(draft)}
            className="rounded bg-blue-700 px-3 py-1 text-xs font-semibold text-white"
          >
            Apply selection ({draft.length})
          </button>
        </div>
      </div>
    </Modal>
  );
}
