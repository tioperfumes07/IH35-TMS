import { Link } from "react-router-dom";

type Props = {
  displayName: string;
  canonicalPath: string;
};

export function DriverCatalogDeprecatedBanner({ displayName, canonicalPath }: Props) {
  return (
    <div
      role="alert"
      className="rounded-sm border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-700"
    >
      This page is deprecated. Use{" "}
      <Link to={canonicalPath} className="font-semibold underline">
        {displayName}
      </Link>{" "}
      (plural path <code className="text-xs">{canonicalPath}</code>) for the current canonical view.
    </div>
  );
}
