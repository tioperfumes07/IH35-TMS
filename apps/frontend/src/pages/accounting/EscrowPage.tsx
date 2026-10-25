import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { EntityLink, type EntityKind } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { formatDateTimeUS, formatDateUS } from "../../lib/formatDate";
import { listEscrowAccounts, listEscrowPostings, type EscrowAccount, type EscrowPosting } from "../../api/accounting";
import { ListErrorState } from "../../components/ListErrorState";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useUrlSort } from "../../hooks/useUrlSort";
import { EscrowDeductionsPendingTab } from "../driver-finance/EscrowDeductionsPendingTab";
import { settlementsEscrowRegisterHref } from "../driver-finance/settlementsSubnav";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { userFacingApiError } from "../../lib/api-error-message";
import { formatUsdCents } from "../../lib/money";
import { formatDisplayName } from "../../components/v3/formatDisplayName";
import { V3KpiTile } from "../../components/v3/V3KpiTile";
import { MoneyListToolbar } from "../../components/table/MoneyListToolbar";

type EscrowViewTab = "accounts" | "pending";

/** Owner board Settlements-Escrow.dc.html — policy chrome ("60 days after last settlement"), not a new engine. */
const ESCROW_RELEASE_WINDOW_DAYS = 60;

// GLB-05 — delegates to the canonical formatter (lib/money.ts) instead of reimplementing it. The
// old body called toLocaleString(undefined, ...) — an unpinned locale that formats differently
// depending on the runtime's default locale, not guaranteed QBO "$1,234.56" the way formatUsdCents is.
function money(cents: number) {
  return formatUsdCents(cents);
}

// OWNER 10-24 (D077): MM/DD/YYYY + Central time, never the browser's unpadded locale string.
function dt(value: string) {
  return formatDateTimeUS(value) || value;
}

function escrowSourceEntityKind(sourceType: EscrowPosting["source_type"]): EntityKind | null {
  switch (sourceType) {
    case "driver_settlement":
      return "settlement";
    case "factoring_advance":
      return "factoring_advance";
    case "vendor_bill":
      return "bill";
    default:
      return null;
  }
}

function escrowHolderNoun(holderType: EscrowAccount["holder_type"]): string {
  switch (holderType) {
    case "driver":
      return "Driver";
    case "vendor":
      return "Vendor";
    case "factor":
      return "Factor";
    default:
      return "Holder";
  }
}

function escrowSourceNoun(sourceType: EscrowPosting["source_type"]): string {
  switch (sourceType) {
    case "driver_settlement":
      return "Settlement";
    case "factoring_advance":
      return "Factoring advance";
    case "vendor_bill":
      return "Bill";
    default:
      return "Source";
  }
}

function EscrowPostingSourceLink({ row }: { row: EscrowPosting }) {
  const kind = escrowSourceEntityKind(row.source_type);
  const noun = escrowSourceNoun(row.source_type);
  const label = entityLabel(row.source_label ?? null, row.source_id, noun);
  if (!kind || !row.source_id) {
    return (
      <>
        {row.source_type}
        {row.source_id ? ` / ${label}` : ""}
      </>
    );
  }
  return (
    <>
      {row.source_type}{" "}
      <EntityLink kind={kind} id={row.source_id} label={label} />
    </>
  );
}

type EscrowPageProps = {
  /** ROUND 443.254 N1 — mounted under /driver-finance/escrow (Settlements chrome owns the shell). */
  settlementsMount?: boolean;
};

export function EscrowPage({ settlementsMount = false }: EscrowPageProps = {}) {
  const { pushToast } = useToast();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [searchParams] = useSearchParams();
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  // orphan-triage F1: "Pending Review" surfaces EscrowDeductionsPendingTab (auto-proposed
  // abandonment deductions awaiting Owner decision) — distinct from the accounts/postings ledger
  // below (EscrowPage's original content, kept byte-for-byte under the "Accounts" tab).
  const [viewTab, setViewTab] = useState<EscrowViewTab>("accounts");
  const [accountSearch, setAccountSearch] = useState("");
  // BANK-SORT-ROLLOUT-ACCT — accounts + postings tables persist sort in URL via useUrlSort.
  const { sortKey, sortDirection, onSortChange } = useUrlSort();
  const {
    sortKey: postingSortKey,
    sortDirection: postingSortDirection,
    onSortChange: onPostingSortChange,
  } = useUrlSort({ key: "post_sort", dir: "post_dir" });

  const accountsQuery = useQuery({
    queryKey: ["accounting", "escrow", "accounts", companyId],
    queryFn: () => listEscrowAccounts(companyId),
    enabled: Boolean(companyId),
  });

  const postingsQuery = useMutation({
    meta: { loads: true },
    mutationFn: (escrowAccountId: string) => listEscrowPostings(companyId, escrowAccountId, 300),
    onError: (error) =>
      pushToast(userFacingApiError(error, "Failed to load escrow postings"), "error"),
  });

  const accountRows = useMemo(
    () => (accountsQuery.data?.rows ?? []) as EscrowAccount[],
    [accountsQuery.data?.rows]
  );

  const filteredAccountRows = useMemo(() => {
    const q = accountSearch.trim().toLowerCase();
    if (!q) return accountRows;
    return accountRows.filter((row) => {
      const label = entityLabel(row.holder_label ?? null, row.holder_id, escrowHolderNoun(row.holder_type));
      return formatDisplayName(label).toLowerCase().includes(q) || label.toLowerCase().includes(q);
    });
  }, [accountRows, accountSearch]);

  // ROUND 443.250 Settlements Escrow V3 — same listEscrowAccounts rows already loaded for the table.
  // Drivers holding = unique active driver holders with balance > 0; Total held = sum of active
  // balances. Release window = board policy constant. Scheduled releases = "—" (no schedule feed).
  // OWNER 10-24 12:16 PM CT: a $0 account may be hidden; any account with a balance (+ or −) is always listed.
  const [showZeroAccounts, setShowZeroAccounts] = useState(false);
  const visibleAccountRows = useMemo(
    () => (showZeroAccounts ? filteredAccountRows : filteredAccountRows.filter((row) => (row.balance_cents ?? 0) !== 0)),
    [filteredAccountRows, showZeroAccounts],
  );
  const escrowHomeKpis = useMemo(() => {
    if (accountsQuery.isError) {
      return {
        driversHolding: null as number | null,
        totalHeldCents: null as number | null,
      };
    }
    // OWNER 10-24 12:16 PM CT: every non-zero escrow counts and shows (negative, closed, inactive driver included).
    const withBalance = accountRows.filter((row) => (row.balance_cents ?? 0) !== 0);
    const holdingDriverIds = new Set(
      withBalance.filter((row) => row.holder_type === "driver").map((row) => row.holder_id),
    );
    const totalHeldCents = withBalance.reduce((sum, row) => sum + (row.balance_cents ?? 0), 0);
    return {
      driversHolding: holdingDriverIds.size,
      totalHeldCents,
    };
  }, [accountRows, accountsQuery.isError]);

  // ACCT-SURF-09: deep-link from Settlements (?account_id= / ?holder_id=) so reverse drill lands on a row.
  useEffect(() => {
    if (!accountRows.length) return;
    const accountId = searchParams.get("account_id");
    const holderId = searchParams.get("holder_id");
    if (!accountId && !holderId) return;
    let next: EscrowAccount | undefined;
    if (accountId) next = accountRows.find((row) => row.id === accountId);
    if (!next && holderId) next = accountRows.find((row) => row.holder_id === holderId);
    if (next && next.id !== selectedAccountId) {
      setSelectedAccountId(next.id);
      postingsQuery.mutate(next.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- select when accounts load / URL deep-link changes
  }, [accountRows, searchParams]);

  const accountColumns = useMemo<ParityColumn<EscrowAccount>[]>(
    () => [
      {
        key: "holder_id",
        label: "Holder",
        sortable: true,
        sortValue: (row) => row.holder_label ?? "",
        render: (row) =>
          row.holder_type === "driver" ? (
            // ROUND 443.254 N5 — driver name opens Escrow Register, not the profile.
            <Link
              to={settlementsEscrowRegisterHref(row.holder_id)}
              className="underline"
              data-testid="escrow-driver-register-link"
            >
              {formatDisplayName(
                entityLabel(row.holder_label ?? null, row.holder_id, escrowHolderNoun(row.holder_type)),
              )}
            </Link>
          ) : row.holder_type === "vendor" ? (
            <EntityLink
              kind="vendor"
              id={row.holder_id}
              label={entityLabel(row.holder_label ?? null, row.holder_id, escrowHolderNoun(row.holder_type))}
            />
          ) : (
            entityLabel(row.holder_label ?? null, row.holder_id, escrowHolderNoun(row.holder_type))
          ),
      },
      { key: "holder_type", label: "Type", sortable: true },
      { key: "purpose", label: "Purpose", sortable: true },
      { key: "status", label: "Status", sortable: true },
      { key: "balance_cents", label: "Balance", sortable: true, className: "text-right", cellClass: "text-right tabular-nums", render: (row) => money(row.balance_cents) },
      { key: "updated_at", label: "Updated", sortable: true, render: (row) => dt(row.updated_at) },
    ],
    [],
  );

  const postingRows = (postingsQuery.data?.rows ?? []) as EscrowPosting[];
  const postingColumns = useMemo<ParityColumn<EscrowPosting>[]>(
    () => [
      { key: "posted_at", label: "Posted", sortable: true, render: (row) => dt(row.posted_at) },
      { key: "posting_type", label: "Type", sortable: true },
      { key: "amount_cents", label: "Amount", sortable: true, className: "text-right", cellClass: "text-right tabular-nums", render: (row) => money(row.amount_cents) },
      {
        key: "source_type",
        label: "Source",
        sortable: true,
        render: (row) => <EscrowPostingSourceLink row={row} />,
      },
      {
        key: "linked_journal_entry_id",
        label: "Journal entry",
        sortable: true,
        render: (row) => (
          <EntityLink
            kind="journal_entry"
            id={row.linked_journal_entry_id ?? undefined}
            label={
              row.linked_journal_entry_id
                ? row.journal_entry_date
                  ? `${formatDateUS(row.journal_entry_date)}${row.journal_entry_memo ? ` — ${row.journal_entry_memo}` : ""}`
                  : entityLabel(row.journal_entry_memo, row.linked_journal_entry_id, "Journal entry")
                : "—"
            }
          />
        ),
      },
    ],
    [],
  );

  const body = (
      <div className="space-y-4 p-4" data-testid={settlementsMount ? "settlements-escrow-body" : "accounting-escrow-body"}>
      {/* ROUND 443.250 Settlements Escrow V3 — board KPIs: Drivers holding escrow / Total held /
          Release window / Scheduled releases. Live listEscrowAccounts; chrome via V3KpiTile. */}
      <div
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 8 }}
        data-testid="escrow-home-kpi-strip"
        data-escrow-v3-kpis="1"
      >
        <V3KpiTile
          label="Drivers holding escrow"
          value={
            escrowHomeKpis.driversHolding == null
              ? "—"
              : escrowHomeKpis.driversHolding.toLocaleString("en-US")
          }
          sub="active bonds with a balance"
          testId="escrow-kpi-drivers-holding"
          onClick={() => setViewTab("accounts")}
        />
        <V3KpiTile
          label="Total held"
          value={
            escrowHomeKpis.totalHeldCents == null ? "—" : money(escrowHomeKpis.totalHeldCents)
          }
          sub="active escrow balances"
          testId="escrow-kpi-total-held"
          onClick={() => setViewTab("accounts")}
        />
        <V3KpiTile
          label="Release window"
          value={`${ESCROW_RELEASE_WINDOW_DAYS} days`}
          sub="after last settlement"
          testId="escrow-kpi-release-window"
        />
        <V3KpiTile
          label="Scheduled releases"
          value="—"
          sub="no schedule feed"
          testId="escrow-kpi-scheduled-releases"
          onClick={() => setViewTab("pending")}
        />
      </div>

      <div className="flex items-center gap-1 rounded-sm border border-gray-300 p-0.5 text-xs w-fit">
        {(["accounts", "pending"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setViewTab(tab)}
            className={`rounded px-3 py-1 capitalize ${
              viewTab === tab ? "bg-[#1F2A44] text-white" : "text-gray-700 hover:bg-gray-50"
            }`}
          >
            {tab === "accounts" ? "Accounts" : "Pending Review"}
          </button>
        ))}
      </div>

      {viewTab === "pending" ? <EscrowDeductionsPendingTab /> : null}

      {viewTab === "accounts" ? (
        <>
          {!companyId ? <p className="text-xs text-red-600">Select an operating company.</p> : null}

          {accountsQuery.isError ? (
            <div className="rounded-sm border border-[#E5E7EB] bg-white">
              <ListErrorState
                title="Couldn't load escrow accounts"
                status={0}
                message={(accountsQuery.error as Error | undefined)?.message}
                onRetry={() => void accountsQuery.refetch()}
              />
            </div>
          ) : (
            <>
              <MoneyListToolbar
                search={accountSearch}
                onSearchChange={setAccountSearch}
                searchPlaceholder="Search holder…"
                searchTestId="escrow-accounts-search"
                activeFilterCount={0}
                onClearAll={() => setAccountSearch("")}
                testIdPrefix="escrow-accounts"
              >
                <label className="flex items-center gap-1 text-xs text-[#4B5563]" data-testid="escrow-show-zero-toggle">
                  <input type="checkbox" checked={showZeroAccounts} onChange={(e) => setShowZeroAccounts(e.target.checked)} />
                  Show $0 accounts ({accountRows.length - accountRows.filter((r) => (r.balance_cents ?? 0) !== 0).length})
                </label>
              </MoneyListToolbar>
              <ParityTable title="Escrow accounts"
              columns={accountColumns}
              rows={visibleAccountRows}
              rowKey={(row) => row.id}
              loading={accountsQuery.isPending || (accountsQuery.isFetching && accountRows.length === 0)}
              suppressToolbarSearch
              onRowClick={(row) => {
                setSelectedAccountId(row.id);
                postingsQuery.mutate(row.id);
              }}
              rowClassName={(row) => (selectedAccountId === row.id ? "bg-[#F7F8FA]" : "")}
              storageKey="escrow-accounts"
              sortKey={sortKey}
              sortDirection={sortDirection}
              onSortChange={onSortChange}
              emptyText="No escrow accounts found."
            />
            </>
          )}

          {selectedAccountId ? (
            <ParityTable title="Postings — selected escrow account"
              columns={postingColumns}
              rows={postingRows}
              rowKey={(row) => row.id}
              loading={postingsQuery.isPending}
              storageKey="escrow-postings"
              sortKey={postingSortKey}
              sortDirection={postingSortDirection}
              onSortChange={onPostingSortChange}
              emptyText="No escrow postings found for this account."
            />
          ) : null}
        </>
      ) : null}
      </div>
  );

  if (settlementsMount) return body;

  return (
    <AccountingSubNavWrapper
      title="Escrow"
      subtitle="Escrow accounts and posting history"
      actions={
          <div className="flex flex-wrap gap-2 text-xs">
            <Link
              to="/driver-finance/settlements"
              className="rounded-sm border border-[#E5E7EB] bg-white px-2 py-1 font-medium text-[#1F2A44] hover:bg-[#F7F8FA]"
              data-testid="escrow-settlements-cross-link"
            >
              Settlements
            </Link>
            <Link
              to="/accounting/factoring"
              className="rounded-sm border border-[#E5E7EB] bg-white px-2 py-1 font-medium text-[#1F2A44] hover:bg-[#F7F8FA]"
              data-testid="escrow-factoring-cross-link"
            >
              Factoring
            </Link>
            <Link
              to="/banking/driver-escrow"
              className="rounded-sm border border-[#E5E7EB] bg-white px-2 py-1 font-medium text-[#1F2A44] hover:bg-[#F7F8FA]"
              data-testid="escrow-banking-virtual-bank-link"
            >
              Banking · Driver Escrow
            </Link>
          </div>
        }
    >
      {body}
    </AccountingSubNavWrapper>
  );
}
