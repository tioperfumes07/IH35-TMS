import type { ReactNode } from "react";
import "./tokens.css";

export type ModBoardShellProps = {
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  testId?: string;
  className?: string;
};

/** Shared chrome for every owner-approved module graphic board. */
export function ModBoardShell({ eyebrow, title, subtitle, children, testId, className }: ModBoardShellProps) {
  return (
    <section
      className={["mod-board p-3 space-y-2", className].filter(Boolean).join(" ")}
      data-testid={testId ?? "mod-board"}
      data-mod-board="1"
    >
      <div>
        <div className="mod-board__eyebrow">{eyebrow}</div>
        <h2 className="mod-board__title">{title}</h2>
        {subtitle ? <p className="mod-board__sub mt-0.5">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function ModSectionHead({
  title,
  viewAllTo,
  viewAllLabel = "View all ›",
}: {
  title: string;
  viewAllTo: string;
  viewAllLabel?: string;
}) {
  return (
    <div className="mod-section-head">
      <div className="mod-section-head__title">{title}</div>
      <a className="mod-view-all" href={viewAllTo} data-mod-click-through="1" data-mod-click-to={viewAllTo}>
        {viewAllLabel}
      </a>
    </div>
  );
}
