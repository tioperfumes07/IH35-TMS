import { Radio } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";

export function EldPage() {
  return (
    <div className="space-y-3">
      <PageHeader title="ELD" subtitle="Electronic logging device activity" />
      <section className="rounded border border-gray-200 bg-white p-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-700">
          <Radio className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900">No ELD events yet</h2>
        <p className="mt-1 text-sm text-gray-600">ELD events from Samsara will appear here once sync data is available.</p>
      </section>
    </div>
  );
}
