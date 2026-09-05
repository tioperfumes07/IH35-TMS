import { Link } from "react-router-dom";

export function PlannerAction({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="inline-flex h-7 items-center rounded-sm border border-gray-300 bg-white px-2 text-xs font-medium text-slate-700 hover:bg-gray-50"
    >
      {label}
    </Link>
  );
}

export function PlannerActionDisabled({ label, title }: { label: string; title: string }) {
  return (
    <button
      type="button"
      disabled
      title={title}
      className="inline-flex h-7 cursor-not-allowed items-center rounded-sm border border-gray-200 bg-gray-100 px-2 text-xs font-medium text-gray-400"
    >
      {label}
    </button>
  );
}
