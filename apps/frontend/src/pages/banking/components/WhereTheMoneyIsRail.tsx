import { MoneyCell } from "../../../components/shared/MoneyCell";
import { ZeroCenterSparkline } from "../../../components/money/ZeroCenterSparkline";

export type MoneyRailRow = {
  id: string;
  name: string;
  kind: string;
  balance: number;
  uncategorizedCount: number;
  /** Real 30-day series when available; omit sparkline when empty. */
  sparkPoints?: number[];
  tileKind: "real" | "virtual";
};

type Props = {
  realRows: MoneyRailRow[];
  virtualRows: MoneyRailRow[];
  formatMoney: (n: number) => string;
  onView: (id: string) => void;
  onInspect: (id: string) => void;
};

function RailRow({
  row,
  formatMoney,
  onView,
  onInspect,
}: {
  row: MoneyRailRow;
  formatMoney: (n: number) => string;
  onView: (id: string) => void;
  onInspect: (id: string) => void;
}) {
  const uncat =
    row.uncategorizedCount > 0 ? String(row.uncategorizedCount) : "—";
  return (
    <div
      className="grid grid-cols-[minmax(0,1.4fr)_120px_88px_72px_auto] items-center gap-2 border-b border-[#E5E7EB] px-3 py-2 text-xs last:border-b-0"
      data-testid={`money-rail-row-${row.id}`}
      data-tile-kind={row.tileKind}
    >
      <div className="min-w-0 text-left">
        <p className="truncate font-medium text-[#0F1219]">{row.name}</p>
        <p className="truncate text-[#6B7280]">{row.kind}</p>
      </div>
      <p className="font-medium text-[#0F1219]">
        {row.tileKind === "real" ? (
          <MoneyCell cents={row.balance} format={formatMoney} drill={{ entity: { kind: "bank_account", id: row.id } }} />
        ) : (
          <MoneyCell cents={row.balance} format={formatMoney} drill={{ none: "Virtual tile balance: its own screen opens from the View button on this row" }} />
        )}
      </p>
      <div className="flex justify-center">
        {row.sparkPoints && row.sparkPoints.length >= 2 ? (
          <ZeroCenterSparkline points={row.sparkPoints} />
        ) : (
          <span className="text-[#6B7280]">—</span>
        )}
      </div>
      <p className="text-center tabular-nums text-[#6B7280]">{uncat}</p>
      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          className="inline-flex h-[34px] items-center rounded-sm border border-[#E5E7EB] px-2 text-xs font-medium text-[#1F2A44] hover:bg-[#F7F8FA]"
          onClick={() => onView(row.id)}
        >
          View
        </button>
        <button
          type="button"
          className="inline-flex h-[34px] items-center rounded-sm border border-[#E5E7EB] px-2 text-xs font-medium text-[#1F2A44] hover:bg-[#F7F8FA]"
          onClick={() => onInspect(row.id)}
        >
          Inspect
        </button>
      </div>
    </div>
  );
}

/**
 * C-64 — "Where the money is" rail: real accounts first, virtual ledgers below.
 * Name + kind left, balance, 30-day sparkline with centre zero, uncategorized, View/Inspect.
 */
export function WhereTheMoneyIsRail({ realRows, virtualRows, formatMoney, onView, onInspect }: Props) {
  return (
    <section
      className="rounded-sm border border-[#E5E7EB] bg-white"
      data-testid="where-the-money-is-rail"
      data-c64-money-rail="1"
    >
      <div className="border-b border-[#E5E7EB] px-3 py-2">
        <p className="text-xs font-bold uppercase tracking-wide text-[#4B5563]">Where the money is</p>
      </div>
      <div className="grid grid-cols-[minmax(0,1.4fr)_120px_88px_72px_auto] gap-2 border-b border-[#E5E7EB] bg-[#F7F8FA] px-3 py-1.5 text-center text-xs font-bold uppercase tracking-wide text-[#4B5563]">
        <span className="text-left">Account</span>
        <span className="text-right">Balance</span>
        <span>30-day</span>
        <span>Uncat</span>
        <span className="text-right">Actions</span>
      </div>
      {realRows.length === 0 && virtualRows.length === 0 ? (
        <p className="px-3 py-4 text-center text-xs text-[#6B7280]">No accounts yet</p>
      ) : null}
      {realRows.map((row) => (
        <RailRow key={row.id} row={row} formatMoney={formatMoney} onView={onView} onInspect={onInspect} />
      ))}
      {virtualRows.length > 0 ? (
        <div className="border-t border-[#E5E7EB] bg-[#F7F8FA] px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-[#4B5563]">
          Virtual ledgers
        </div>
      ) : null}
      {virtualRows.map((row) => (
        <RailRow key={row.id} row={row} formatMoney={formatMoney} onView={onView} onInspect={onInspect} />
      ))}
    </section>
  );
}
