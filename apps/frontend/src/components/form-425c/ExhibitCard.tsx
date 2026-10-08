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
        active ? "border-[#1F2A44] bg-[#F7F8FA]" : "border-[#E5E7EB] bg-[var(--surface-unselected)] hover:border-[#6B7280]"
      }`}
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">Exhibit {letter.toUpperCase()}</div>
      <div className="text-xs font-semibold text-[#0F1219]">{title}</div>
      <div className="mt-1 text-xs text-[#4B5563]">{summary}</div>
    </button>
  );
}
