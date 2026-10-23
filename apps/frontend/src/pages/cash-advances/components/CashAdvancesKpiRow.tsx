import { useNavigate } from "react-router-dom";
import { V3 } from "../../../design/v3-tokens";
import { V3KpiTile } from "../../../components/v3/V3KpiTile";
import { formatUsdTable } from "../../../lib/money";

type Props = {
  kpis?: Record<string, unknown>;
  /** ROUND 443.254 N1 — when mounted under Settlements, keep KPI drills in-module. */
  basePath?: string;
};

/**
 * C8 + ROUND 443.250 — Cash Advances KPI strip (Settlements-CashAdvances.dc.html).
 *
 * Board labels: Advances on file · Requests awaiting owner · Outstanding to recover ·
 * Recovered this period. Live getCashAdvancesKpis; Recovered = "—" (no period total on the
 * dashboard KPI feed). Absent figure still renders "—".
 */

/** Absent stays absent. */
function amount(kpis: Record<string, unknown> | undefined, key: string): number | null {
  const raw = kpis?.[key];
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

const money = (n: number | null) => (n === null ? null : formatUsdTable(n));
const display = (v: string | number | null) => (v === null || v === undefined ? "—" : String(v));

export function CashAdvancesKpiRow({ kpis, basePath = "/cash-advances" }: Props) {
  const navigate = useNavigate();
  const root = basePath.replace(/\/+$/, "") || "/cash-advances";
  const onFile = amount(kpis, "advances_on_file");
  const awaiting = amount(kpis, "pending_approval");
  const outstanding = money(amount(kpis, "total_outstanding"));

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))",
        gap: 8,
        fontFamily: V3.font,
      }}
      data-testid="cash-advances-kpi-strip"
      data-cash-advances-v3-kpis="1"
    >
      <V3KpiTile
        label="Advances on file"
        value={display(onFile === null ? null : Math.round(onFile))}
        testId="cash-advances-kpi-on-file"
        onClick={() => navigate(root)}
      />
      <V3KpiTile
        label="Requests awaiting owner"
        value={display(awaiting === null ? null : Math.round(awaiting))}
        testId="cash-advances-kpi-awaiting"
        onClick={() => navigate(`${root}?tab=pending_approval`)}
      />
      <V3KpiTile
        label="Outstanding to recover"
        value={display(outstanding)}
        testId="cash-advances-kpi-outstanding"
        onClick={() => navigate(`${root}?tab=outstanding`)}
      />
      <V3KpiTile
        label="Recovered this period"
        value="—"
        sub="no period total on KPI feed"
        testId="cash-advances-kpi-recovered"
        onClick={() => navigate(`${root}?tab=paid_off`)}
      />
    </div>
  );
}
