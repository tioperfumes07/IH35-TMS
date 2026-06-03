type Props = {
  label: string;
  count: number;
  loading?: boolean;
  isActive: boolean;
  onMouseEnter: () => void;
  onClick: () => void;
};

export function DomainTab({ label, count, loading = false, isActive, onMouseEnter, onClick }: Props) {
  return (
    <button
      type="button"
      onMouseEnter={onMouseEnter}
      onFocus={onMouseEnter}
      onClick={onClick}
      className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide ${
        isActive ? "border-b-2 border-[#1f2a44] text-[#1f2a44]" : "border-b-2 border-transparent text-slate-600 hover:text-slate-800"
      }`}
    >
      {label}{" "}
      <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px]">{loading ? "…" : count}</span>
    </button>
  );
}

