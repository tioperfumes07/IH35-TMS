import type { ReactNode } from "react";
import { Fragment } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { resolveBackHref } from "../../lib/returnContext";

type BackArrowHeaderProps = {
  backTo: string;
  breadcrumb: string[];
  title: string;
  countBadge?: number;
  actions?: ReactNode;
};

export function BackArrowHeader({ backTo, breadcrumb, title, countBadge, actions }: BackArrowHeaderProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  // ROUND 8.20 board21 — Home KPI drills attach ?ret=; Back must honor it (fallback stays in-module via backTo).
  const backHref = resolveBackHref({ searchParams, pathname, fallback: backTo });

  return (
    <div className="border-b border-(--border-default) px-6 pb-2 pt-3.5">
      <div className="mb-1 text-xs tracking-[0.2px] text-(--text-muted)">
        {breadcrumb.map((item, index) => (
          <Fragment key={`${item}-${index}`}>
            <span>{item}</span>
            {index < breadcrumb.length - 1 ? <span className="mx-1.5">›</span> : null}
          </Fragment>
        ))}
      </div>
      <div className="flex items-center gap-2.5">
        {/* ROUND 435-CUR — Up stays inside this module when no ret. Never navigate(-1). */}
        <button
          type="button"
          aria-label="Back"
          onClick={() => {
            navigate(backHref);
          }}
          className="inline-flex items-center gap-1 rounded-xs border-0 bg-transparent px-1 py-0.5 text-xs font-semibold text-(--text-secondary) no-underline hover:bg-(--bg-surface-alt) hover:text-(--text-primary)"
        >
          <span aria-hidden>←</span>
          <span>Back</span>
        </button>
        <h1 className="m-0 text-xs font-semibold">{title}</h1>
        {countBadge !== undefined ? <span className="ml-1 text-xs text-(--text-secondary)">{countBadge}</span> : null}
        <div className="ml-auto flex gap-2">{actions}</div>
      </div>
    </div>
  );
}
