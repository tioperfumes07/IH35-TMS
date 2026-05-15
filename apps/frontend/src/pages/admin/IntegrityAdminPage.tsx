import { PageHeader } from "../../components/layout/PageHeader";

/** Backend route `GET /api/v1/admin/integrity/checks` is not registered yet — swap this page when it ships. */
export function IntegrityAdminPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Integrity checks" subtitle="Admin · data consistency (Wave 2+)" />
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <p className="font-semibold">Backend endpoint not yet shipped</p>
        <p className="mt-1 text-xs">
          Planned: <code className="rounded bg-amber-100/80 px-1">GET /api/v1/admin/integrity/checks</code> with run history and
          drill-down. This scaffold stays ready to wire without URL changes.
        </p>
      </div>
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-4 text-xs text-gray-600">
        <p className="font-semibold text-gray-800">Planned UI blocks</p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>Check catalog table (name, severity, last run)</li>
          <li>“Run all” / “Run selected” actions</li>
          <li>Findings queue with filters and export</li>
        </ul>
      </div>
    </div>
  );
}
