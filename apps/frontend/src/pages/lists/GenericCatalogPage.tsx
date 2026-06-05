import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { CatalogEditModal } from "../../components/catalogs/CatalogEditModal";
import { CatalogExcelUploadModal } from "../../components/catalogs/CatalogExcelUploadModal";
import { CatalogTable } from "../../components/catalogs/CatalogTable";
import { Button } from "../../components/Button";
import { BackArrowHeader } from "../../components/layout/BackArrowHeader";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import {
  GENERIC_CATALOG_REGISTRY,
  catalogKeyToCatalogName,
  catalogNameToRoutePath,
  useCatalogMutations,
  useCatalogQuery,
  type CatalogRow,
} from "../../hooks/useCatalogQuery";
import { ListsSubNav } from "./ListsSubNav";

type RouteParams = {
  domain?: string;
  catalogKey?: string;
};

type Props = {
  /** Explicit catalog name (e.g. fleet.equipment_types). Overrides route params when set. */
  catalogName?: string;
};

export function GenericCatalogPage({ catalogName: catalogNameProp }: Props) {
  const params = useParams<RouteParams>();
  const { selectedCompanyId } = useCompanyContext();
  const { pushToast } = useToast();
  const companyId = selectedCompanyId ?? "";

  const catalogName = useMemo(() => {
    if (catalogNameProp) return catalogNameProp;
    if (params.domain && params.catalogKey) {
      return catalogKeyToCatalogName(params.domain, params.catalogKey);
    }
    return null;
  }, [catalogNameProp, params.catalogKey, params.domain]);

  const definition = catalogName ? GENERIC_CATALOG_REGISTRY[catalogName] : undefined;

  const [editRow, setEditRow] = useState<CatalogRow | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  const query = useCatalogQuery({
    catalogName: catalogName ?? "",
    companyId,
    enabled: Boolean(catalogName && companyId),
  });

  const mutations = useCatalogMutations(catalogName ?? "", companyId);

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const readOnly = definition?.readOnly ?? false;

  async function saveRow(body: Record<string, unknown>, row: CatalogRow | null) {
    if (!catalogName) return;
    if (row) {
      await mutations.updateMutation.mutateAsync({ id: row.id, body });
      pushToast("Catalog row updated", "success");
      return;
    }
    await mutations.createMutation.mutateAsync(body);
    pushToast("Catalog row created", "success");
  }

  async function archiveRows(selected: CatalogRow[]) {
    if (!catalogName) return;
    for (const row of selected) {
      await mutations.archiveMutation.mutateAsync(row.id);
    }
    pushToast(`${selected.length} row(s) archived`, "success");
  }

  if (!catalogName || !definition) {
    return (
      <div className="space-y-3">
        <ListsSubNav />
        <div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Unknown or unsupported catalog route
          {params.domain && params.catalogKey ? `: ${params.domain}/${params.catalogKey}` : "."}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ListsSubNav />
      <BackArrowHeader
        backTo="/lists/catalogs"
        breadcrumb={["Lists & Catalogs", definition.domain, definition.displayName]}
        title={definition.displayName}
        countBadge={total}
        actions={
          readOnly ? undefined : (
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  setEditRow(null);
                  setEditOpen(true);
                }}
              >
                + Create
              </Button>
              <Button variant="secondary" onClick={() => setUploadOpen(true)}>
                Upload Excel
              </Button>
            </div>
          )
        }
      />

      {query.isError ? <ListErrorBanner onRetry={() => void query.refetch()} /> : null}
      {query.isLoading && rows.length === 0 ? (
        <div className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-500">
          Loading {definition.displayName.toLowerCase()}…
        </div>
      ) : null}
      {!query.isLoading && rows.length === 0 && !query.isError ? (
        <div className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-500">
          No {definition.displayName.toLowerCase()} rows yet.
        </div>
      ) : null}

      <CatalogTable
        catalogName={catalogName}
        columns={definition.columns}
        rows={rows}
        defaultSort={definition.defaultSort}
        loading={query.isLoading}
        readOnly={readOnly}
        onEdit={(row) => {
          setEditRow(row);
          setEditOpen(true);
        }}
        onArchive={archiveRows}
      />

      <CatalogEditModal
        open={editOpen}
        catalogName={catalogName}
        displayName={definition.displayName}
        row={editRow}
        fields={definition.fields}
        readOnly={readOnly}
        onClose={() => {
          setEditOpen(false);
          setEditRow(null);
        }}
        onSave={saveRow}
      />

      <CatalogExcelUploadModal
        open={uploadOpen}
        catalogName={catalogName}
        displayName={definition.displayName}
        onClose={() => setUploadOpen(false)}
        onUpload={(file) => mutations.importMutation.mutateAsync(file)}
        onCompleted={() => {
          void query.refetch();
        }}
      />
    </div>
  );
}

export function GenericCatalogPageFromRegistry({ catalogName }: { catalogName: string }) {
  return <GenericCatalogPage catalogName={catalogName} />;
}

export function genericCatalogRouteFor(catalogName: string): string {
  return catalogNameToRoutePath(catalogName);
}
