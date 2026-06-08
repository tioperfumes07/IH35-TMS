/**
 * CLOSURE-13 — AdminPage hub (owner/admin access).
 * Tiles: USMCA Activation, Launch Toggles, Data Import, Carrier Bootstrap, etc.
 */
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader";
import { useAuth } from "../../auth/useAuth";
import { USMCAActivationPanel } from "./USMCAActivationPanel";

type AdminTile = { label: string; description: string; path: string; ownerOnly?: boolean };

const ADMIN_TILES: AdminTile[] = [
  { label: "USMCA Activation", description: "Activate USMCA carrier — 16-item launch checklist + state transitions", path: "/admin/usmca-activation", ownerOnly: true },
  { label: "Launch Toggles", description: "Flip carrier soft-launch / rollback toggles", path: "/admin/launch-toggles", ownerOnly: true },
  { label: "Data Import", description: "Bulk import CSV data", path: "/admin/data-import" },
  { label: "Carrier Bootstrap", description: "Bootstrap new carrier QBO accounts", path: "/admin/carrier-bootstrap", ownerOnly: true },
  { label: "Feature Flags", description: "Enable / disable feature flags", path: "/admin/feature-flags", ownerOnly: true },
  { label: "Migration Status", description: "Database migration ledger", path: "/admin/migration-status" },
  { label: "Integrity Checks", description: "Run data integrity audits", path: "/admin/integrity" },
  { label: "Error Monitor", description: "Production error stream", path: "/admin/error-monitor" },
  { label: "Activity Log", description: "User activity audit trail", path: "/admin/activity" },
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
            key={tile.path}
            type="button"
            onClick={() => navigate(tile.path)}
            className="rounded border border-gray-200 bg-white p-4 text-left shadow-sm hover:border-blue-300 hover:shadow"
          >
            <div className="text-sm font-semibold text-gray-800">{tile.label}</div>
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
