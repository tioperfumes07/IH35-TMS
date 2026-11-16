import { ArrowLeft } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useClaimBreadcrumb } from "../../../lib/breadcrumbOwner";
import { resolveBackHref } from "../../../lib/returnContext";
import "./PageHeader.css";

export type BreadcrumbItem = { label: string; href?: string };

function breadcrumbLabel(item: string | BreadcrumbItem): string {
  return typeof item === "string" ? item : item.label;
}

function breadcrumbHref(item: string | BreadcrumbItem): string | undefined {
  return typeof item === "string" ? undefined : item.href;
}

export type PageHeaderProps = {
  title: string;
  backHref?: string;
  // string[] is what leaf pages pass after #15882; object form keeps optional hrefs.
  breadcrumb?: Array<string | BreadcrumbItem>;
  subtitle?: string;
  actions?: ReactNode;
  /** "v3": the header every V3 board draws (docs/design/v3/*.dc.html): module crumb 11px, then "← Back" · title 700 18px
   *  Inter · subtitle 11px on one baseline, actions 600 11px on the right. */
  variant?: "v3";
  /** v3 only: the module crumb line above the title (the board prints the module name). */
  crumb?: string;
};

const V3_INK = "#111827";
const V3_MUTED = "#5B6576";
const V3_FONT = "Inter, ui-sans-serif, system-ui, sans-serif";
/** A V3 board header action: plain 600 11px text, no box (the boards draw "+ Create Bill" as text). */
export const V3_HEADER_ACTION_STYLE = { font: `600 11px ${V3_FONT}`, color: V3_INK, background: "none", border: "none", padding: 0, cursor: "pointer", lineHeight: "normal" } as const;

/**
 * Drill-in page header (invariant #21): optional back control, breadcrumb row, single-line H1.
 * Not wired to routes in Phase 6 primitive block — import from this path explicitly
 * (`components/forms/shared/PageHeader`), not `components/layout/PageHeader`.
 */
export function PageHeader({ title, backHref, breadcrumb, subtitle, actions, variant, crumb }: PageHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const showBreadcrumb = breadcrumb != null && breadcrumb.length > 1;
  useClaimBreadcrumb(showBreadcrumb);
  const goBack = () => navigate(resolveBackHref({ searchParams, pathname: location.pathname, fallback: backHref }));

  if (variant === "v3") {
    // ROUND 9.5: no wrapping <header> box — crumb/back must be direct children of [data-v3-board]
    // so the parity reader's parent metrics match the design content shell (padding 12/20/30).
    return (
      <>
        <div data-testid="page-header-v3" style={{ fontSize: 11, color: V3_MUTED, fontFamily: V3_FONT, lineHeight: "normal" }}>{crumb ?? title}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 12, gap: 12, flexWrap: "wrap", fontFamily: V3_FONT, lineHeight: "normal", color: V3_INK }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <button type="button" aria-label="Back" data-testid="page-header-back" onClick={goBack}
              style={{ fontSize: 11, color: V3_MUTED, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: V3_FONT, lineHeight: "normal", boxSizing: "content-box" }}>← Back</button>
            <h1 style={{ margin: 0, font: `700 18px ${V3_FONT}`, color: V3_INK, lineHeight: "normal" }}>{title}</h1>
            {subtitle ? <span style={{ fontSize: 11, color: V3_MUTED, lineHeight: "normal" }}>{subtitle}</span> : null}
          </div>
          {actions ? <div style={{ display: "flex", gap: 12, alignItems: "center", font: `600 11px ${V3_FONT}` }}>{actions}</div> : null}
        </div>
      </>
    );
  }

  return (
    <header className="page-header">
      {showBreadcrumb ? (
        <nav className="page-header-breadcrumb" aria-label="Breadcrumb" data-testid="page-header-breadcrumb">
          {breadcrumb!.map((item, i) => (
            <Fragment key={`${breadcrumbLabel(item)}-${i}`}>
              {breadcrumbHref(item) ? (
                <Link to={breadcrumbHref(item)!}>{breadcrumbLabel(item)}</Link>
              ) : (
                <span>{breadcrumbLabel(item)}</span>
              )}
              {i < breadcrumb!.length - 1 ? <span className="breadcrumb-separator"> · </span> : null}
            </Fragment>
          ))}
        </nav>
      ) : null}
      <div className="page-header-row">
        <div className="page-header-title-group">
          <button
            type="button"
            className="page-header-back"
            aria-label="Back"
            data-testid="page-header-back"
            // ROUND 8.17 class R — `ret` restores origin board; else in-module structural parent.
            onClick={goBack}
          >
              <ArrowLeft size={18} aria-hidden />
              <span className="page-header-back-label">Back</span>
          </button>
          <h1 className="page-header-title">{title}</h1>
          {subtitle ? <span className="page-header-subtitle">{subtitle}</span> : null}
        </div>
        {actions ? <div className="page-header-actions">{actions}</div> : null}
      </div>
    </header>
  );
}
