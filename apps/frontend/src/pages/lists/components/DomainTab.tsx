type Props = {
  label: string;
  count: number;
  isActive: boolean;
  onMouseEnter: () => void;
  onClick: () => void;
};

export function DomainTab({ label, count, isActive, onMouseEnter, onClick }: Props) {
  return (
    <button
      type="button"
      onMouseEnter={onMouseEnter}
      onFocus={onMouseEnter}
      onClick={onClick}
      className={`rounded-t px-3 py-2 text-xs font-semibold uppercase tracking-wide ${
        isActive ? "border-b-2 border-blue-600 bg-blue-50 text-blue-800" : "border-b-2 border-transparent bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {label} <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px]">{count}</span>
    </button>
  );
}

