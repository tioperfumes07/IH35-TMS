import { CalendarDays, DollarSign, Home, Truck, User } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

const ITEMS = [
  { to: "/today", key: "today", icon: Home },
  { to: "/loads", key: "loads", icon: Truck },
  { to: "/scheduler", key: "scheduler", icon: CalendarDays },
  { to: "/earnings", key: "earnings", icon: DollarSign },
  { to: "/profile", key: "profile", icon: User },
] as const;

export function BottomNav() {
  const location = useLocation();
  const { t } = useTranslation();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 border-t border-pwa-border bg-pwa-card"
      style={{ height: "calc(64px + env(safe-area-inset-bottom, 0px) + 8px)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)" }}
    >
      <div className="mx-auto grid h-16 w-full max-w-md grid-cols-5">
        {ITEMS.map((item) => {
          const active =
            item.to === "/today"
              ? location.pathname === "/today" || location.pathname === "/home"
              : item.to === "/loads"
                ? location.pathname.startsWith("/loads")
                : item.to === "/scheduler"
                  ? location.pathname.startsWith("/scheduler")
                  : location.pathname === item.to;
          const Icon = item.icon;
          return (
            <Link
              key={item.key}
              to={item.to}
              className={`flex min-h-11 flex-col items-center justify-center gap-1 border-t-2 text-[11px] font-semibold ${
                active ? "border-t-white text-white" : "border-t-transparent text-pwa-text-secondary"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{t(`nav.${item.key}`)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
