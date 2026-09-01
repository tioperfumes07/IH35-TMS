import { useEffect, useMemo, useState } from "react";
import { CatalogListSearchInput } from "../../../components/lists/CatalogListSearchInput";
import { catalogListSearchQueryOptions } from "../../../hooks/catalogListSearchQueryOptions";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { postingTemplatesCatalogClient } from "../../../api/catalogs-accounting";
import type { AccountingCatalogRow } from "../../../api/catalogs-accounting";
import { getCoaAccounts } from "../../../api/banking";
import { Button } from "../../../components/Button";
import { BackArrowHeader } from "../../../components/layout/BackArrowHeader";
import { ListErrorState } from "../../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { formatQueryErrorDetail } from "../../../lib/tableError";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { AccountingCatalogProfileDrawer } from "./AccountingCatalogProfileDrawer";
import { PostingTemplateModal } from "./PostingTemplateModal";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";

function statusPillClass(isActive: boolean) {
  return isActive
    ? "rounded-sm bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700"
    : "rounded-sm bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600";
}

export function PostingTemplatesListPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"true" | "false" | "all">("true");
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [selectedRow, setSelectedRow] = useState<AccountingCatalogRow | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  // LST-F5212 — Live Chrome deep-link: Lists ?create=1 must open New Posting Template (void-cancel / catalog parity).
  useEffect(() => {
    if (searchParams.get("create") !== "1" || !companyId) return;
    setModalMode("create");
    setSelectedRow(null);
    setModalOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("create");
    setSearchParams(next, { replace: true });
  }, [searchParams, companyId, setSearchParams]);

  const query = useQuery({
    queryKey: ["catalogs", "accounting", "Posting Templates", companyId, search, status],
    queryFn: () =>
      postingTemplatesCatalogClient.list({
        operating_company_id: companyId,
        search: search || undefined,
        is_active: status,
        limit: 200,
        offset: 0,
      }),
    enabled: Boolean(companyId),
    ...catalogListSearchQueryOptions,
  });
  const accountsQuery = useQuery({
    queryKey: ["catalogs", "accounts", "for-posting-templates-list", companyId],
    queryFn: () => getCoaAccounts(companyId),
    enabled: Boolean(companyId),
    ...catalogListSearchQueryOptions,
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const accountLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of accountsQuery.data?.accounts ?? []) map.set(a.id, `${a.account_number} · ${a.account_name}`);
    return map;
  }, [accountsQuery.data]);

  const columns = useMemo<Array<ParityColumn<AccountingCatalogRow>>>(
    () => [
      {
        key: "code",
        label: "Code",
        sortable: true,
        render: (row) => <span className="font-mono text-xs">{row.code || "—"}</span>,
      },
      { key: "display_name", label: "Display Name", sortable: true },
      {
        key: "accounts",
        label: "Debit / Credit",
        render: (row) => {
          const debit = accountLabel.get(String(row.metadata.debit_account_id ?? "")) ?? "—";
          const credit = accountLabel.get(String(row.metadata.credit_account_id ?? "")) ?? "—";
          return <span className="text-xs text-slate-600">{debit} → {credit}</span>;
        },
      },
      {
        key: "details",
        label: "Details",
        render: (row) => <span className="text-xs text-slate-600">{row.description || "Code-managed posting template"}</span>,
      },
      {
        key: "is_active",
        label: "Status",
        sortable: true,
        render: (row) => <span className={statusPillClass(row.is_active)}>{row.is_active ? "Active" : "Inactive"}</span>,
      },
    ],
    [accountLabel]
  );

  return (
    <div className="space-y-3">
      <BackArrowHeader
        backTo="/lists"
        breadcrumb={["Lists & Catalogs", "Accounting", "Posting Templates"]}
        title="Posting Templates"
        countBadge={total}
        actions={
          <Button
            onClick={() => {
              setModalMode("create");
              setSelectedRow(null);
              setModalOpen(true);
            }}
          >
            + Create
          </Button>
        }
      />

      {query.isError ? (
        <ListErrorState
          title="Couldn't load posting templates"
          {...formatQueryErrorDetail(query.error)}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <ParityTable<AccountingCatalogRow>
          rows={rows}
          columns={columns}
          rowKey={(row) => row.id}
          loading={query.isLoading}
          emptyText="No posting templates found. + Create seeds a PostingSourceType row; the next batch stamps posting_template_id."
          storageKey="accounting-catalog-posting-templates"
          tableTestId="accounting-catalog-list-table"
          onRowClick={(row) => {
            setSelectedRow(row);
            setProfileOpen(true);
          }}
          suppressToolbarSearch
          filterBar={
            <div className="grid gap-2 md:grid-cols-3">
              <CatalogListSearchInput value={search} onChange={setSearch} placeholder="Search by code or display name" className="h-9 rounded-sm border border-gray-300 px-2 text-sm md:col-span-2" />
              <SelectCombobox
                value={status}
                onChange={(event) => setStatus(event.target.value as "true" | "false" | "all")}
                className="h-9 rounded-sm border border-gray-300 px-2 text-sm"
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
                <option value="all">All</option>
              </SelectCombobox>
            </div>
          }
        />
      )}

      <AccountingCatalogProfileDrawer
        open={profileOpen}
        displayName="Posting Template"
        codeLabel="Code"
        row={selectedRow}
        canEdit
        onClose={() => setProfileOpen(false)}
        onEdit={() => {
          setProfileOpen(false);
          setModalMode("edit");
          setModalOpen(true);
        }}
      />

      <PostingTemplateModal
        open={modalOpen}
        mode={modalMode}
        row={selectedRow}
        operatingCompanyId={companyId}
        client={postingTemplatesCatalogClient}
        onClose={() => setModalOpen(false)}
        onSaved={() => void query.refetch()}
      />
    </div>
  );
}
