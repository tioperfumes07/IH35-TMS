/**
 * LST-F20d — US States and Mexico States: reachable, deliberately NOT editable.
 *
 * Both are marked `WIRE (global)` in the owner's wiring map and had a backend but no front door, so
 * they sat in LST-F20c's KNOWN_BESPOKE_NO_TILE list. This gives them the front door and removes them
 * from that ratchet.
 *
 * WHY READ-ONLY, and why they are NOT wired through the generic catalog factory:
 *
 * 1. They are GLOBAL. Verified on the prod branch: `catalogs.us_states` and `catalogs.mexico_states`
 *    are `id, code, name, region, is_active, created_at` — there is NO `operating_company_id` column.
 *    The generic factory is entity-scoped (it requires an opco and INSERTs `operating_company_id`),
 *    so these tables cannot pass through it without inventing a column they correctly do not have.
 *    56 US states/territories and 32 Mexican states are the same for every entity — that is right.
 *
 * 2. They are fixed geographic reference, not a business catalog. QuickBooks, NetSuite and McLeod all
 *    treat state/province tables as system reference an operator cannot add rows to; nobody invents a
 *    57th US state. The owner's 2026-07-28 ruling that "every catalog gets a QuickBooks-style creator
 *    wizard" is about catalogs the business maintains — fine for fuel stations or fine reasons, wrong
 *    here. These feed driver/customer address fields (CreateDriverModal, CustomerDetail, DriverDetail);
 *    a create/edit surface on them is a corruption vector for address validation, not a feature.
 *
 * So: fully reachable and searchable, no create, no edit, no archive. The existing read-only GETs in
 * `catalogs/states.routes.ts` stay the single source — this adds no write path anywhere.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BackArrowHeader } from "../../../components/layout/BackArrowHeader";
import { CatalogTable } from "../../../components/catalogs/CatalogTable";
import { ListErrorState } from "../../../components/ListErrorState";
import type { CatalogColumnConfig, CatalogRow } from "../../../hooks/useCatalogQuery";
import { listMexicoStates, listUsStates } from "../../../api/catalogs";
import { ListsSubNav } from "../ListsSubNav";

const COLUMNS: CatalogColumnConfig[] = [
  { key: "code", label: "Code", sortable: true, filterable: true },
  { key: "display_name", label: "State", sortable: true, filterable: true },
  { key: "region", label: "Region", sortable: true, filterable: true },
  { key: "is_active", label: "Status", sortable: true, filterable: false },
];

type Variant = "us" | "mx";

/** Both endpoints return the same row shape; normalise here so the union doesn't leak into useQuery. */
type StateRow = { id: string; code: string; name: string; region: string };

const VARIANTS = {
  us: { title: "US States", catalogName: "reference.us_states" },
  mx: { title: "Mexico States", catalogName: "reference.mexico_states" },
} as const;

export function StatesCatalogPage({ variant }: { variant: Variant }) {
  const cfg = VARIANTS[variant];

  const query = useQuery({
    queryKey: ["catalogs", cfg.catalogName],
    queryFn: async (): Promise<StateRow[]> => {
      const res = variant === "us" ? await listUsStates() : await listMexicoStates();
      return res.states as StateRow[];
    },
  });

  // The table speaks `display_name`; these tables store the label in `name` (no display_name column on
  // prod). Map at the edge — never store the same fact twice.
  const rows = useMemo<CatalogRow[]>(
    () => (query.data ?? []).map((s) => ({ ...s, display_name: s.name, is_active: true })),
    [query.data]
  );

  return (
    <div className="space-y-3">
      <ListsSubNav />
      <BackArrowHeader
        backTo="/lists"
        breadcrumb={["Lists & Catalogs", "Reference", cfg.title]}
        title={cfg.title}
        countBadge={rows.length}
      />

      <p className="rounded-sm border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
        Fixed geographic reference — view only. States are not operator-maintained: they feed driver and
        customer address validation, and the list is identical for every entity.
      </p>

      {query.isError ? (
        <ListErrorState
          title={`Couldn't load ${cfg.title}`}
          status={(query.error as { status?: number })?.status ?? 0}
          message={(query.error as Error)?.message}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <CatalogTable
          catalogName={cfg.catalogName}
          columns={COLUMNS}
          rows={rows}
          defaultSort={{ column: "display_name", dir: "asc" }}
          loading={query.isLoading}
          readOnly
          onEdit={() => undefined}
          onArchive={() => undefined}
        />
      )}
    </div>
  );
}
