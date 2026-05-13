import { ArrowLeft } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { Link } from "react-router-dom";
import "./PageHeader.css";

export type BreadcrumbItem = { label: string; href?: string };

export type PageHeaderProps = {
  title: string;
  backHref?: string;
  breadcrumb?: BreadcrumbItem[];
  subtitle?: string;
  actions?: ReactNode;
};

/**
 * Drill-in page header (invariant #21): optional back control, breadcrumb row, single-line H1.
 * Not wired to routes in Phase 6 primitive block — import from this path explicitly
 * (`components/forms/shared/PageHeader`), not `components/layout/PageHeader`.
 */
export function PageHeader({ title, backHref, breadcrumb, subtitle, actions }: PageHeaderProps) {
  const showBreadcrumb = breadcrumb != null && breadcrumb.length > 1;

  return (
    <header className="page-header">
      {showBreadcrumb ? (
        <nav className="page-header-breadcrumb" aria-label="Breadcrumb" data-testid="page-header-breadcrumb">
          {breadcrumb!.map((item, i) => (
            <Fragment key={`${item.label}-${i}`}>
              {item.href ? (
                <Link to={item.href}>{item.label}</Link>
              ) : (
                <span>{item.label}</span>
              )}
              {i < breadcrumb!.length - 1 ? <span className="breadcrumb-separator"> · </span> : null}
            </Fragment>
          ))}
        </nav>
      ) : null}
      <div className="page-header-row">
        <div className="page-header-title-group">
          {backHref ? (
            <Link to={backHref} className="page-header-back" aria-label="Back" data-testid="page-header-back">
              <ArrowLeft size={18} aria-hidden />
            </Link>
          ) : null}
          <h1 className="page-header-title">{title}</h1>
          {subtitle ? <span className="page-header-subtitle">{subtitle}</span> : null}
        </div>
        {actions ? <div className="page-header-actions">{actions}</div> : null}
      </div>
    </header>
  );
}
