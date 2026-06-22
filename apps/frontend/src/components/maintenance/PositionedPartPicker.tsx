import { useState, useCallback } from "react";

export type MapViewType = "top" | "front" | "rear" | "side" | "battery-bank";
export type VehicleType = "truck" | "trailer" | "both";

export interface PositionSet {
  id: string;
  code: string;
  display_name: string;
  description?: string;
  part_type_hint?: string;
  vehicle_make?: string;
  vehicle_model?: string;
  map_view: MapViewType;
  positions: PositionDefinition[];
  map_svg_config?: Record<string, unknown>;
  is_active: boolean;
}

export interface PositionDefinition {
  code: string;
  name: string;
  group: string;
  side: "left" | "right" | "center";
  x: number;
  y: number;
}

interface ViewConfig {
  label: string;
  viewBox: string;
  width: number;
  height: number;
}

const VIEW_CONFIGS: Record<MapViewType, ViewConfig> = {
  top: { label: "Top View", viewBox: "0 0 100 100", width: 100, height: 100 },
  front: { label: "Front View", viewBox: "0 0 100 100", width: 100, height: 100 },
  rear: { label: "Rear View", viewBox: "0 0 100 100", width: 100, height: 100 },
  side: { label: "Side View", viewBox: "0 0 150 50", width: 150, height: 50 },
  "battery-bank": { label: "Battery Bank", viewBox: "0 0 100 100", width: 100, height: 100 },
};

interface PositionedPartPickerProps {
  positionSet: PositionSet;
  selectedPositions: string[];
  onChange: (positions: string[]) => void;
  disabled?: boolean;
}

export function PositionedPartPicker({
  positionSet,
  selectedPositions,
  onChange,
  disabled = false,
}: PositionedPartPickerProps) {
  const [activeView, setActiveView] = useState<MapViewType>(positionSet.map_view);

  const handlePositionToggle = useCallback(
    (positionCode: string) => {
      if (disabled) return;
      const newSelection = selectedPositions.includes(positionCode)
        ? selectedPositions.filter((p) => p !== positionCode)
        : [...selectedPositions, positionCode];
      onChange(newSelection);
    },
    [selectedPositions, onChange, disabled]
  );

  const currentView = VIEW_CONFIGS[activeView];
  const viewPositions = positionSet.positions || [];

  return (
    <div className="positioned-part-picker space-y-4">
      {/* View selector tabs */}
      <div className="flex gap-2 flex-wrap">
        {(Object.keys(VIEW_CONFIGS) as MapViewType[]).map((view) => (
          <button
            key={view}
            onClick={() => setActiveView(view)}
            disabled={disabled}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${
              activeView === view
                ? "bg-slate-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {VIEW_CONFIGS[view].label}
          </button>
        ))}
      </div>

      {/* SVG Map */}
      <div className="relative border rounded-lg bg-gray-50 overflow-hidden">
        <svg
          viewBox={currentView.viewBox}
          className="w-full h-auto max-h-96"
          style={{ aspectRatio: `${currentView.width} / ${currentView.height}` }}
        >
          {/* Vehicle outline placeholder */}
          <rect
            x="5"
            y="5"
            width="90"
            height="90"
            fill="none"
            stroke="#9CA3AF"
            strokeWidth="2"
            rx="4"
          />

          {/* Position markers */}
          {viewPositions.map((pos) => {
            const isSelected = selectedPositions.includes(pos.code);
            return (
              <g
                key={pos.code}
                transform={`translate(${pos.x}, ${pos.y})`}
                className={`cursor-pointer transition-all ${
                  disabled ? "pointer-events-none" : ""
                }`}
                onClick={() => handlePositionToggle(pos.code)}
              >
                {/* Position circle */}
                <circle
                  r="6"
                  fill={isSelected ? "#1F2A44" : "#FFFFFF"}
                  stroke={isSelected ? "#0F1729" : "#6B7280"}
                  strokeWidth="2"
                  className="hover:scale-110 transition-transform"
                />
                {/* Position label */}
                <text
                  y="12"
                  textAnchor="middle"
                  fontSize="8"
                  fill="#374151"
                  className="pointer-events-none select-none"
                >
                  {pos.code}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Position info panel */}
        <div className="absolute bottom-2 right-2 bg-white/90 p-2 rounded shadow text-xs">
          <p className="font-medium">{positionSet.display_name}</p>
          {positionSet.vehicle_make && (
            <p className="text-gray-600">{positionSet.vehicle_make}</p>
          )}
        </div>
      </div>

      {/* Selected positions summary */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-gray-700">Selected Positions:</h4>
        {selectedPositions.length === 0 ? (
          <p className="text-sm text-gray-500">No positions selected</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {selectedPositions.map((code) => {
              const pos = positionSet.positions?.find((p) => p.code === code);
              return (
                <span
                  key={code}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-800 text-sm rounded-md"
                >
                  {code}
                  {pos && <span className="text-slate-600">- {pos.name}</span>}
                  {!disabled && (
                    <button
                      onClick={() => handlePositionToggle(code)}
                      className="ml-1 text-slate-600 hover:text-slate-800"
                    >
                      ×
                    </button>
                  )}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Position details table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[500px]">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Code</th>
              <th className="px-3 py-2 text-left font-medium">Name</th>
              <th className="px-3 py-2 text-left font-medium">Group</th>
              <th className="px-3 py-2 text-left font-medium">Side</th>
            </tr>
          </thead>
          <tbody>
            {viewPositions.map((pos) => (
              <tr
                key={pos.code}
                className={`border-t cursor-pointer transition-colors ${
                  selectedPositions.includes(pos.code)
                    ? "bg-slate-50"
                    : "hover:bg-gray-50"
                }`}
                onClick={() => handlePositionToggle(pos.code)}
              >
                <td className="px-3 py-2 font-medium">{pos.code}</td>
                <td className="px-3 py-2">{pos.name}</td>
                <td className="px-3 py-2 text-gray-600">{pos.group}</td>
                <td className="px-3 py-2 text-gray-600">{pos.side}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

export default PositionedPartPicker;
