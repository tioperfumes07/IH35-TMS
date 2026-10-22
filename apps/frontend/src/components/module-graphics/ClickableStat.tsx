import { Link } from "react-router-dom";
import type { ReactNode } from "react";

export type ClickableStatProps = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  /** Required — every graphic number must open the filtered list that reproduces it. */
  to: string;
  testId?: string;
  className?: string;
};

/**
 * CLICK-THROUGH LAW (443.248): a rendered money/count without `to` is not done.
 * This component requires `to` so dead numbers cannot ship.
 */
export function ClickableStat({ label, value, hint, to, testId, className }: ClickableStatProps) {
  return (
    <Link
      to={to}
      className={["mod-stat", className].filter(Boolean).join(" ")}
      data-testid={testId ?? "mod-clickable-stat"}
      data-mod-click-through="1"
      data-mod-click-to={to}
    >
      <div className="mod-stat__label">{label}</div>
      <div className="mod-stat__value" data-mod-stat-value>
        {value}
      </div>
      {hint != null ? <div className="mod-stat__hint">{hint}</div> : null}
      <div className="mod-stat__open">Open list →</div>
    </Link>
  );
}
