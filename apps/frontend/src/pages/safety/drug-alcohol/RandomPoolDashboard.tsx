/**
 * Random Pool Dashboard — GAP-81
 * Shows quarterly draw history + triggers manual draw for Safety Officers.
 * Consumes /api/safety/drug-alcohol/random-pool/* endpoints.
 * FMCSA Part 382 §382.305 — 10% drug / 10% alcohol quarterly minimums.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

type PoolDraw = {
  uuid: string;
  draw_date: string;
  pool_size: number;
  drug_drawn_count: number;
  alcohol_drawn_count: number;
  drawn_driver_uuids: string[];
  created_at: string;
};

type Props = {
  companyId: string;
};

// ─── API ──────────────────────────────────────────────────────────────────────

async function fetchDrawHistory(companyId: string): Promise<PoolDraw[]> {
  const res = await fetch(
    `/api/safety/drug-alcohol/random-pool/draws?operating_company_id=${companyId}`,
    { credentials: "include" }
  );
  if (!res.ok) throw new Error(`draws_fetch_${res.status}`);
  const data = await res.json() as { draws: PoolDraw[] };
  return data.draws;
}

async function triggerDraw(companyId: string): Promise<PoolDraw> {
  const res = await fetch("/api/safety/drug-alcohol/random-pool/draw", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operating_company_id: companyId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? `http_${res.status}`);
  }
  return res.json() as Promise<PoolDraw>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function drugPct(draw: PoolDraw): string {
  if (draw.pool_size === 0) return "—";
  return `${((draw.drug_drawn_count / draw.pool_size) * 100).toFixed(1)}%`;
}

function alcoholPct(draw: PoolDraw): string {
  if (draw.pool_size === 0) return "—";
  return `${((draw.alcohol_drawn_count / draw.pool_size) * 100).toFixed(1)}%`;
}

function meetsMinimums(draw: PoolDraw): boolean {
  if (draw.pool_size === 0) return true;
  const drug = (draw.drug_drawn_count / draw.pool_size) * 100;
  const alc = (draw.alcohol_drawn_count / draw.pool_size) * 100;
  return drug >= 10 && alc >= 10;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RandomPoolDashboard({ companyId }: Props) {
  const queryClient = useQueryClient();

  const drawsQ = useQuery({
    queryKey: ["safety", "da-program", "draws", companyId],
    enabled: Boolean(companyId),
    queryFn: () => fetchDrawHistory(companyId),
  });

  const drawMutation = useMutation({
    mutationFn: () => triggerDraw(companyId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["safety", "da-program", "draws", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["safety", "da-program", "tests", companyId] });
    },
  });

  const mostRecent = drawsQ.data?.[0] ?? null;

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Random Pool Draws</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">
            FMCSA §382.305 — 10% drug / 10% alcohol quarterly minimum
          </p>
        </div>
        <button
          type="button"
          disabled={drawMutation.isPending}
          className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-40"
          onClick={() => drawMutation.mutate()}
        >
          {drawMutation.isPending ? "Running draw…" : "Run Manual Draw"}
        </button>
      </div>

      {drawMutation.isError ? (
        <p className="mt-2 text-xs text-red-700">
          Draw failed: {(drawMutation.error as Error).message}
        </p>
      ) : null}

      {drawMutation.isSuccess ? (
        <p className="mt-2 text-xs text-emerald-700">Draw complete — test records created.</p>
      ) : null}

      {/* ── Summary tile for most recent draw ──────────────────────────── */}
      {mostRecent ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <div className="rounded border border-gray-100 p-3 text-center">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Pool Size</div>
            <div className="mt-1 text-xl font-semibold text-slate-900">{mostRecent.pool_size}</div>
          </div>
          <div className="rounded border border-gray-100 p-3 text-center">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Drug Selected</div>
            <div className="mt-1 text-xl font-semibold text-slate-900">
              {mostRecent.drug_drawn_count}
              <span className="ml-1 text-xs font-normal text-slate-500">{drugPct(mostRecent)}</span>
            </div>
          </div>
          <div className="rounded border border-gray-100 p-3 text-center">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Alcohol Selected</div>
            <div className="mt-1 text-xl font-semibold text-slate-900">
              {mostRecent.alcohol_drawn_count}
              <span className="ml-1 text-xs font-normal text-slate-500">{alcoholPct(mostRecent)}</span>
            </div>
          </div>
          <div className="rounded border border-gray-100 p-3 text-center">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">FMCSA Min.</div>
            <div className="mt-1">
              {meetsMinimums(mostRecent) ? (
                <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800">Met</span>
              ) : (
                <span className="rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-800">Below Min.</span>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Draw history table ────────────────────────────────────────────── */}
      <div className="mt-4">
        <h3 className="mb-2 text-xs font-medium text-slate-700">Draw History</h3>
        {drawsQ.isLoading ? (
          <p className="text-xs text-slate-500">Loading…</p>
        ) : drawsQ.isError ? (
          <p className="text-xs text-red-600">Failed to load draw history.</p>
        ) : (drawsQ.data ?? []).length === 0 ? (
          <p className="text-xs text-slate-500">No draws recorded yet. Run a manual draw or wait for the quarterly worker.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="pb-1 pr-3 font-medium">Draw Date</th>
                  <th className="pb-1 pr-3 font-medium">Pool</th>
                  <th className="pb-1 pr-3 font-medium">Drug</th>
                  <th className="pb-1 pr-3 font-medium">Alcohol</th>
                  <th className="pb-1 font-medium">FMCSA</th>
                </tr>
              </thead>
              <tbody>
                {(drawsQ.data ?? []).map((draw) => (
                  <tr key={draw.uuid} className="border-b border-gray-100">
                    <td className="py-1.5 pr-3">{draw.draw_date}</td>
                    <td className="py-1.5 pr-3">{draw.pool_size}</td>
                    <td className="py-1.5 pr-3">
                      {draw.drug_drawn_count} <span className="text-slate-400">({drugPct(draw)})</span>
                    </td>
                    <td className="py-1.5 pr-3">
                      {draw.alcohol_drawn_count} <span className="text-slate-400">({alcoholPct(draw)})</span>
                    </td>
                    <td className="py-1.5">
                      {meetsMinimums(draw) ? (
                        <span className="text-emerald-700">✓</span>
                      ) : (
                        <span className="text-red-700">✗</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

export default RandomPoolDashboard;
