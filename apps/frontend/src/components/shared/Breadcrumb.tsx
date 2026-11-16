import { Fragment } from "react";
import { Link } from "react-router-dom";
import { useClaimBreadcrumb } from "../../lib/breadcrumbOwner";

type BreadcrumbItem = {
  label: string;
  href?: string;
};

type Props = {
  items: BreadcrumbItem[];
  /** Shell StructuralBreadcrumb only: do not claim the page breadcrumb slot. */
  skipClaim?: boolean;
};

export function Breadcrumb({ items: given, skipClaim = false }: Props) {
  useClaimBreadcrumb(!skipClaim);
  // A module landing whose page title IS the module ("Accounting › Accounting") is one crumb on the board
  // (Accounting.dc.html) — a step that repeats the one before it is dropped.
  const items = given.filter((item, i) => i === 0 || item.label !== given[i - 1].label);
  return (
    // V3 (every docs/design/v3 board, 42 of 42): the trail is ONE 11px #5B6576 line, "Module › List › Record",
    // every part the same muted ink (the page title below carries the emphasis). Links keep the ink and underline on hover.
    // The trail is the board's own crumb line: text straight in one block (no list / flex boxes), like PageHeader v3's crumb
    // div — reader 11-16: the <ol>/<li> flex rows drew a 14px flex box where every board draws the 11px line itself.
    <nav aria-label="Breadcrumb" style={{ fontSize: 11, color: "#5B6576", lineHeight: "normal", fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
      {items.length === 1 ? items[0].label : items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <Fragment key={`${item.label}-${index}`}>
            {item.href && !isLast ? (
              <Link to={item.href} className="[color:inherit] hover:underline">
                {item.label}
              </Link>
            ) : (
              <span aria-current={isLast ? "page" : undefined}>{item.label}</span>
            )}
            {/* ROUND 367.9 — LAW separator is › (Module › List › Record), not /. */}
            {!isLast ? <span aria-hidden="true">{" › "}</span> : null}
          </Fragment>
        );
      })}
    </nav>
  );
}
