import {
  Calculator,
  Home,
  MapPinned,
  ListChecks,
  Truck,
  Users,
} from "lucide-react";
import type { ComponentType } from "react";
import { NavLink } from "react-router-dom";

type SidebarItem = {
  key: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  to?: string;
};

const ITEMS: SidebarItem[] = [
  { key: "HOME", label: "HOME", Icon: Home, to: "/home" },
  { key: "DRIVERS", label: "DRIVERS", Icon: Users, to: "/drivers" },
  { key: "CUSTOMERS", label: "CUSTOMERS", Icon: Users, to: "/customers" },
  { key: "VENDORS", label: "VENDORS", Icon: Truck },
  { key: "LOCATIONS", label: "LOCATIONS", Icon: MapPinned },
  { key: "LISTS_CATALOGS", label: "LISTS&CAT", Icon: ListChecks, to: "/catalogs" },
  { key: "USERS", label: "USERS", Icon: Users, to: "/users" },
  { key: "SETTINGS", label: "SETTINGS", Icon: Calculator },
];

export function Sidebar() {
  return (
    <aside className="w-[72px] shrink-0 bg-sidebar-bg text-white">
      <div className="flex h-full flex-col items-center gap-1 py-2">
        {ITEMS.map(({ key, label, Icon, to }) => {
          if (!to) {
            return (
              <button
                key={key}
                title="Coming in next phase"
                type="button"
                className="group relative flex w-full cursor-not-allowed flex-col items-center px-1 py-1 opacity-50"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded bg-transparent group-hover:bg-sidebar-active">
                  <Icon className="h-4 w-4" />
                </div>
                <span className="mt-0.5 text-[8px] leading-none tracking-[0.04em]">{label}</span>
              </button>
            );
          }

          return (
            <NavLink
              key={key}
              to={to}
              className={({ isActive }) =>
                `relative flex w-full flex-col items-center px-1 py-1 hover:bg-sidebar-active ${isActive ? "bg-sidebar-active" : ""}`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive ? <span className="absolute left-0 top-1 h-7 w-1 rounded-r bg-info" /> : null}
                  <div className="flex h-7 w-7 items-center justify-center rounded border border-white/40">
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="mt-0.5 text-[8px] leading-none tracking-[0.04em]">{label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </aside>
  );
}
