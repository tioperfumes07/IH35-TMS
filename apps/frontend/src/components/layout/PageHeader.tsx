import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { colors, typography } from "../../design/tokens";

type Props = {
  backHref?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
};

export function PageHeader({ backHref, title, subtitle, actions }: Props) {
  const navigate = useNavigate();

  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 flex-1 items-end gap-2">
        <button
          type="button"
          aria-label="Back"
          className="mb-1 inline-flex items-center text-gray-600 hover:text-gray-900"
          onClick={() => {
            if (backHref) {
              navigate(backHref);
              return;
            }
            navigate(-1);
          }}
        >
            <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 style={{ fontFamily: typography.fontSerif, fontSize: typography.pageHeading, color: colors.pageHeading, fontWeight: 600 }}>{title}</h1>
        {subtitle ? <span style={{ fontSize: typography.pageSubtitle, color: colors.mutedText }}>{subtitle}</span> : null}
      </div>
      <div className="w-full sm:w-auto">{actions}</div>
    </div>
  );
}
