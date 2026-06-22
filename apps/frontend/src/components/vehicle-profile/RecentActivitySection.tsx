/** @deprecated Sunset 2026-09-01 — operational loads/status feed; service events use ServiceTimeline (B31). */
import { useState } from "react";

type Activity = {
  loads: Array<Record<string, unknown>>;
  status_changes: Array<Record<string, unknown>>;
  work_orders: Array<Record<string, unknown>>;
};

const TABS = ["loads", "status", "work_orders"] as const;

export function RecentActivitySection({ activity }: { activity: Activity }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("loads");
  const [page, setPage] = useState(0);
  const pageSize = 10;

  const rows =
    tab === "loads" ? activity.loads : tab === "status" ? activity.status_changes : activity.work_orders;
  const slice = rows.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <section className="rounded border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-800">Recent activity</h2>
      <div className="mt-2 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            className={`rounded px-2 py-1 text-xs ${tab === t ? "bg-gray-800 text-white" : "bg-gray-100"}`}
            onClick={() => {
              setTab(t);
              setPage(0);
            }}
          >
            {t === "loads" ? "Loads" : t === "status" ? "Status changes" : "Work orders"}
          </button>
        ))}
      </div>
      <table className="mt-3 w-full text-left text-xs">
        <tbody>
          {slice.length === 0 ? (
            <tr>
              <td className="py-2 text-gray-500">No records.</td>
            </tr>
          ) : (
            slice.map((row, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="py-1 font-mono text-gray-800">{JSON.stringify(row).slice(0, 120)}…</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <div className="mt-2 flex gap-2">
        <button type="button" className="text-xs text-slate-700 disabled:opacity-40" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
          Prev
        </button>
        <button
          type="button"
          className="text-xs text-slate-700 disabled:opacity-40"
          disabled={(page + 1) * pageSize >= rows.length}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>
    </section>
  );
}
