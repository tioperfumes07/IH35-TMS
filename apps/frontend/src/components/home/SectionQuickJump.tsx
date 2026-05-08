type Props = {
  title: string;
  subtitle: string;
  count: number | null;
};

export function SectionQuickJump({ title, subtitle, count }: Props) {
  return (
    <button type="button" className="rounded border border-slate-200 bg-white px-3 py-2 text-left hover:border-slate-300 hover:bg-slate-50">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-800">{title}</span>
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${count === null ? "bg-slate-100 text-slate-500" : "bg-[#dbeafe] text-[#1e3a8a]"}`}>
          {count === null ? "—" : count}
        </span>
      </div>
      <div className="mt-1 text-xs text-slate-500">{subtitle}</div>
    </button>
  );
}
