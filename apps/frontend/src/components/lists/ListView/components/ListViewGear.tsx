import { useRef, useState } from "react";
import type { Density, GearState, ListViewColumn } from "../types";

const PAGE_SIZE_OPTIONS = [50, 75, 100, 200, 300];
const DENSITY_OPTIONS: { value: Density; label: string }[] = [
  { value: "cozy", label: "Cozy" },
  { value: "compact", label: "Compact" },
];

interface Props<T> {
  columns: ListViewColumn<T>[];
  gear: GearState;
  onGearChange: (next: GearState) => void;
}

export function ListViewGear<T>({ columns, gear, onGearChange }: Props<T>) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  const set = (patch: Partial<GearState>) =>
    onGearChange({ ...gear, ...patch });

  return (
    <div className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="List settings"
        className="p-1.5 rounded border border-gray-300 hover:bg-gray-100 text-gray-600 text-sm"
      >
        ⚙
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-20"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-8 z-30 w-64 bg-white border border-gray-200 rounded-lg shadow-xl p-4 space-y-4">
            {/* Columns show/hide */}
            <section>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Columns</p>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {columns.map((col) => (
                  <label key={col.id} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={gear.visibleColumns[col.id] !== false}
                      onChange={(e) =>
                        set({
                          visibleColumns: {
                            ...gear.visibleColumns,
                            [col.id]: e.target.checked,
                          },
                        })
                      }
                      className="rounded border-gray-300"
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            </section>

            <hr className="border-gray-100" />

            {/* Page size: exactly 50/75/100/200/300 */}
            <section>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Page Size</p>
              <div className="flex flex-wrap gap-1">
                {PAGE_SIZE_OPTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => set({ pageSize: s })}
                    className={`px-2 py-1 text-xs rounded border ${gear.pageSize === s ? "bg-slate-1000 text-white border-slate-300" : "border-gray-300 hover:bg-gray-50"}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </section>

            <hr className="border-gray-100" />

            {/* Density: Cozy / Compact */}
            <section>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Density</p>
              <div className="flex rounded overflow-hidden border border-gray-300 text-xs">
                {DENSITY_OPTIONS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => set({ density: value })}
                    className={`flex-1 py-1 ${gear.density === value ? "bg-slate-1000 text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>

            <hr className="border-gray-100" />

            {/* Other: Include inactive + All/Active/Inactive segment + Show badges */}
            <section>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Other</p>
              <label className="flex items-center gap-2 text-xs text-gray-700 mb-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={gear.includeInactive}
                  onChange={(e) => set({ includeInactive: e.target.checked })}
                  className="rounded border-gray-300"
                />
                Include inactive
              </label>
              <div className="flex rounded overflow-hidden border border-gray-300 text-xs mb-2">
                {(["all", "active", "inactive"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => set({ statusFilter: v })}
                    className={`flex-1 py-1 capitalize ${gear.statusFilter === v ? "bg-slate-1000 text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`}
                  >
                    {v === "all" ? "All" : v === "active" ? "Active" : "Inactive"}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={gear.showBadges}
                  onChange={(e) => set({ showBadges: e.target.checked })}
                  className="rounded border-gray-300"
                />
                Show badges
              </label>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
