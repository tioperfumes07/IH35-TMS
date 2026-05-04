import {
  Calculator,
  FileBarChart,
  FileText,
  Fuel,
  Home,
  Landmark,
  ListChecks,
  Package,
  ShieldAlert,
  Smartphone,
  Truck,
  Users,
  Wrench,
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
  { key: "MAINT", label: "MAINT", Icon: Wrench },
  { key: "ACCTG", label: "ACCTG", Icon: Calculator },
  { key: "BANK", label: "BANK", Icon: Landmark },
  { key: "FUEL", label: "FUEL", Icon: Fuel },
  { key: "SAFETY", label: "SAFETY", Icon: ShieldAlert },
  { key: "DRIVERS", label: "DRIVERS", Icon: Users, to: "/drivers" },
  { key: "DISPATCH", label: "DISPATCH", Icon: Truck },
  { key: "LISTS", label: "LISTS", Icon: ListChecks, to: "/users" },
  { key: "EQUIP TYPES", label: "EQUIP TYPES", Icon: Package, to: "/catalogs/equipment-types" },
  { key: "REPORTS", label: "REPORTS", Icon: FileBarChart },
  { key: "425C", label: "425C", Icon: FileText },
  { key: "DRV APP", label: "DRV APP", Icon: Smartphone },
];

export function Sidebar() {
  return (
    <aside className="w-[72px] shrink-0 bg-sidebar-bg text-white">
      <div className="flex h-full flex-col items-center gap-2 py-3">
        {ITEMS.map(({ key, label, Icon, to }) => {
          if (!to) {
            return (
              <button
                key={key}
                title="Coming in next phase"
                type="button"
                className="group relative flex w-full cursor-not-allowed flex-col items-center px-1 py-1 opacity-50"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded bg-transparent group-hover:bg-sidebar-active">
                  <Icon className="h-4 w-4" />
                </div>
                <span className="mt-1 text-[9px] leading-none">{label}</span>
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
                  {isActive ? <span className="absolute left-0 top-1 h-8 w-1 rounded-r bg-info" /> : null}
                  <div className="flex h-8 w-8 items-center justify-center rounded border border-white/40">
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="mt-1 text-[9px] leading-none">{label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </aside>
  );
}
