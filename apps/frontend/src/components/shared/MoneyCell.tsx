/**
 * MoneyCell — THE way to render a money figure in a table or a card (ROUND 433.2, owner: "find the root cause and the
 * permanent fix … so it does not occur anymore when creating those actions").
 *
 * ROOT CAUSE it closes: every page hand-wrote `<td className="text-right tabular-nums">{money(x)}</td>`, so the default
 * way to put a figure on screen was a figure you cannot click. Nothing at creation time asked "what does this number
 * open?". MoneyCell makes that question the REQUIRED `drill` prop:
 *   { entity: { kind, id } }  — the one record the figure is (a bill, a settlement, a load …)
 *   { amount: AmountFilter }  — the exact list / ledger the figure sums (register, ledger set, bills, invoices)
 *   { none: "reason" }        — a figure with no transaction behind it yet (a wizard preview, a computed ratio). The
 *                               reason is shown on hover and counted by verify-money-cells-click-through, never hidden.
 * Rendering is uniform: right-aligned tabular numerals, an em dash for a missing amount (never 0, never -$0.00).
 */
import type { ReactNode } from "react";
import { EntityLink, type EntityKind } from "./EntityLink";
import { AmountLink, type AmountFilter } from "./AmountLink";
import { formatUsdCents } from "../../lib/money";

export type MoneyDrill =
  | { entity: { kind: EntityKind; id: string | null | undefined } }
  | { amount: AmountFilter | null }
  | { none: string };

export function formatMoneyCellValue(cents: number | null | undefined, format: (c: number) => string = formatUsdCents): string {
  if (cents == null || Number.isNaN(Number(cents))) return "—";
  const c = Number(cents);
  return format(c === 0 ? 0 : c); // -0 collapses: never "-$0.00"
}

export function MoneyCell({
  cents,
  drill,
  format,
  className,
  children,
  "data-testid": testId,
}: {
  cents: number | null | undefined;
  drill: MoneyDrill;
  format?: (c: number) => string;
  className?: string;
  /** Optional suffix/prefix content rendered after the figure (e.g. a unit), never instead of it. */
  children?: ReactNode;
  "data-testid"?: string;
}) {
  const text = formatMoneyCellValue(cents, format);
  const cls = `text-right tabular-nums${className ? ` ${className}` : ""}`;
  if (cents == null) return <span className={cls} data-testid={testId}>{text}{children}</span>;
  if ("entity" in drill) {
    return (
      <span className={cls} data-testid={testId}>
        {drill.entity.id ? <EntityLink kind={drill.entity.kind} id={drill.entity.id} label={text} /> : text}
        {children}
      </span>
    );
  }
  if ("amount" in drill) {
    return (
      <span className={cls} data-testid={testId}>
        <AmountLink filter={drill.amount}>{text}</AmountLink>
        {children}
      </span>
    );
  }
  return (
    <span className={cls} data-testid={testId} data-no-drill={drill.none} title={drill.none}>
      {text}
      {children}
    </span>
  );
}
