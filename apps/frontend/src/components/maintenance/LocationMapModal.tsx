import { useEffect, useMemo, useState } from "react";
import { Modal } from "../Modal";
import { POS_DICT, type PositionMeta } from "../../lib/positions";

type MapNode = { code: string; x: number; y: number };

const MAP_NODES: MapNode[] = [
  { code: "STEER-L", x: 35, y: 66 },
  { code: "STEER-R", x: 35, y: 98 },
  { code: "D1-OUT-L", x: 95, y: 58 },
  { code: "D1-IN-L", x: 110, y: 58 },
  { code: "D1-IN-R", x: 110, y: 106 },
  { code: "D1-OUT-R", x: 95, y: 106 },
  { code: "D2-OUT-L", x: 132, y: 58 },
  { code: "D2-IN-L", x: 147, y: 58 },
  { code: "D2-IN-R", x: 147, y: 106 },
  { code: "D2-OUT-R", x: 132, y: 106 },
  { code: "TT1-OUT-L", x: 274, y: 58 },
  { code: "TT1-IN-L", x: 289, y: 58 },
  { code: "TT1-IN-R", x: 289, y: 106 },
  { code: "TT1-OUT-R", x: 274, y: 106 },
  { code: "TT2-OUT-L", x: 314, y: 58 },
  { code: "TT2-IN-L", x: 329, y: 58 },
  { code: "TT2-IN-R", x: 329, y: 106 },
  { code: "TT2-OUT-R", x: 314, y: 106 },
  { code: "BC-D1-L", x: 98, y: 44 },
  { code: "BC-D1-R", x: 98, y: 120 },
  { code: "BC-D2-L", x: 135, y: 44 },
  { code: "BC-D2-R", x: 135, y: 120 },
  { code: "AB-D1-L", x: 110, y: 42 },
  { code: "AB-D1-R", x: 110, y: 122 },
  { code: "AB-D2-L", x: 147, y: 42 },
  { code: "AB-D2-R", x: 147, y: 122 },
  { code: "BC-T1-L", x: 282, y: 42 },
  { code: "BC-T1-R", x: 282, y: 122 },
  { code: "BC-T2-L", x: 322, y: 42 },
  { code: "BC-T2-R", x: 322, y: 122 },
  { code: "ENGINE", x: 54, y: 24 },
  { code: "CAB", x: 86, y: 24 },
  { code: "SLEEPER", x: 122, y: 24 },
  { code: "HOOD", x: 30, y: 24 },
  { code: "MIRROR-L", x: 76, y: 8 },
  { code: "MIRROR-R", x: 76, y: 132 },
  { code: "KINGPIN", x: 234, y: 80 },
  { code: "LANDING-GEAR", x: 254, y: 82 },
  { code: "ABS", x: 358, y: 82 },
  { code: "GLAD-HANDS", x: 218, y: 34 },
];

type Props = {
  open: boolean;
  selectedCodes: string[];
  allowedCodes?: string[];
  positionMetaByCode?: Record<string, PositionMeta>;
  onClose: () => void;
  onApply: (codes: string[]) => void;
  multiSelect?: boolean;
};

export function LocationMapModal({
  open,
  selectedCodes,
  allowedCodes,
  positionMetaByCode,
  onClose,
  onApply,
  multiSelect = true,
}: Props) {
  const effectiveMeta = positionMetaByCode ?? POS_DICT;
  const [draft, setDraft] = useState<string[]>(selectedCodes);
  const [infoCode, setInfoCode] = useState<string>(selectedCodes[0] ?? "STEER-L");

  useEffect(() => {
    if (!open) return;
    setDraft(selectedCodes);
    setInfoCode(selectedCodes[0] ?? "STEER-L");
  }, [open, selectedCodes]);

  const allowedSet = useMemo(() => new Set(allowedCodes ?? Object.keys(effectiveMeta)), [allowedCodes, effectiveMeta]);
  const fallbackInfoCode = useMemo(() => {
    const firstAllowed = [...allowedSet][0];
    return firstAllowed ?? "STEER-L";
  }, [allowedSet]);
  const info = effectiveMeta[infoCode] ?? { name: "Unknown Position", group: "Unknown Group", side: "center" as const };
  const nodes = useMemo(
    () => MAP_NODES.filter((node) => allowedSet.has(node.code) && effectiveMeta[node.code]),
    [allowedSet, effectiveMeta]
  );

  useEffect(() => {
    if (!open) return;
    if (allowedSet.size === 0) return;
    if (!allowedSet.has(infoCode)) {
      setInfoCode(fallbackInfoCode);
    }
  }, [allowedSet, fallbackInfoCode, infoCode, open]);

  const toggleCode = (code: string) => {
    setDraft((current) => {
      const exists = current.includes(code);
      if (exists) return current.filter((item) => item !== code);
      if (!multiSelect) return [code];
      return [...current, code];
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Location map">
      <div className="space-y-3 text-xs">
        <svg viewBox="0 0 380 140" className="h-[220px] w-full rounded border border-gray-200 bg-white">
          <rect x="12" y="50" width="150" height="56" rx="8" fill="#f8fafc" stroke="#94a3b8" />
          <rect x="210" y="50" width="158" height="56" rx="8" fill="#f8fafc" stroke="#94a3b8" />

          <rect
            className="axle-group"
            x="20"
            y="52"
            width="28"
            height="50"
            rx="4"
            style={{ fill: "rgba(31,42,68,0.04)", stroke: "#94a3b8", strokeDasharray: "3 3" }}
          />
          <text x="12" y="116" fontSize="8" fill="#64748b">
            Steer Axle
          </text>

          <rect
            className="axle-group"
            x="84"
            y="48"
            width="70"
            height="60"
            rx="4"
            style={{ fill: "rgba(31,42,68,0.04)", stroke: "#94a3b8", strokeDasharray: "3 3" }}
          />
          <text x="80" y="116" fontSize="8" fill="#64748b">
            Drive Tandem
          </text>

          <rect
            className="axle-group"
            x="262"
            y="48"
            width="78"
            height="60"
            rx="4"
            style={{ fill: "rgba(31,42,68,0.04)", stroke: "#94a3b8", strokeDasharray: "3 3" }}
          />
          <text x="260" y="116" fontSize="8" fill="#64748b">
            Trailer Tandem
          </text>

          {nodes.map((point) => {
            const active = draft.includes(point.code);
            return (
              <g
                key={point.code}
                data-loc={point.code}
                className="cursor-pointer"
                onMouseEnter={() => setInfoCode(point.code)}
                onClick={() => toggleCode(point.code)}
              >
                <circle cx={point.x} cy={point.y} r={6} fill={active ? "#1f2a44" : "#e5e7eb"} stroke={active ? "#1f2a44" : "#94a3b8"} />
                <text x={point.x + 8} y={point.y + 3} fontSize="7" fill="#0f172a">
                  {point.code}
                </text>
              </g>
            );
          })}
        </svg>

        <div
          className="map-info-panel rounded px-3 py-2 text-[11px] text-slate-700"
          style={{ backgroundColor: "white", border: "1px solid #d1d5db", borderLeft: "3px solid #1f2a44" }}
        >
          <div className="font-semibold text-slate-900">{infoCode}</div>
          <div>{info.name}</div>
          <div>{info.group}</div>
          <div className="capitalize">{info.side} side</div>
        </div>

        <div className="flex flex-wrap gap-1">
          {draft.map((code) => (
            <span key={code} className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
              {code}
            </span>
          ))}
          {draft.length === 0 ? <span className="text-[11px] text-slate-500">No locations selected</span> : null}
        </div>
        {nodes.length === 0 ? <div className="text-[11px] text-amber-700">No catalog positions available for this company.</div> : null}

        <div className="flex items-center justify-between">
          <button type="button" onClick={onClose} className="rounded border border-gray-300 px-2 py-1 text-xs">
            Cancel
          </button>
          <button type="button" onClick={() => onApply(draft)} className="rounded bg-[#1f2a44] px-3 py-1 text-xs font-semibold text-white">
            Apply selection ({draft.length})
          </button>
        </div>
      </div>
    </Modal>
  );
}
