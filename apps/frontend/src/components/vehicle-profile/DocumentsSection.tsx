import type { ReactNode } from "react";

type DocRow = {
  file_id: string;
  name: string;
  category?: string | null;
  expiration_date?: string | null;
  uploaded_at?: string | null;
  url?: string;
};

function expColor(dateStr: string | null | undefined): string {
  if (!dateStr) return "text-gray-600";
  const days = Math.ceil((new Date(dateStr).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (days < 30) return "text-red-700";
  if (days <= 90) return "text-yellow-700";
  return "text-green-700";
}

export function DocumentsSection({
  unitId,
  companyId,
  documents,
  photosSlot,
}: {
  unitId: string;
  companyId: string;
  documents: DocRow[];
  photosSlot?: ReactNode;
}) {
  return (
    <section className="rounded border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-800">Documents</h2>
        <a
          className="text-xs text-blue-700 underline"
          href={`/docs?entity_type=unit&entity_id=${unitId}&operating_company_id=${companyId}`}
          data-testid="vp-docs-upload-link"
        >
          Upload (docs module)
        </a>
      </div>
      {photosSlot}
      <table className="mt-3 w-full text-left text-xs">
        <thead>
          <tr className="text-gray-500">
            <th className="pb-1">Type</th>
            <th>Name</th>
            <th>Expiration</th>
            <th>Uploaded</th>
          </tr>
        </thead>
        <tbody>
          {documents.length === 0 ? (
            <tr>
              <td colSpan={4} className="py-2 text-gray-500">
                No documents linked.
              </td>
            </tr>
          ) : (
            documents.map((d) => (
              <tr key={d.file_id} className="border-t border-gray-100">
                <td className="py-1">{d.category ?? "—"}</td>
                <td>{d.name}</td>
                <td className={expColor(d.expiration_date)}>{d.expiration_date ?? "—"}</td>
                <td>{d.uploaded_at?.slice(0, 10) ?? "—"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}
