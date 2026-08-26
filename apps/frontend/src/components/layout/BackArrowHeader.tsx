import type { ReactNode } from "react";
import { Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { hasInAppHistory } from "../../lib/smart-back";

type BackArrowHeaderProps = {
  backTo: string;
  breadcrumb: string[];
  title: string;
  countBadge?: number;
  actions?: ReactNode;
};

export function BackArrowHeader({ backTo, breadcrumb, title, countBadge, actions }: BackArrowHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="border-b border-(--border-default) px-6 pb-2 pt-3.5">
      <div className="mb-1 text-[10px] tracking-[0.2px] text-(--text-muted)">
        {breadcrumb.map((item, index) => (
          <Fragment key={`${item}-${index}`}>
            <span>{item}</span>
            {index < breadcrumb.length - 1 ? <span className="mx-1.5">›</span> : null}
          </Fragment>
        ))}
      </div>
      <div className="flex items-center gap-2.5">
        {/*
          UI-BACK-BUTTON-IGNORES-REAL-NAVIGATION-HISTORY (third component, same defect class as
          components/layout/PageHeader.tsx and components/forms/shared/PageHeader.tsx): this was a
          plain <Link to={backTo}>, so every one of the ~35+ pages using this header (the whole
          catalog-list-page family: dispatch/driver/maintenance/fuel/fleet/accounting/reference
          catalogs) always returned to the SAME hardcoded parent regardless of where the user
          actually navigated from. Same fix as the other two headers: prefer true history-based
          back whenever real in-app navigation history exists, falling back to `backTo` only on a
          direct URL load/refresh. See lib/smart-back.ts for the verified idx>0 signal.
        */}
        <button
          type="button"
          aria-label="Back"
          onClick={() => {
            if (hasInAppHistory(window.history.state)) {
              navigate(-1);
              return;
            }
            navigate(backTo);
          }}
          className="inline-flex items-center gap-1 rounded-xs border-0 bg-transparent px-1 py-0.5 text-[11px] font-semibold text-(--text-secondary) no-underline hover:bg-(--bg-surface-alt) hover:text-(--text-primary)"
        >
          <span aria-hidden>←</span>
          <span>Back</span>
        </button>
        <h1 className="m-0 text-base font-semibold">{title}</h1>
        {countBadge !== undefined ? <span className="ml-1 text-[11px] text-(--text-secondary)">{countBadge}</span> : null}
        <div className="ml-auto flex gap-2">{actions}</div>
      </div>
    </div>
  );
}
