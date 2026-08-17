import { formatAccountTypeLabel } from "./formatAccountTypeLabel";
import { humanizeEnumLabel } from "./humanizeEnumLabel";

/**
 * LV-REPORTS-CASH-FLOW-RAW-COMPOUND-LABELS — Cash Flow Statement Label column
 * exposes backend compound keys `AccountType:SubtypeOrName`. Display only:
 * humanize the type prefix via formatAccountTypeLabel and the suffix via
 * humanizeEnumLabel (already-human strings with spaces stay intact). Raw
 * `line.label` stays on the wire / sort / export.
 */
export function formatCashFlowCompoundLabel(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "—";
  const idx = raw.indexOf(":");
  if (idx < 0) {
    return formatAccountTypeLabel(raw) || humanizeEnumLabel(raw) || "—";
  }
  const prefix = raw.slice(0, idx).trim();
  const suffix = raw.slice(idx + 1).trim();
  const left = formatAccountTypeLabel(prefix) || "—";
  const right = humanizeEnumLabel(suffix) || suffix || "—";
  return `${left}: ${right}`;
}
