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
          className="text-xs text-blue-700 underline"
          href={`/docs?entity_type=equipment&entity_id=${equipmentId}&operating_company_id=${companyId}`}
        >
          Upload (docs module)
        </a>
      </div>
      <ul className="mt-2 space-y-1 text-xs text-gray-700">
        {documents.length === 0 ? (
          <li>No documents linked.</li>
        ) : (
          documents.map((d) => <li key={String(d.file_id)}>{String(d.name)}</li>)
        )}
      </ul>
    </section>
  );
}
