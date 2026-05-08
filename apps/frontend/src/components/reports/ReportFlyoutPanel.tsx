import type { ReactNode } from "react";

type Props = {
  title: string;
  items: Array<{ id: string; label: string; hint?: string }>;
  onSelect: (id: string) => void;
  footer?: ReactNode;
};

export function ReportFlyoutPanel({ title, items, onSelect, footer }: Props) {
  return (
    <div className="min-w-[260px]">
      <div className="border-b border-slate-200 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-slate-500">{title}</div>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="block w-full border-l-[3px] border-l-transparent px-3 py-2 text-left hover:border-l-[#1f2a44] hover:bg-slate-50"
          onClick={() => onSelect(item.id)}
        >
          <div className="text-xs font-semibold text-slate-700">{item.label}</div>
          {item.hint ? <div className="text-[11px] text-slate-500">{item.hint}</div> : null}
        </button>
      ))}
      {footer ? <div className="border-t border-slate-200 px-3 py-2 text-[11px] text-slate-500">{footer}</div> : null}
    </div>
  );
}
