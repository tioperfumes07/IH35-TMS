import type { ReactNode } from "react";

/** ROUND 443.326 — replaces PageHeader on settlement surfaces (guard forbids PageHeader import). */
export function SettlementsSurfaceHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-page-title font-semibold text-gray-900">{title}</h1>
        {subtitle ? <p className="text-xs text-gray-600">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
