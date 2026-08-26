/**
 * Random Pool Dashboard — GAP-81
 * Shows quarterly draw history + triggers manual draw for Safety Officers.
 * Consumes /api/safety/drug-alcohol/random-pool/* endpoints.
 * FMCSA Part 382 §382.305 — 10% drug / 10% alcohol quarterly minimums.
 */
import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { resolveApiUrl } from "../../../api/client";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { ListErrorState } from "../../../components/ListErrorState";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel } from "../../../lib/entity-label";
import { useDriverLabels } from "../../../hooks/useDriverLabels";

/** @matrix-built modules=safety,drivers cols=driver,connectivity,reverse_link */

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
  const res = await fetch(resolveApiUrl(`/api/safety/drug-alcohol/random-pool/draws?operating_company_id=${companyId}`),
    { credentials: "include" }
  );
  if (!res.ok) throw new Error(`draws_fetch_${res.status}`);
  const data = await res.json() as { draws: PoolDraw[] };
  return data.draws;
}

async function triggerDraw(companyId: string): Promise<PoolDraw> {
  const res = await fetch(resolveApiUrl("/api/safety/drug-alcohol/random-pool/draw"), {
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
  const companyGenerationRef = useRef(0);

  const drawsQ = useQuery({
    queryKey: ["safety", "da-program", "draws", companyId],
    enabled: Boolean(companyId),
    queryFn: () => fetchDrawHistory(companyId),
  });

  const drawMutation = useMutation({
    mutationFn: (input: { companyId: string; generation: number }) => triggerDraw(input.companyId),
    onSuccess: async (_result, input) => {
      if (input.generation !== companyGenerationRef.current) return;
      await queryClient.invalidateQueries({ queryKey: ["safety", "da-program", "draws", input.companyId] });
      await queryClient.invalidateQueries({ queryKey: ["safety", "da-program", "tests", input.companyId] });
    },
  });

  useEffect(() => {
    companyGenerationRef.current += 1;
    drawMutation.reset();
  }, [companyId]);

  const mostRecent = drawsQ.data?.[0] ?? null;
  const drawnDriverIds = useMemo(
    () => [...new Set((drawsQ.data ?? []).flatMap((draw) => draw.drawn_driver_uuids))],
    [drawsQ.data]
  );
  const { byId: driverNameById } = useDriverLabels(companyId, drawnDriverIds);

  const drawColumns = useMemo<ParityColumn<PoolDraw>[]>(
    () => [
      { key: "draw_date", label: "Draw Date", sortable: true },
      { key: "pool_size", label: "Pool", sortable: true },
      {
        key: "drug_drawn_count",
        label: "Drug",
        sortable: true,
        render: (draw) => (
          <>
            {draw.drug_drawn_count} <span className="text-slate-400">({drugPct(draw)})</span>
          </>
        ),
      },
      {
        key: "alcohol_drawn_count",
        label: "Alcohol",
        sortable: true,
        render: (draw) => (
          <>
            {draw.alcohol_drawn_count} <span className="text-slate-400">({alcoholPct(draw)})</span>
          </>
        ),
      },
      {
        key: "fmcsa",
        label: "FMCSA",
        render: (draw) =>
          meetsMinimums(draw) ? (
            <span className="text-slate-700">✓</span>
          ) : (
            <span className="text-red-700">✗</span>
          ),
      },
      {
        key: "drawn_driver_uuids",
        label: "Selected Drivers",
        render: (draw) => (
          <div className="flex flex-wrap gap-x-2 gap-y-1">
            {draw.drawn_driver_uuids.map((driverId) => (
              <EntityLink
                key={driverId}
                kind="driver"
                id={driverId}
                label={entityLabel(driverNameById.get(driverId), driverId, "Driver")}
              />
            ))}
            {draw.drawn_driver_uuids.length === 0 ? <span>—</span> : null}
          </div>
        ),
      },
    ],
    [driverNameById],
  );

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
          className="rounded-sm border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-40"
          onClick={() =>
            drawMutation.mutate({ companyId, generation: companyGenerationRef.current })
          }
        >
          {drawMutation.isPending ? "Running draw…" : "Run Manual Draw"}
        </button>
      </div>

      {drawMutation.isError &&
      drawMutation.variables?.generation === companyGenerationRef.current ? (
        <p className="mt-2 text-xs text-red-700">
          Draw failed: {(drawMutation.error as Error).message}
        </p>
      ) : null}

      {drawMutation.isSuccess &&
      drawMutation.variables?.generation === companyGenerationRef.current ? (
        <p className="mt-2 text-xs text-slate-700">Draw complete — test records created.</p>
      ) : null}

      {/* ── Summary tile for most recent draw ──────────────────────────── */}
      {mostRecent ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <div className="rounded-sm border border-gray-100 p-3 text-center">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Pool Size</div>
            <div className="mt-1 text-xl font-semibold text-slate-900">{mostRecent.pool_size}</div>
          </div>
          <div className="rounded-sm border border-gray-100 p-3 text-center">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Drug Selected</div>
            <div className="mt-1 text-xl font-semibold text-slate-900">
              {mostRecent.drug_drawn_count}
              <span className="ml-1 text-xs font-normal text-slate-500">{drugPct(mostRecent)}</span>
            </div>
          </div>
          <div className="rounded-sm border border-gray-100 p-3 text-center">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Alcohol Selected</div>
            <div className="mt-1 text-xl font-semibold text-slate-900">
              {mostRecent.alcohol_drawn_count}
              <span className="ml-1 text-xs font-normal text-slate-500">{alcoholPct(mostRecent)}</span>
            </div>
          </div>
          <div className="rounded-sm border border-gray-100 p-3 text-center">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">FMCSA Min.</div>
            <div className="mt-1">
              {meetsMinimums(mostRecent) ? (
                <span className="rounded-sm bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700">Met</span>
              ) : (
                <span className="rounded-sm bg-red-50 px-2 py-1 text-xs font-medium text-red-800">Below Min.</span>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Draw history table ────────────────────────────────────────────── */}
      <div className="mt-4">
        <h3 className="mb-2 text-xs font-medium text-slate-700">Draw History</h3>
        {drawsQ.isError ? (
          <ListErrorState status={0} message="Failed to load draw history." onRetry={() => void drawsQ.refetch()} />
        ) : (
          <ParityTable<PoolDraw>
            columns={drawColumns}
            rows={drawsQ.data ?? []}
            rowKey={(draw) => draw.uuid}
            loading={drawsQ.isLoading}
            emptyText="No draws recorded yet. Run a manual draw or wait for the quarterly worker."
            storageKey="safety-random-pool-draws"
            exportFilename="random-pool-draws"
          />
        )}
      </div>
    </section>
  );
}

export default RandomPoolDashboard;
