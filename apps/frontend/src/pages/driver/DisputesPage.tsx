import { PageHeader } from "../../components/layout/PageHeader";

export function DisputesPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <PageHeader title="Driver disputes (P6)" subtitle="Uses /api/v1/driver/settlements/:id/dispute endpoints" />
      <div className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-700">
        <p className="mb-2">
          Submit disputes from your settlement detail screen in TMS or integrate this page with your driver session wiring.
        </p>
        <p className="text-xs text-gray-500">
          Backend routes live under <span className="font-mono">/api/v1/driver/settlements/…</span> (mobile/PWA session required).
        </p>
      </div>
    </div>
  );
}
