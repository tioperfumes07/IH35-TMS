import type { ReactNode } from "react";
import { DrillKpiCard } from "../../components/layout/DrillKpiCard";

/**
 * V3 Accounting list KPI tile (Bills / Multiple bills grammar).
 * CLS-MONEY-KPI-FAKE-ZERO: callers must pass "—" / "Error loading" when the query failed —
 * never fabricate $0.00 from an empty default.
 *
 * Codex QA 11-02: these tiles summarize the already-filtered list (no separate drill).
 * `unavailable` marks non-navigable — DrillKpiCard must still render the live value
 * (BoardKpiTile no longer blanks a supplied figure when unavailable is set).
 */
export function moneyListKpiCard(
  label: string,
  value: string,
  sublabel: string,
  tone: "neutral" | "warn" | "danger" = "neutral",
): ReactNode {
  const accent =
    tone === "danger" ? "#A32D2D" : tone === "warn" ? "#854F0B" : "#E5E7EB";
  const honestlyEmpty = value === "—" || /^error loading$/i.test(sublabel);
  const unavailable = honestlyEmpty
    ? sublabel || "Error loading"
    : "Summary of the rows currently filtered on this page";
  return (
    <DrillKpiCard
      label={label}
      value={honestlyEmpty ? null : value}
      hint={sublabel}
      unavailable={unavailable}
      variant="board"
      accent={accent}
      size="sm"
    />
  );
}
