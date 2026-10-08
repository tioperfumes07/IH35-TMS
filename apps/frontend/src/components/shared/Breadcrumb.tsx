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
    <nav aria-label="Breadcrumb" className="text-xs text-[#6B7280]">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1">
              {item.href && !isLast ? (
                <Link to={item.href} className="text-[#4B5563] hover:text-[#0F1219] hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span className={isLast ? "font-semibold text-[#0F1219]" : "text-[#4B5563]"}>{item.label}</span>
              )}
              {/* ROUND 367.9 — LAW separator is › (Module › List › Record), not /. */}
              {!isLast ? <span className="text-[#6B7280]">›</span> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
