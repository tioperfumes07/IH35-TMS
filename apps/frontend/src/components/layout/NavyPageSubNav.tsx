import { NavLink, useLocation } from "react-router-dom";

export interface NavyPageSubNavItem {
  label: string;
  to: string;
}

interface NavyPageSubNavProps {
  items: NavyPageSubNavItem[];
  /** When provided, tabs use button-based local state instead of NavLink routing. */
  activeId?: string;
  onTabChange?: (id: string) => void;
  /** Optional id-to-label map for local-state mode (uses item.to as id if not provided). */
  itemIds?: string[];
}

function isActive(pathname: string, to: string): boolean {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(`${to}/`);
}

/** Software-wide navy sub-nav banner. Locked tokens: bg-[#1A1F36] text-white text-[11px] overflow-x-auto */
export function NavyPageSubNav({ items, activeId, onTabChange, itemIds }: NavyPageSubNavProps) {
  const { pathname } = useLocation();
  const useLocalState = activeId !== undefined && onTabChange !== undefined;
  return (
    <nav
      aria-label="Section navigation"
      className="overflow-x-auto rounded-sm bg-[#1A1F36] px-2 py-1 text-[11px] text-white"
    >
      <div className="flex min-w-max gap-4">
        {items.map((item, index) => {
          const id = itemIds?.[index] ?? item.to;
          if (useLocalState) {
            const active = activeId === id;
            return (
              <button
                key={id}
                type="button"
                className={active ? "border-b border-white pb-0.5 font-semibold" : ""}
                onClick={() => onTabChange(id)}
              >
                {item.label}
              </button>
            );
          }
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={
                isActive(pathname, item.to)
                  ? "border-b border-white pb-0.5 font-semibold"
                  : ""
              }
            >
              {item.label}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
