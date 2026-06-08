import { Link } from "react-router-dom";

type Props = {
  id: string;
  label: string;
  description: string;
  route: string;
  icon?: string;
};

export function ReportCard({ label, description, route, icon }: Props) {
  return (
    <Link
      to={route}
      className="block rounded border border-slate-200 bg-white px-3 py-2 text-left hover:border-[#1f2a44]"
      data-testid={`report-card-${icon ?? "report"}`}
    >
      <div className="text-xs font-semibold text-slate-900">{label}</div>
      <div className="mt-1 text-[11px] text-slate-500">{description}</div>
      <div className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-[#1f2a44]">Open →</div>
    </Link>
  );
}
