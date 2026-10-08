import { Link } from "react-router-dom";

type Props = {
  title: string;
  subtitle: string;
  count: number | null;
  to: string;
};

export function SectionQuickJump({ title, subtitle, count, to }: Props) {
  return (
    <Link to={to} className="block rounded-sm border border-[#E5E7EB] bg-white px-3 py-2 text-left hover:border-[#E5E7EB] hover:bg-[#F7F8FA]">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[#0F1219]">{title}</span>
        <span className={`rounded-sm px-1.5 py-0.5 text-xs font-semibold ${count === null ? "bg-[#F7F8FA] text-[#6B7280]" : "bg-[#DBEAFE] text-[#1E3A8A]"}`}>
          {count === null ? "—" : count}
        </span>
      </div>
      <div className="mt-1 text-xs text-[#6B7280]">{subtitle}</div>
    </Link>
  );
}
