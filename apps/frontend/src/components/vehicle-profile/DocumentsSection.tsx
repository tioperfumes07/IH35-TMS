import { useState, type ReactNode } from "react";
import { UploadModal } from "../documents/UploadModal";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";
import { formatDateUS } from "../../lib/formatDate";
import { EntityLink } from "../shared/EntityLink";

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
  // FIX-2 (docs-upload-viewed-entity): companyId is the VIEWED operating company (the one the
  // unit profile is currently scoped to). It must be threaded into UploadModal — without it the
  // backend falls back to the uploader's default_company_id, which for a multi-entity user can
  // differ from the viewed company, so the upload files under the wrong entity and never
  // reappears on refetch (unit-aggregate.service.ts reads documents with an exact
  // `f.operating_company_id = $2` match, not "any accessible company").
  companyId,
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

  const columns: Array<ParityColumn<DocRow>> = [
    {
      key: "category",
      label: "Type",
      sortable: true,
      render: (row) => row.category ?? "—",
    },
    {
      key: "name",
      label: "Name",
      sortable: true,
      render: (row) => <EntityLink kind="document" id={row.file_id} label={row.name} data-testid="unit-document-record-link" />,
    },
    {
      key: "expiration_date",
      label: "Expiration",
      sortable: true,
      render: (row) => (
        <span className={expColor(row.expiration_date)}>{formatDateUS(row.expiration_date) || "—"}</span>
      ),
    },
    {
      key: "uploaded_at",
      label: "Uploaded",
      sortable: true,
      render: (row) => row.uploaded_at?.slice(0, 10) ?? "—",
    },
  ];

  return (
    <section className="rounded-sm border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-800">Documents</h2>
        {/* DOCS-FIX: this used to be a static <a href="/docs?entity_id=..."> deep link, but
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
          operatingCompanyId={companyId}
          onClose={() => setUploadOpen(false)}
          onUploadSuccess={() => {
            setUploadOpen(false);
            onUploaded?.();
          }}
        />
      ) : null}
      {photosSlot}
      <div className="mt-3">
        <ParityTable
          rows={documents}
          columns={columns}
          rowKey={(row) => row.file_id}
          storageKey="vehicle-profile-documents"
          emptyText="No documents linked."
          tableTestId="vp-documents-table"
          initialPageSize={25}
        />
      </div>
    </section>
  );
}
