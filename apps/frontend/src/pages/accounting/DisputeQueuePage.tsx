import { PageHeader } from "../../components/layout/PageHeader";

export function DisputeQueuePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-3">
      <PageHeader title="Settlement dispute queue" subtitle="Office workflows for P6 settlement disputes" />
      <div className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-700">
        <p className="mb-2">
          Queue API: <span className="font-mono">GET /api/v1/disputes?operating_company_id=…</span>
        </p>
        <p className="mb-2">
          Review flow: <span className="font-mono">POST /api/v1/disputes/:id/start-review</span> then{" "}
          <span className="font-mono">POST /api/v1/disputes/:id/decide</span>.
        </p>
        <p className="text-xs text-gray-500">Decisions enqueue email template `settlement-dispute-decided` via Block M queue.</p>
      </div>
    </div>
  );
}
