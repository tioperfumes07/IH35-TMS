import { NavLink, useLocation } from "react-router-dom";

export interface NavyPageSubNavItem {
  label: string;
  to: string;
}

interface NavyPageSubNavProps {
  items: NavyPageSubNavItem[];
}

function isActive(pathname: string, to: string): boolean {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(`${to}/`);
}

/** Software-wide navy sub-nav banner. Locked tokens: bg-[#1A1F36] text-white text-[11px] overflow-x-auto */
export function NavyPageSubNav({ items }: NavyPageSubNavProps) {
  const { pathname } = useLocation();
  return (
    <nav
      aria-label="Section navigation"
      className="overflow-x-auto rounded bg-[#1A1F36] px-2 py-1 text-[11px] text-white"
    >
      <div className="flex min-w-max gap-4">
        {items.map((item) => (
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
        ))}
      </div>
    </nav>
  );
}
