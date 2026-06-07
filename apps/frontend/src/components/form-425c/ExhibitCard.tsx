type ExhibitCardProps = {
  letter: string;
  title: string;
  summary: string;
  active?: boolean;
  onSelect?: () => void;
};

export function ExhibitCard({ letter, title, summary, active, onSelect }: ExhibitCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded border px-3 py-2 text-left transition ${
        active ? "border-[#1f2a44] bg-slate-50" : "border-slate-200 bg-white hover:border-slate-400"
      }`}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Exhibit {letter.toUpperCase()}</div>
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="mt-1 text-xs text-slate-600">{summary}</div>
    </button>
  );
}
