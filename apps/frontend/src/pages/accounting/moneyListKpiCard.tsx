import type { ReactNode } from "react";
import { DrillKpiCard } from "../../components/layout/DrillKpiCard";

/**
 * V3 Accounting list KPI tile (Bills / Multiple bills grammar).
 * CLS-MONEY-KPI-FAKE-ZERO: callers must pass "—" / "Error loading" when the query failed —
 * never fabricate $0.00 from an empty default.
 *
 * Codex QA 11-02: never pass a standing `unavailable` string — DrillKpiCard treats any
 * unavailable prop as "suppress the value" (em dash), which blanked every Expenses/Bills KPI
 * even when real totals were supplied.
 */
export function moneyListKpiCard(
  label: string,
  value: string,
  sublabel: string,
  tone: "neutral" | "warn" | "danger" = "neutral",
): ReactNode {
  const accent =
    tone === "danger" ? "#A32D2D" : tone === "warn" ? "#854F0B" : "#E5E7EB";
  const unavailable =
    value === "—" || /^error loading$/i.test(sublabel) ? sublabel : undefined;
  return (
    <DrillKpiCard
      label={label}
      value={unavailable ? null : value}
      hint={sublabel}
      unavailable={unavailable}
      variant="board"
      accent={accent}
      size="sm"
    />
  );
}
