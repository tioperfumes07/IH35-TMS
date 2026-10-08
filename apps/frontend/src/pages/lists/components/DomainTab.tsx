type Props = {
  label: string;
  count?: number;
  loading?: boolean;
  unavailable?: boolean;
  isActive: boolean;
  onMouseEnter: () => void;
  onClick: () => void;
};

export function DomainTab({ label, count, loading = false, unavailable = false, isActive, onMouseEnter, onClick }: Props) {
  return (
    <button
      type="button"
      onMouseEnter={onMouseEnter}
      onFocus={onMouseEnter}
      onClick={onClick}
      className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide ${
        isActive ? "border-b-2 border-[#1F2A44] text-[#1F2A44]" : "border-b-2 border-transparent text-[#4B5563] hover:text-[#0F1219]"
      }`}
    >
      {label}{" "}
      <span className="ml-1 rounded-sm bg-[#F7F8FA] px-1.5 py-0.5 text-xs">{loading ? "…" : unavailable ? "—" : count}</span>
    </button>
  );
}
