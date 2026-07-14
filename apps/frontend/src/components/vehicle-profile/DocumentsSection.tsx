import { useState, type ReactNode } from "react";
import { UploadModal } from "../documents/UploadModal";

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
  unitNumber,
  // companyId is accepted for call-site compatibility (VehicleProfilePage passes the active
  // operating company) but is not needed here: UploadModal resolves the caller's operating
  // company from the session, same as every other entity-scoped UploadModal usage.
  companyId: _companyId,
  documents,
  photosSlot,
  onUploaded,
}: {
  unitId: string;
  unitNumber?: string;
  companyId: string;
  documents: DocRow[];
  photosSlot?: ReactNode;
  onUploaded?: () => void;
}) {
  const [uploadOpen, setUploadOpen] = useState(false);
  return (
    <section className="rounded-sm border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-800">Documents</h2>
        {/* DOCS-fix: this used to be a static <a href="/docs?entity_id=..."> deep link, but
            DocsHomePage never reads entity_id from the query string (only entity TYPE), so the
            link landed on the unfiltered company-wide library with no way to upload scoped to
            this unit — a dead drill-through. Wire a real, entity-linked upload using the same
            UploadModal every other entity profile (vendor/customer/driver/load) already uses. */}
        <button
          type="button"
          data-testid="vp-docs-upload-button"
          onClick={() => setUploadOpen(true)}
          className="rounded-sm bg-[#1f2a44] px-2 py-1 text-xs font-semibold text-white hover:bg-[#0f1729]"
        >
          + Upload
        </button>
      </div>
      {uploadOpen ? (
        <UploadModal
          entityType="unit"
          entityId={unitId}
          entityName={unitNumber ?? unitId}
          onClose={() => setUploadOpen(false)}
          onUploadSuccess={() => {
            setUploadOpen(false);
            onUploaded?.();
          }}
        />
      ) : null}
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
