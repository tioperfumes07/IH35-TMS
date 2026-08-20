/**
 * LST-F20b — Dispatch Flag Colors, the last catalog the owner's wiring map marks
 * `WIRE (entity, non-fin)` with no operator surface. 24 rows live across all 3 entities, counted in
 * the Lists badge but openable from nowhere.
 *
 * Route: /lists/dispatch/dispatch-flag-colors
 *
 * WHY THIS IS A BESPOKE PAGE AND NOT A GENERIC-FACTORY CATALOG. The backend is already complete:
 * `catalogs/dispatch-flag-colors.routes.ts` serves GET/POST/PATCH/deactivate/reactivate with audit
 * and entity scoping. It answers at `/api/v1/catalogs/dispatch-flag-colors`, while GenericCatalogPage
 * resolves `/api/v1/catalogs/{domain}/{segment}`. Adding a factory config to close that gap would put
 * a SECOND writer on the same table with looser validation (the factory code regex admits hyphens;
 * `flag_code` does not) — the split-brain that forced catalogs.vendor_types to carry a both-way sync
 * trigger. One writer stays; this page adapts to it and reuses the same shared table/modal the
 * generic page uses, so the operator sees no difference.
 */
import { useCallback, useMemo, useState } from "react";
import { CatalogEditModal } from "../../../components/catalogs/CatalogEditModal";
import { CatalogTable } from "../../../components/catalogs/CatalogTable";
import { Button } from "../../../components/Button";
import { BackArrowHeader } from "../../../components/layout/BackArrowHeader";
import { ListErrorState } from "../../../components/ListErrorState";
import { useToast } from "../../../components/Toast";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { useCreateQueryParam } from "../../../hooks/useCreateQueryParam";
import type { CatalogColumnConfig, CatalogFieldConfig, CatalogRow } from "../../../hooks/useCatalogQuery";
import {
  createDispatchFlagColor,
  deactivateDispatchFlagColor,
  listDispatchFlagColors,
  reactivateDispatchFlagColor,
  updateDispatchFlagColor,
  type DispatchFlagColor,
} from "../../../api/catalogs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ListsSubNav } from "../ListsSubNav";

const CATALOG_NAME = "dispatch.dispatch_flag_colors";
const DISPLAY_NAME = "Dispatch Flag Colors";

const COLUMNS: CatalogColumnConfig[] = [
  { key: "code", label: "Code", sortable: true, filterable: true },
  { key: "display_name", label: "Flag", sortable: true, filterable: true },
  { key: "hex_color", label: "Color", sortable: false, filterable: false },
  { key: "icon_emoji", label: "Icon", sortable: false, filterable: false },
  { key: "severity_order", label: "Severity", sortable: true, filterable: false },
  { key: "description", label: "Description", sortable: false, filterable: false },
  { key: "is_active", label: "Status", sortable: true, filterable: false },
];

/**
 * `hex_color` is NOT NULL with no default on prod, so it is required here too — a form that let it
 * through empty would submit a create the API must reject. All 24 live rows are #RRGGBB.
 */
const FIELDS: CatalogFieldConfig[] = [
  { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true, placeholder: "RED" },
  { key: "display_name", label: "Flag", type: "text", required: true },
  { key: "hex_color", label: "Color (#RRGGBB)", type: "color", required: true, placeholder: "#ef4444" },
  { key: "icon_emoji", label: "Icon", type: "text", required: false },
  { key: "severity_order", label: "Severity Order", type: "number", required: false },
  { key: "description", label: "Description", type: "text", required: false },
  { key: "sort_order", label: "Sort Order", type: "number", required: false },
];

/**
 * The bespoke route speaks `flag_code`; the shared table/modal speak `code`. Map at the edge so the
 * physical column stays the single truth — never store the same fact twice.
 */
function toCatalogRow(flag: DispatchFlagColor): CatalogRow {
  const { flag_code, ...rest } = flag;
  return { ...rest, code: flag_code };
}

export function DispatchFlagColorsCatalog() {
  const { selectedCompanyId } = useCompanyContext();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const companyId = selectedCompanyId ?? "";

  const [editRow, setEditRow] = useState<CatalogRow | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  // LST-F5217 — Lists hub / flyout ?create=1 must open create modal (hub Create prefers this leaf for dispatch).
  useCreateQueryParam({
    companyId,
    onOpenCreate: () => {
      setEditRow(null);
      setEditOpen(true);
    },
  });

  const query = useQuery({
    queryKey: ["dispatch-flag-colors", companyId],
    queryFn: () => listDispatchFlagColors(companyId, true),
    enabled: Boolean(companyId),
  });

  const rows = useMemo(() => (query.data?.flags ?? []).map(toCatalogRow), [query.data]);

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["dispatch-flag-colors", companyId] });
  }, [companyId, queryClient]);

  const handleSave = useCallback(
    async (body: Record<string, unknown>, row: CatalogRow | null) => {
      const num = (v: unknown) => (v === "" || v === undefined || v === null ? undefined : Number(v));
      const str = (v: unknown) => (v === "" || v === undefined || v === null ? undefined : String(v));
      if (row?.id) {
        await updateDispatchFlagColor(String(row.id), {
          display_name: str(body.display_name),
          hex_color: str(body.hex_color),
          icon_emoji: str(body.icon_emoji),
          severity_order: num(body.severity_order),
          description: str(body.description),
          sort_order: num(body.sort_order),
        });
        pushToast(`${DISPLAY_NAME} updated`, "success");
      } else {
        await createDispatchFlagColor({
          operating_company_id: companyId,
          flag_code: String(body.code ?? ""),
          display_name: String(body.display_name ?? ""),
          hex_color: String(body.hex_color ?? ""),
          icon_emoji: str(body.icon_emoji),
          severity_order: num(body.severity_order),
          description: str(body.description),
          sort_order: num(body.sort_order),
        });
        pushToast(`${DISPLAY_NAME} created`, "success");
      }
      await refresh();
    },
    [companyId, pushToast, refresh]
  );

  // Archive, never delete (Rule 07) — the route soft-deletes via is_active.
  const handleArchive = useCallback(
    async (targets: CatalogRow[]) => {
      for (const target of targets) await deactivateDispatchFlagColor(String(target.id));
      pushToast(`${targets.length} row(s) archived`, "success");
      await refresh();
    },
    [pushToast, refresh]
  );

  const handleRestore = useCallback(
    async (targets: CatalogRow[]) => {
      for (const target of targets) await reactivateDispatchFlagColor(String(target.id));
      pushToast(`${targets.length} row(s) restored`, "success");
      await refresh();
    },
    [pushToast, refresh]
  );

  return (
    <div className="space-y-3">
      <ListsSubNav />
      <BackArrowHeader
        backTo="/lists"
        breadcrumb={["Lists & Catalogs", "Dispatch", DISPLAY_NAME]}
        title={DISPLAY_NAME}
        countBadge={rows.length}
      />

      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEditRow(null);
            setEditOpen(true);
          }}
        >
          + Create
        </Button>
      </div>

      {query.isError ? (
        <ListErrorState
          title={`Couldn't load ${DISPLAY_NAME}`}
          status={(query.error as { status?: number })?.status ?? 0}
          message={(query.error as Error)?.message}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <CatalogTable
          catalogName={CATALOG_NAME}
          columns={COLUMNS}
          rows={rows}
          defaultSort={{ column: "severity_order", dir: "asc" }}
          loading={query.isLoading}
          onEdit={(row) => {
            setEditRow(row);
            setEditOpen(true);
          }}
          onArchive={handleArchive}
          onRestore={handleRestore}
        />
      )}

      <CatalogEditModal
        open={editOpen}
        catalogName={CATALOG_NAME}
        displayName={DISPLAY_NAME}
        row={editRow}
        fields={FIELDS}
        onClose={() => setEditOpen(false)}
        onSave={handleSave}
      />
    </div>
  );
}
