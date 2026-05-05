import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { colors, typography } from "../../design/tokens";

type Props = {
  backHref?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
};

export function PageHeader({ backHref, title, subtitle, actions }: Props) {
  return (
    <div className="mb-6 flex items-end justify-between gap-3">
      <div className="flex min-w-0 items-end gap-2">
        {backHref ? (
          <Link to={backHref} className="mb-1 inline-flex items-center text-gray-600 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        ) : null}
        <h1 style={{ fontFamily: typography.fontSerif, fontSize: typography.pageHeading, color: colors.pageHeading, fontWeight: 600 }}>{title}</h1>
        {subtitle ? <span style={{ fontSize: typography.pageSubtitle, color: colors.mutedText }}>{subtitle}</span> : null}
      </div>
      <div>{actions}</div>
    </div>
  );
}
