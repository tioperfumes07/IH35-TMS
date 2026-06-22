export function DocumentsSection({
  equipmentId,
  companyId,
  documents,
}: {
  equipmentId: string;
  companyId: string;
  documents: Array<Record<string, unknown>>;
}) {
  return (
    <section className="rounded border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-800">Documents</h2>
        <a
          className="text-xs text-slate-700 underline"
          href={`/docs?entity_type=equipment&entity_id=${equipmentId}&operating_company_id=${companyId}`}
        >
          Upload (docs module)
        </a>
      </div>
      <ul className="mt-2 space-y-1 text-xs text-gray-700">
        {documents.length === 0 ? (
          <li className="text-gray-500">No documents on file.</li>
        ) : (
          documents.map((d) => (
            <li key={String(d.file_id)}>
              {String(d.name ?? d.file_id)}
              {d.category ? ` · ${String(d.category)}` : ""}
              {d.expiration_date ? ` · exp ${String(d.expiration_date)}` : ""}
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
