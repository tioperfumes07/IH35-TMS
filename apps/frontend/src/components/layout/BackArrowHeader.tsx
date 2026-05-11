import type { ReactNode } from "react";
import { Fragment } from "react";
import { Link } from "react-router-dom";

type BackArrowHeaderProps = {
  backTo: string;
  breadcrumb: string[];
  title: string;
  countBadge?: number;
  actions?: ReactNode;
};

export function BackArrowHeader({ backTo, breadcrumb, title, countBadge, actions }: BackArrowHeaderProps) {
  return (
    <div className="border-b border-[var(--border-default)] px-6 pb-2 pt-3.5">
      <div className="mb-1 text-[10px] tracking-[0.2px] text-[var(--text-muted)]">
        {breadcrumb.map((item, index) => (
          <Fragment key={`${item}-${index}`}>
            <span>{item}</span>
            {index < breadcrumb.length - 1 ? <span className="mx-1.5">›</span> : null}
          </Fragment>
        ))}
      </div>
      <div className="flex items-center gap-2.5">
        <Link
          to={backTo}
          aria-label="Back"
          className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-lg text-[var(--text-secondary)] no-underline hover:bg-[var(--bg-surface-alt)] hover:text-[var(--text-primary)]"
        >
          ←
        </Link>
        <h1 className="m-0 text-base font-semibold">{title}</h1>
        {countBadge !== undefined ? <span className="ml-1 text-[11px] text-[var(--text-secondary)]">{countBadge}</span> : null}
        <div className="ml-auto flex gap-2">{actions}</div>
      </div>
    </div>
  );
}
