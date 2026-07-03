import { ArrowLeft } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { colors, typography } from "../../design/tokens";

type Props = {
  backHref?: string;
  // Callback-based back for headers rendered inside a stateful panel (not on their own route), where
  // `navigate(-1)` would leave the surface instead of returning to the in-panel list. Takes precedence
  // over backHref when provided.
  onBack?: () => void;
  // Module-header breadcrumb trail (§7 module-header law: ← back + breadcrumb). Rendered above the title
  // only when provided, so existing headers are unchanged.
  breadcrumb?: string[];
  title: string;
  subtitle?: string;
  actions?: ReactNode;
};

export function PageHeader({ backHref, onBack, breadcrumb, title, subtitle, actions }: Props) {
  const navigate = useNavigate();

  return (
    <div className="mb-4">
      {breadcrumb && breadcrumb.length > 0 ? (
        <div className="mb-1 text-[10px] uppercase tracking-wide text-gray-500">
          {breadcrumb.map((item, index) => (
            <Fragment key={`${item}-${index}`}>
              <span>{item}</span>
              {index < breadcrumb.length - 1 ? <span className="mx-1.5">›</span> : null}
            </Fragment>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-end gap-2">
          <button
            type="button"
            aria-label="Back"
            className="mb-1 inline-flex items-center text-gray-600 hover:text-gray-900"
            onClick={() => {
              if (onBack) {
                onBack();
                return;
              }
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
    </div>
  );
}
