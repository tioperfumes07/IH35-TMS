import { PageHeader } from "../../../components/layout/PageHeader";

export function DriverTeamsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-3">
      <PageHeader title="Driver teams" subtitle="Team loads + settlement splits (alias API)" />
      <div className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-700">
        <p className="mb-2">
          CRUD API: <span className="font-mono">/api/v1/driver-teams</span> (maps to `mdata.driver_teams` shares as split percentages).
        </p>
        <p className="text-xs text-gray-500">Split percentages are authoritative on the backend; UI must not invent percentages.</p>
      </div>
    </div>
  );
}
