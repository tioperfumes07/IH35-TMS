/**
 * ROUND 326 — shared blocks for the customer / vendor / driver profile surfaces, on the owner's design tokens
 * (docs/design/ih35-design-tokens.css): section headers in the muted label ink, rules in --ih-rule, tabular-nums on
 * every figure. A block shows the engine's named empty reason, never a placeholder.
 */
import type { ReactNode } from "react";
import "../../design/ih35-design-tokens.css";

export function ProfileSection(props: { title: string; testId: string; reason: string | null; children?: ReactNode }) {
  return (
    <section data-testid={props.testId} className="rounded-sm border border-[color:var(--ih-rule)] bg-white">
      <h3 className="border-b border-[color:var(--ih-rule)] px-3 py-1.5 text-center text-section-header font-bold uppercase text-[color:var(--ih-muted)]">{props.title}</h3>
      <div className="p-2 text-xs text-[color:var(--ih-ink)]">
        {props.reason ? <p data-testid={`${props.testId}-empty`} className="text-center text-[color:var(--ih-muted)]">{props.reason}</p> : null}
        {props.children}
      </div>
    </section>
  );
}

export function ProfileKpi(props: { label: string; value: string; tone?: "red" | "green" }) {
  const tone = props.tone === "red" ? "text-red-600" : props.tone === "green" ? "text-[color:var(--ih-green)]" : "text-[color:var(--ih-ink)]";
  return (
    <div className="rounded-sm border border-[color:var(--ih-rule)] bg-white px-2 py-1 text-center">
      <div className="text-section-header font-bold uppercase text-[color:var(--ih-muted)]">{props.label}</div>
      <div className={`text-page-title font-semibold tabular-nums ${tone}`}>{props.value}</div>
    </div>
  );
}

/**
 * Label / value rows (money right-aligned, tabular). A definition list, not a table element: these are facts about one
 * record (an aging ladder, a credit position), not a list of records — a list goes through ParityTable.
 * Tuple: [label, value, value class?, row class?] — row class carries emphasis for a total line.
 */
export function ProfileRows(props: { rows: Array<[string, ReactNode, string?, string?]>; testId?: string }) {
  return (
    <dl className="m-0 w-full tabular-nums" data-testid={props.testId}>
      {props.rows.map(([label, value, cls, rowCls], i) => (
        <div
          key={label}
          className={`flex items-baseline justify-between gap-3 py-1 ${i < props.rows.length - 1 ? "border-b border-[color:var(--ih-rule)]" : ""} ${rowCls ?? ""}`}
        >
          <dt>{label}</dt>
          <dd className={`m-0 text-right ${cls ?? ""}`}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
