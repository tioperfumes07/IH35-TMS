import { Link, useLocation } from "react-router-dom";

const ADMIN_NAV_LINKS = [
  { label: "Migration Status", to: "/admin/migration-status" },
  { label: "Integrity checks", to: "/admin/integrity" },
  { label: "Error monitor", to: "/admin/error-monitor" },
  { label: "Activity log", to: "/admin/activity" },
  { label: "Audit Events", to: "/admin/audit-events" },
  { label: "Audit Log", to: "/admin/audit-log" },
  { label: "Observability", to: "/admin/observability" },
];

export function SuperAdminNav() {
  const { pathname } = useLocation();

  return (
    <nav className="flex flex-wrap gap-1 rounded border border-gray-100 bg-gray-50 px-3 py-2 text-xs">
      {ADMIN_NAV_LINKS.map((link) => {
        const active = pathname.startsWith(link.to);
        return (
          <Link
            key={link.to}
            to={link.to}
            className={`rounded px-2 py-1 font-medium transition-colors ${
              active
                ? "bg-white text-gray-900 shadow-sm ring-1 ring-gray-200"
                : "text-gray-500 hover:bg-white hover:text-gray-800"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
