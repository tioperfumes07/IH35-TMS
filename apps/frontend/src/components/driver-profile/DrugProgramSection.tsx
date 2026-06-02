export function DrugProgramSection({ drug }: { drug: Record<string, unknown> }) {
  const last = drug.last_test as Record<string, unknown> | null | undefined;
  const inPool = Boolean(drug.in_random_pool);

  return (
    <section className="rounded border border-gray-200 bg-white p-4">
      <h2 className="mb-2 text-sm font-semibold text-slate-900">Drug & alcohol program</h2>
      <p className="text-xs text-slate-700">
        Random pool: <span className="font-medium">{inPool ? "Enrolled" : "Not enrolled"}</span>
      </p>
      {last ? (
        <p className="mt-1 text-xs text-slate-600">
          Last test {String(last.date ?? "—")} · {String(last.type ?? "—")} · {String(last.result ?? "—")}
        </p>
      ) : (
        <p className="mt-1 text-xs text-slate-500">No tests on file.</p>
      )}
    </section>
  );
}
