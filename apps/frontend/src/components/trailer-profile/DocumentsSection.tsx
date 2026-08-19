import { useState } from "react";
import { UploadModal } from "../documents/UploadModal";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";

export function DocumentsSection({
  equipmentId,
  equipmentNumber,
  // FIX-2 (docs-upload-viewed-entity): companyId is the VIEWED operating company (the one the
  // trailer profile is currently scoped to). It must be threaded into UploadModal — without it
  // the backend falls back to the uploader's default_company_id, which for a multi-entity user
  // can differ from the viewed company, so the upload files under the wrong entity and never
  // reappears on refetch (equipment-aggregate.service.ts reads documents with an exact
  // `f.operating_company_id = $2` match, not "any accessible company").
  companyId,
  documents,
  onUploaded,
}: {
  equipmentId: string;
  equipmentNumber?: string;
  companyId: string;
  documents: Array<Record<string, unknown>>;
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
            this trailer — a dead drill-through. Wire a real, entity-linked upload using the same
            UploadModal every other entity profile (vendor/customer/driver/load) already uses. */}
        <button
          type="button"
          data-testid="tp-docs-upload-button"
          onClick={() => setUploadOpen(true)}
          className="rounded-sm bg-[#1f2a44] px-2 py-1 text-xs font-semibold text-white hover:bg-[#0f1729]"
        >
          + Upload
        </button>
      </div>
      {uploadOpen ? (
        <UploadModal
          entityType="equipment"
          entityId={equipmentId}
          entityName={equipmentNumber ?? equipmentId}
          operatingCompanyId={companyId}
          onClose={() => setUploadOpen(false)}
          onUploadSuccess={() => {
            setUploadOpen(false);
            onUploaded?.();
          }}
        />
      ) : null}
      <ul className="mt-2 space-y-1 text-xs text-gray-700">
        {documents.length === 0 ? (
          <li className="text-gray-500">No documents on file.</li>
        ) : (
          documents.map((d) => (
            <li key={d.file_id == null ? String(d.name ?? "document") : String(d.file_id)}>
              <EntityLinkOrTombstone kind="document" id={d.file_id == null ? null : String(d.file_id)} name={d.name} noun="Document" data-testid="trailer-document-record-link" />
              {d.category ? ` · ${String(d.category)}` : ""}
              {d.expiration_date ? ` · exp ${String(d.expiration_date)}` : ""}
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
