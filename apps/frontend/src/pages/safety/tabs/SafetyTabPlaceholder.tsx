import { Link } from "react-router-dom";

type Props = {
  title: string;
  legacyHref?: string;
};

export function SafetyTabPlaceholder({ title, legacyHref }: Props) {
  return (
    <div className="rounded border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      <p className="mt-2 text-xs text-slate-500">Existing implementation - UI shell standardized to v6.4.</p>
      {legacyHref ? (
        <Link to={legacyHref} className="mt-2 inline-block text-xs text-blue-700 underline">
          Open legacy implementation
        </Link>
      ) : null}
    </div>
  );
}
