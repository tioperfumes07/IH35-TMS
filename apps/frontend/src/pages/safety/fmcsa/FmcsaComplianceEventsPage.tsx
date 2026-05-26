export default function FmcsaComplianceEventsPage() {
  return (
    <main className="space-y-3">
      <h1 className="text-xl font-semibold text-gray-900">FMCSA Compliance Events</h1>
      <p className="text-sm text-gray-500">
        Record compliance-related events and preserve full audit traceability.
      </p>
      <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700">
        Every event is append-only and can only be voided with an explicit reason.
      </div>
    </main>
  );
}
