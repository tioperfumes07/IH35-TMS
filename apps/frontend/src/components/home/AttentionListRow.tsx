import { SeverityPill } from "./SeverityPill";

type Props = {
  severity: "CRIT" | "WARN" | "INFO";
  text: string;
  moduleLabel: string;
};

export function AttentionListRow({ severity, text, moduleLabel }: Props) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-2 text-sm">
      <div className="flex items-center gap-2">
        <SeverityPill value={severity} />
        <span className="text-slate-700">{text}</span>
      </div>
      <span className="text-xs font-semibold text-[#1f2a44]">→ {moduleLabel}</span>
    </div>
  );
}
