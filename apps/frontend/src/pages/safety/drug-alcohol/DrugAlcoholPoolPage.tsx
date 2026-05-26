export default function DrugAlcoholPoolPage() {
  return (
    <main className="space-y-3">
      <h1 className="text-xl font-semibold text-gray-900">Drug & Alcohol Random Pool</h1>
      <p className="text-sm text-gray-500">Run deterministic random selections and log test outcomes per period.</p>
      <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700">
        Selection runs are seed-based and auditable by period.
      </div>
    </main>
  );
}
