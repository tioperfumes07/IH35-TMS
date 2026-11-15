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

export function Breadcrumb({ items, skipClaim = false }: Props) {
  useClaimBreadcrumb(!skipClaim);
  return (
    // V3 (every docs/design/v3 board, 42 of 42): the trail is ONE 11px #5B6576 line, "Module › List › Record",
    // every part the same muted ink (the page title below carries the emphasis). Links keep the ink and underline on hover.
    <nav aria-label="Breadcrumb" style={{ fontSize: 11, color: "#5B6576", lineHeight: "normal", fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1">
              {item.href && !isLast ? (
                <Link to={item.href} className="[color:inherit] hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span aria-current={isLast ? "page" : undefined}>{item.label}</span>
              )}
              {/* ROUND 367.9 — LAW separator is › (Module › List › Record), not /. */}
              {!isLast ? <span aria-hidden="true">›</span> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
