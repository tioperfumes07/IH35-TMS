import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getFuelTransactions, type FuelTransactionListItem } from "../../../api/fuelPlanner";
import { listUnits } from "../../../api/mdata";
import { ClickableStat } from "../ClickableStat";
import { ModBoardShell, ModSectionHead } from "../ModBoardShell";
import { TractorTopView } from "../TractorTopView";
import { bodyStyleFromMakeModel } from "../bodyStyle";
import { formatNumber, formatUsdCents, monthToDateRange } from "../format";

type Props = { companyId: string };

type TruckAgg = {
  unitId: string | null;
  unitNumber: string;
  spendCents: number;
  gallons: number;
  fills: number;
  loads: Set<string>;
  withoutLoad: number;
  make?: string | null;
  model?: string | null;
  year?: number | null;
};

async function fetchAllFuel(companyId: string, from: string, to: string): Promise<FuelTransactionListItem[]> {
  const rows: FuelTransactionListItem[] = [];
  for (let offset = 0; offset < 5000; offset += 200) {
    const page = await getFuelTransactions(companyId, { from, to, limit: 200, offset });
    const got = page.transactions ?? [];
    rows.push(...got);
    if (got.length < 200 || !page.has_more) break;
  }
  return rows;
}

/**
 * ROUND 443.248 — Fuel by truck (LEAD-MOD-DESIGN-Fuel).
 * Aggregates live fuel.fuel_transactions MTD; each truck card + KPI clicks through.
 */
export function FuelByTruckBoard({ companyId }: Props) {
  const range = useMemo(() => monthToDateRange(), []);

  const fuelQ = useQuery({
    queryKey: ["mod-graphics", "fuel-by-truck", companyId, range.from, range.to],
    queryFn: () => fetchAllFuel(companyId, range.from, range.to),
    enabled: Boolean(companyId),
    retry: false,
  });

  const unitsQ = useQuery({
    queryKey: ["mod-graphics", "units-for-fuel", companyId],
    queryFn: () => listUnits({ operating_company_id: companyId, limit: 500 }),
    enabled: Boolean(companyId),
    retry: false,
  });

  const unitMeta = useMemo(() => {
    const map = new Map<string, { make?: string | null; model?: string | null; year?: number | null; number: string }>();
    for (const u of unitsQ.data?.units ?? []) {
      const id = (u as { id?: string }).id;
      if (!id) continue;
      map.set(id, {
        make: (u as { make?: string | null }).make,
        model: (u as { model?: string | null }).model,
        year: (u as { year?: number | null }).year,
        number: String((u as { unit_number?: string }).unit_number ?? ""),
      });
    }
    return map;
  }, [unitsQ.data]);

  const trucks = useMemo(() => {
    const by = new Map<string, TruckAgg>();
    for (const tx of fuelQ.data ?? []) {
      if (tx.voided_at) continue;
      const key = tx.unit_id ?? tx.unit_number ?? "unassigned";
      let row = by.get(key);
      if (!row) {
        const meta = tx.unit_id ? unitMeta.get(tx.unit_id) : undefined;
        row = {
          unitId: tx.unit_id,
          unitNumber: tx.unit_number ?? meta?.number ?? "Unassigned",
          spendCents: 0,
          gallons: 0,
          fills: 0,
          loads: new Set(),
          withoutLoad: 0,
          make: meta?.make,
          model: meta?.model,
          year: meta?.year,
        };
        by.set(key, row);
      }
      row.spendCents += tx.amount_cents ?? 0;
      row.gallons += Number(tx.gallons ?? 0);
      row.fills += 1;
      if (tx.load_id) row.loads.add(tx.load_id);
      else row.withoutLoad += 1;
    }
    return [...by.values()].sort((a, b) => b.spendCents - a.spendCents);
  }, [fuelQ.data, unitMeta]);

  const totals = useMemo(() => {
    let spend = 0;
    let gal = 0;
    let fills = 0;
    let without = 0;
    for (const t of trucks) {
      spend += t.spendCents;
      gal += t.gallons;
      fills += t.fills;
      without += t.withoutLoad;
    }
    const avg = gal > 0 ? spend / 100 / gal : null;
    return { spend, gal, fills, without, avg, trucks: trucks.length };
  }, [trucks]);

  const listBase = `/fuel/transactions?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;

  return (
    <ModBoardShell
      eyebrow={`Fuel · USMCA · live ${range.from} – ${range.to}`}
      title="Fuel by truck"
      subtitle="Every gallon, on a truck, on a load"
      testId="fuel-by-truck-board"
    >
      <div className="mod-board__kpi-grid">
        <ClickableStat
          label="Diesel spend"
          value={fuelQ.isError ? "—" : formatUsdCents(totals.spend)}
          hint={
            fuelQ.isError
              ? "Unable to load"
              : `${formatNumber(totals.fills)} fills · ${formatNumber(totals.trucks)} trucks`
          }
          to={listBase}
          testId="fuel-board-spend"
        />
        <ClickableStat
          label="Gallons"
          value={fuelQ.isError ? "—" : formatNumber(totals.gal, 1)}
          hint={`${range.from} – ${range.to}`}
          to={listBase}
          testId="fuel-board-gallons"
        />
        <ClickableStat
          label="Avg $/gal"
          value={fuelQ.isError || totals.avg == null ? "—" : `$${totals.avg.toFixed(3)}`}
          hint="All cards"
          to={listBase}
          testId="fuel-board-avg"
        />
        <ClickableStat
          label="Fills without a load"
          value={fuelQ.isError ? "—" : String(totals.without)}
          hint={`of ${formatNumber(totals.fills)}`}
          to={`${listBase}&unlinked=1`}
          testId="fuel-board-unlinked"
        />
      </div>

      <ModSectionHead title={`Diesel by truck — ${range.from} – ${range.to}`} viewAllTo={listBase} />
      {fuelQ.isError ? (
        <div className="mod-empty">Fuel transactions could not be loaded.</div>
      ) : fuelQ.isLoading ? (
        <div className="mod-empty">Loading fuel by truck…</div>
      ) : trucks.length === 0 ? (
        <div className="mod-empty">No fuel fills in this window yet.</div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="fuel-board-truck-grid">
          {trucks.slice(0, 12).map((t) => {
            const to = t.unitId
              ? `${listBase}&unit_id=${encodeURIComponent(t.unitId)}`
              : listBase;
            const avg = t.gallons > 0 ? t.spendCents / 100 / t.gallons : null;
            const style = bodyStyleFromMakeModel(t.make, t.model);
            return (
              <Link
                key={`${t.unitId ?? "x"}-${t.unitNumber}`}
                to={to}
                className="flex items-center gap-2 rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] px-2 py-2 no-underline hover:border-[#14213D]"
                data-mod-click-through="1"
                data-mod-click-to={to}
                data-testid="fuel-board-truck-card"
              >
                <TractorTopView bodyStyle={style} unitLabel={t.unitNumber} size={96} />
                <div className="min-w-0 flex-1">
                  <div className="font-[family-name:var(--mod-font-cond)] text-xs font-semibold text-[#14213D]">
                    {t.unitNumber}
                  </div>
                  <div className="truncate text-section-header text-[#6B7280]">
                    {[t.make, t.model, t.year].filter(Boolean).join(" · ") || "Unit"}
                  </div>
                  <div className="mt-0.5 font-mono text-xs font-semibold text-[#14213D]">
                    {formatUsdCents(t.spendCents)}
                  </div>
                  <div className="text-section-header text-[#6B7280]">
                    {formatNumber(t.gallons, 1)} gal
                    {avg != null ? ` · $${avg.toFixed(3)}/gal` : ""}
                    {` · ${t.loads.size} loads`}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </ModBoardShell>
  );
}
