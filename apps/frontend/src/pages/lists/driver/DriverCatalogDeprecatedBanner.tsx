import { Link } from "react-router-dom";

type Props = {
  displayName: string;
  canonicalPath: string;
};

export function DriverCatalogDeprecatedBanner({ displayName, canonicalPath }: Props) {
  return (
    <div
      role="alert"
      className="rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] px-3 py-2 text-xs text-[#1F2A44]"
    >
      This page is deprecated. Use{" "}
      <Link to={canonicalPath} className="font-semibold underline">
        {displayName}
      </Link>{" "}
      (plural path <code className="text-xs">{canonicalPath}</code>) for the current canonical view.
    </div>
  );
}
