import { SafetyEventsSummaryCard } from "../../../components/safety/events/SafetyEventsSummaryCard";

export default function SafetyEventsPage() {
  return (
    <main className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-gray-900">Safety Events</h1>
        <p className="text-sm text-gray-500">Accidents, citations, and violations in one operating log.</p>
      </header>
      <section className="grid gap-4 md:grid-cols-3">
        <SafetyEventsSummaryCard title="Open Violations" value={0} />
        <SafetyEventsSummaryCard title="CSA Points (24m)" value={0} />
        <SafetyEventsSummaryCard title="Events This Month" value={0} />
      </section>
    </main>
  );
}
