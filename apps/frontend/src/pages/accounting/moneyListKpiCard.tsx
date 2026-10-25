import type { ReactNode } from "react";
import { DrillKpiCard } from "../../components/layout/DrillKpiCard";

/**
 * V3 Accounting list KPI tile (Bills / Multiple bills grammar).
 * CLS-MONEY-KPI-FAKE-ZERO: callers must pass "—" / "Error loading" when the query failed —
 * never fabricate $0.00 from an empty default.
 */
export function moneyListKpiCard(
  label: string,
  value: string,
  sublabel: string,
  tone: "neutral" | "warn" | "danger" = "neutral",
): ReactNode {
  const accent =
    tone === "danger" ? "#A32D2D" : tone === "warn" ? "#854F0B" : "#E5E7EB";
  return (
    <DrillKpiCard
      label={label}
      value={value}
      hint={sublabel}
      unavailable="Totals for the current filter (no separate drill list)"
      variant="board"
      accent={accent}
      size="sm"
    />
  );
}
