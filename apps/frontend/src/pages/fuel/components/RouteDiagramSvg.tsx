import { useMemo, useState } from "react";
import type { RecommendedStop } from "../../../api/fuelPlanner";

type Props = {
  totalMiles: number;
  stops: RecommendedStop[];
  expensiveStates: string[];
};

const WIDTH = 1200;
const HEIGHT = 230;
const LEFT = 50;
const RIGHT = 50;
const LINE_Y = 90;

function toX(mile: number, totalMiles: number) {
  const clamped = Math.max(0, Math.min(totalMiles || 1, mile));
  return LEFT + (clamped / (totalMiles || 1)) * (WIDTH - LEFT - RIGHT);
}

export function RouteDiagramSvg({ totalMiles, stops, expensiveStates }: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const stopPoints = useMemo(
    () =>
      stops.map((stop, idx) => ({
        ...stop,
        pointId: stop.id || `stop-${idx}`,
        mile: Number(stop.mile_marker ?? 0),
        x: toX(Number(stop.mile_marker ?? 0), Number(totalMiles || 1)),
      })),
    [stops, totalMiles]
  );

  const avoidZones = stopPoints.filter((stop) => expensiveStates.includes(String(stop.station_state ?? stop.state ?? "").toUpperCase()));

  return (
    <div className="overflow-x-auto rounded border border-gray-200 bg-white p-2">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="min-w-[1100px] w-full">
        <line x1={LEFT} y1={LINE_Y} x2={WIDTH - RIGHT} y2={LINE_Y} stroke="#1E3A8A" strokeWidth={3} />

        {avoidZones.map((zone) => (
          <g key={`zone-${zone.pointId}`}>
            <rect x={zone.x - 35} y={LINE_Y - 30} width={70} height={60} fill="rgba(239,68,68,0.08)" stroke="#DC2626" strokeDasharray="4 4" />
            <text x={zone.x} y={LINE_Y - 36} textAnchor="middle" className="fill-red-700 text-[10px]">{String(zone.station_state ?? zone.state ?? "")}</text>
          </g>
        ))}

        {stopPoints.map((stop, idx) => {
          const strategic = Boolean(stop.is_strategic_max_fill);
          const skipped = Boolean(stop.is_skipped);
          const isOrigin = idx === 0;
          const isDestination = idx === stopPoints.length - 1;
          const radius = strategic ? 9 : isOrigin || isDestination ? 9 : 7;
          const fill = strategic ? "#D97706" : isOrigin ? "#2563EB" : isDestination ? "#7C3AED" : "#16A34A";
          return (
            <g
              key={stop.pointId}
              onMouseEnter={() => setHoveredId(stop.pointId)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <circle
                cx={stop.x}
                cy={LINE_Y}
                r={radius}
                fill={fill}
                stroke={skipped ? "#DC2626" : fill}
                strokeWidth={skipped ? 2 : 0}
                strokeDasharray={skipped ? "3 2" : undefined}
              />
              <text x={stop.x} y={LINE_Y - 14} textAnchor="middle" className={`text-[10px] ${skipped ? "line-through fill-red-700" : "fill-gray-700"}`}>
                ${Number(stop.price_per_gallon ?? 0).toFixed(2)}
              </text>
              <text x={stop.x} y={LINE_Y + 24} textAnchor="middle" className="fill-gray-700 text-[10px]">
                {String(stop.station_name ?? `Stop ${idx + 1}`).slice(0, 16)}
              </text>
              <text x={stop.x} y={LINE_Y + 36} textAnchor="middle" className="fill-gray-500 text-[9px]">
                {String(stop.station_state ?? stop.state ?? "")} · mi {Number(stop.mile_marker ?? 0).toFixed(0)} · {Number(stop.gallons_added ?? stop.gallons ?? 0).toFixed(0)} gal
              </text>
              {strategic ? (
                <text x={stop.x} y={LINE_Y - 26} textAnchor="middle" className="fill-amber-700 text-[10px]">
                  ⚡ STRATEGIC
                </text>
              ) : null}
              {String(stop.hos_note ?? "").toLowerCase().includes("30") ? (
                <line x1={stop.x} y1={LINE_Y + 44} x2={stop.x} y2={LINE_Y + 54} stroke="#1E3A8A" strokeWidth={2} />
              ) : null}
            </g>
          );
        })}
      </svg>

      {hoveredId ? (
        <div className="mt-2 rounded border border-gray-200 bg-gray-50 p-2 text-xs">
          {String(
            stopPoints.find((stop) => stop.pointId === hoveredId)?.reasoning_json?.reason ??
              stopPoints.find((stop) => stop.pointId === hoveredId)?.reasoning_json?.why_this_stop ??
              "Reasoning detail not available."
          )}
        </div>
      ) : null}
    </div>
  );
}
