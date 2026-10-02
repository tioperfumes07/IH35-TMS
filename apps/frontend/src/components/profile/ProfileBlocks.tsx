/**
 * ROUND 326 — shared blocks for the customer / vendor / driver profile surfaces. GLOBAL-TYPE-SIZE-BASELINE tokens:
 * 11px/700/UPPERCASE #4B5563 section headers (text-section-header), 12px body, #E5E7EB border, 2px radius,
 * tabular-nums on every figure. A block shows the engine's named empty reason, never a placeholder.
 */
import type { ReactNode } from "react";

export function ProfileSection(props: { title: string; testId: string; reason: string | null; children?: ReactNode }) {
  return (
    <section data-testid={props.testId} className="rounded-sm border border-[#E5E7EB] bg-white">
      <h3 className="border-b border-[#E5E7EB] px-3 py-1.5 text-center text-section-header font-bold uppercase text-[#4B5563]">{props.title}</h3>
      <div className="p-2 text-xs text-[#0F1219]">
        {props.reason ? <p data-testid={`${props.testId}-empty`} className="text-center text-[#6B7280]">{props.reason}</p> : null}
        {props.children}
      </div>
    </section>
  );
}

export function ProfileKpi(props: { label: string; value: string; tone?: "red" | "green" }) {
  const tone = props.tone === "red" ? "text-red-600" : props.tone === "green" ? "text-[#16A34A]" : "text-[#0F1219]";
  return (
    <div className="rounded-sm border border-[#E5E7EB] bg-white px-2 py-1 text-center">
      <div className="text-section-header font-bold uppercase text-[#4B5563]">{props.label}</div>
      <div className={`text-page-title font-semibold tabular-nums ${tone}`}>{props.value}</div>
    </div>
  );
}

/** Label / value rows (money right-aligned, tabular). */
export function ProfileRows(props: { rows: Array<[string, ReactNode, string?]> }) {
  return (
    <table className="w-full tabular-nums">
      <tbody>
        {props.rows.map(([label, value, cls], i) => (
          <tr key={label} className={i < props.rows.length - 1 ? "border-b border-[#E5E7EB]" : ""}>
            <td className="py-1">{label}</td>
            <td className={`py-1 text-right ${cls ?? ""}`}>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
