/**
 * CLOSURE-13 — AdminPage hub (owner/admin access).
 * Tiles: USMCA Activation, Launch Toggles, Data Import, Carrier Bootstrap, etc.
 */
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader";
import { useAuth } from "../../auth/useAuth";
import { USMCAActivationPanel } from "./USMCAActivationPanel";

type AdminTile = { label: string; description: string; path?: string; ownerOnly?: boolean; disabled?: boolean };

const ADMIN_TILES: AdminTile[] = [
  { label: "USMCA Activation", description: "Activate USMCA carrier — 16-item launch checklist + state transitions", path: "/admin/usmca-activation", ownerOnly: true },
  { label: "Launch Toggles", description: "Flip carrier soft-launch / rollback toggles", path: "/admin/launch-toggles", ownerOnly: true },
  { label: "Data Import", description: "Bulk import CSV data", path: "/admin/data-import" },
  { label: "Carrier Bootstrap", description: "Bootstrap new carrier QBO accounts", path: "/admin/carrier-bootstrap", ownerOnly: true },
  { label: "Feature Flags", description: "Read-only rollout and override status", path: "/admin/feature-flags", ownerOnly: true },
  { label: "API Keys", description: "Unavailable — API credential management is not exposed in this release", ownerOnly: true, disabled: true },
  { label: "Webhooks", description: "Unavailable — webhook management is not exposed in this release", ownerOnly: true, disabled: true },
  { label: "Migration Status", description: "Database migration ledger", path: "/admin/migration-status" },
  { label: "Integrity Checks", description: "Run data integrity audits", path: "/admin/integrity" },
  { label: "Error Monitor", description: "Production error stream", path: "/admin/error-monitor" },
  { label: "Activity Log", description: "User activity audit trail", path: "/admin/activity" },
  { label: "Audit Log Viewer", description: "Entity-scoped audit events, severity, actor, and payload detail", path: "/admin/audit-log", ownerOnly: true },
  { label: "Profile Settings", description: "Manage your profile and open notification preferences", path: "/settings" },
  { label: "Notification Preferences", description: "Choose which configured events notify you", path: "/settings/notifications" },
  { label: "Notification Center", description: "Review your delivered and unread notifications", path: "/notifications" },
];

export function AdminPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const role = auth.user?.role ?? "";

  const tiles = ADMIN_TILES.filter((t) => !t.ownerOnly || role === "Owner" || role === "SuperAdmin");

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader title="Admin" subtitle="Owner and admin tools" />
      <div className="grid gap-4 md:grid-cols-3">
        {tiles.map((tile) => (
          <button
            key={tile.path ?? tile.label}
            type="button"
            onClick={() => tile.path && navigate(tile.path)}
            disabled={tile.disabled}
            aria-disabled={tile.disabled}
            className="rounded-sm border border-gray-200 bg-white p-4 text-left shadow-xs enabled:hover:border-slate-300 enabled:hover:shadow-sm disabled:cursor-not-allowed disabled:bg-slate-50"
          >
            <div className="flex items-center justify-between gap-2 text-sm font-semibold text-gray-800">
              <span>{tile.label}</span>
              {tile.disabled ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">Unavailable</span> : null}
            </div>
            <div className="mt-1 text-xs text-gray-500">{tile.description}</div>
          </button>
        ))}
      </div>

      {/* USMCA activation inline panel when on /admin or /admin/usmca-activation */}
      {(role === "Owner" || role === "SuperAdmin") && (
        <div className="mt-4">
          <h3 className="mb-3 text-base font-semibold text-gray-800">USMCA Activation Control</h3>
          <USMCAActivationPanel />
        </div>
      )}
    </div>
  );
}
