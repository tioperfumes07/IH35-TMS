/**
 * ROUND 443.282 — Settlements-Escrow board REPLACES the page body.
 * Does NOT mount EscrowPage / settlementsMount (no Accounts / Pending tabs under Settlements chrome).
 * Engine: listEscrowAccounts (same rows as Accounting › Escrow KPI source).
 */
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listEscrowAccounts, type EscrowAccount } from "../../api/accounting";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { formatDisplayName } from "../../components/v3/formatDisplayName";
import { BoardSection } from "../../components/v3/BoardSection";
import { V3KpiTile } from "../../components/v3/V3KpiTile";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { entityLabel } from "../../lib/entity-label";
import { formatUsdCents } from "../../lib/money";
import { V3 } from "../../design/v3-tokens";
import { MoneyListToolbar } from "../../components/table/MoneyListToolbar";
import { MultiSelectDropdown } from "../../components/forms/MultiSelectDropdown";
import { settlementsEscrowRegisterHref } from "./settlementsSubnav";

/** Owner board Settlements-Escrow.dc.html — policy chrome, not a new engine. */
export const ESCROW_RELEASE_WINDOW_DAYS = 60;

type DriverEscrowRow = {
  holderId: string;
  driverName: string;
  heldCents: number;
  progressPct: number;
};


function aggregateDriverEscrowRows(accountRows: EscrowAccount[]): DriverEscrowRow[] {
  const byHolder = new Map<string, { name: string; heldCents: number }>();
  for (const row of accountRows) {
    // OWNER 10-24-2026 12:16 PM CT: "an account that has a negative or positive number must always be visible ... only when
    // there is no balance can it be not visible." Any non-zero balance shows — negative, closed account, inactive driver or
    // an unresolved name included. Only $0 drops out.
    if (row.holder_type !== "driver" || (row.balance_cents ?? 0) === 0) continue;
    const rawLabel = entityLabel(row.holder_label ?? null, row.holder_id, "Driver");
    const name = formatDisplayName(rawLabel);
    const prev = byHolder.get(row.holder_id);
    if (prev) {
      prev.heldCents += row.balance_cents;
      if (name.length > prev.name.length) prev.name = name;
    } else {
      byHolder.set(row.holder_id, { name, heldCents: row.balance_cents });
    }
  }
  const list = [...byHolder.entries()].map(([holderId, v]) => ({
    holderId,
    driverName: v.name,
    heldCents: v.heldCents,
    progressPct: 0,
  }));
  const maxHeld = list.reduce((m, r) => Math.max(m, r.heldCents), 0);
  for (const r of list) {
    r.progressPct = maxHeld > 0 ? (r.heldCents / maxHeld) * 100 : 0;
  }
  return list.sort((a, b) => b.heldCents - a.heldCents);
}

function EscrowHeldProgressBar({ pct }: { pct: number }) {
  return (
    <div
      style={{
        width: 160,
        height: 6,
        background: V3.chartGrid,
        borderRadius: 3,
        overflow: "hidden",
      }}
      aria-hidden
    >
      <div
        style={{
          width: `${Math.min(100, Math.max(0, pct))}%`,
          height: 6,
          background: V3.data,
          borderRadius: 3,
        }}
      />
    </div>
  );
}

function ActiveStatusPill() {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: V3.ink }}>
      <span
        style={{ width: 7, height: 7, borderRadius: "50%", background: V3.green, display: "inline-block" }}
      />
      Active
    </span>
  );
}

/** Board body only — chrome is SettlementsModuleShell / SettlementsSubNavWrapper (443.326). */
export function SettlementsEscrowBoard() {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [search, setSearch] = useState("");
  const [selectedDriverIds, setSelectedDriverIds] = useState<string[]>([]);

  const accountsQuery = useQuery({
    queryKey: ["settlements-escrow-board", "accounts", companyId],
    queryFn: () => listEscrowAccounts(companyId),
    enabled: Boolean(companyId),
  });

  const accountRows = useMemo(
    () => (accountsQuery.data?.rows ?? []) as EscrowAccount[],
    [accountsQuery.data?.rows],
  );

  const allDriverRows = useMemo(() => aggregateDriverEscrowRows(accountRows), [accountRows]);

  const driverFilterOptions = useMemo(
    () =>
      allDriverRows.map((r) => ({
        value: r.holderId,
        label: r.driverName,
      })),
    [allDriverRows],
  );

  const driverRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allDriverRows.filter((r) => {
      if (selectedDriverIds.length > 0 && !selectedDriverIds.includes(r.holderId)) return false;
      if (!q) return true;
      return r.driverName.toLowerCase().includes(q);
    });
  }, [allDriverRows, search, selectedDriverIds]);

  const escrowHomeKpis = useMemo(() => {
    if (accountsQuery.isError) {
      return {
        driversHolding: null as number | null,
        totalHeldCents: null as number | null,
        scheduledLoaded: false,
      };
    }
    const loaded = !accountsQuery.isPending || allDriverRows.length > 0;
    return {
      driversHolding: allDriverRows.length,
      totalHeldCents: allDriverRows.reduce((s, r) => s + r.heldCents, 0),
      scheduledLoaded: loaded,
    };
  }, [accountsQuery.isError, accountsQuery.isPending, allDriverRows]);

  const columns = useMemo<ParityColumn<DriverEscrowRow>[]>(
    () => [
      {
        key: "driverName",
        label: "Driver",
        sortable: true,
        sortValue: (r) => r.driverName,
        render: (r) => (
          <Link
            to={settlementsEscrowRegisterHref(r.holderId)}
            className="font-semibold underline"
            style={{ color: V3.link }}
            data-testid="settlements-escrow-driver-link"
          >
            {r.driverName}
          </Link>
        ),
      },
      {
        key: "heldCents",
        label: "Held",
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums",
        sortValue: (r) => r.heldCents,
        render: (r) => formatUsdCents(r.heldCents).replace(/^\$/, ""),
      },
      {
        key: "progress",
        label: "",
        sortable: false,
        render: (r) => <EscrowHeldProgressBar pct={r.progressPct} />,
      },
      {
        key: "status",
        label: "Status",
        sortable: true,
        sortValue: () => "Active",
        render: () => <ActiveStatusPill />,
      },
      {
        key: "open",
        label: "",
        sortable: false,
        render: (r) => (
          <Link
            to={settlementsEscrowRegisterHref(r.holderId)}
            className="font-semibold"
            style={{ color: V3.link }}
            data-testid="settlements-escrow-open-register"
          >
            Open register →
          </Link>
        ),
      },
    ],
    [],
  );

  const totalHeldCents = driverRows.reduce((s, r) => s + r.heldCents, 0);

  return (
    <div className="space-y-3" data-testid="settlements-escrow-board" data-settlements-escrow-rebuild="1">
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
        />
        <V3KpiTile
          label="Total held"
          value={
            escrowHomeKpis.totalHeldCents == null ? "—" : formatUsdCents(escrowHomeKpis.totalHeldCents)
          }
          testId="escrow-kpi-total-held"
        />
        <V3KpiTile
          label="Release window"
          value={`${ESCROW_RELEASE_WINDOW_DAYS} days`}
          sub="after last settlement"
          testId="escrow-kpi-release-window"
        />
        <V3KpiTile
          label="Scheduled releases"
          value={escrowHomeKpis.scheduledLoaded ? "0" : "—"}
          testId="escrow-kpi-scheduled-releases"
        />
      </div>

      <MoneyListToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search driver name…"
        searchTestId="settlements-escrow-search-input"
        onClearAll={() => {
          setSearch("");
          setSelectedDriverIds([]);
        }}
        activeFilterCount={selectedDriverIds.length}
        testIdPrefix="settlements-escrow"
      >
        <MultiSelectDropdown
          label="Driver"
          options={driverFilterOptions}
          selected={selectedDriverIds}
          onChange={setSelectedDriverIds}
          allLabel="All drivers"
          searchable
          searchPlaceholder="Type a driver name…"
          data-testid="settlements-escrow-driver-filter"
        />
      </MoneyListToolbar>

      {!companyId ? <p className="text-xs text-red-600">Select an operating company.</p> : null}

      {accountsQuery.isError ? (
        <ListErrorState
          title="Couldn't load escrow"
          status={0}
          message={(accountsQuery.error as Error | undefined)?.message}
          onRetry={() => void accountsQuery.refetch()}
        />
      ) : (
        <BoardSection
          title="Escrow by driver — click a driver to open his register"
          onViewAll={() => navigate("/accounting/escrow")}
          testId="settlements-escrow-board-section"
          footer="Live balances from Accounting › Escrow. Click a driver name to open that driver's escrow register."
        >
          <ParityTable<DriverEscrowRow>
            title="Escrow by driver — click a driver to open his register"
            columns={columns}
            rows={driverRows}
            rowKey={(r) => r.holderId}
            loading={accountsQuery.isPending || (accountsQuery.isFetching && driverRows.length === 0)}
            emptyText="No drivers with escrow balance."
            storageKey="settlements-escrow-by-driver"
            serverViewKey="settlements-escrow-by-driver"
            tableTestId="settlements-escrow-driver-table"
            gearButtonTestId="settlements-escrow-column-gear"
            footerCells={
              driverRows.length > 0
                ? {
                    driverName: () => (
                      <span className="font-bold" style={{ fontSize: 12 }}>
                        Total
                      </span>
                    ),
                    heldCents: () => (
                      <span
                        className="font-bold tabular-nums text-right block"
                        style={{ fontSize: 12, color: V3.ink }}
                      >
                        <Link className="underline" style={{ color: V3.ink }} to="/accounting/escrow">
                          {formatUsdCents(totalHeldCents).replace(/^\$/, "")}
                        </Link>
                      </span>
                    ),
                  }
                : undefined
            }
          />
        </BoardSection>
      )}

      <div
        className="flex gap-2 items-start rounded-sm border px-3 py-2 text-xs"
        style={{ borderColor: V3.border, borderLeftWidth: 3, borderLeftColor: V3.amber, background: V3.surface }}
      >
        <b style={{ color: V3.amber, whiteSpace: "nowrap" }}>Measured</b>
        <span>
          Junk rows (&quot;Driver — not visible&quot;, Safety, duplicate closed bonds) are hidden on this
          Settlements list; Accounting › Escrow keeps the full ledger.
        </span>
      </div>
    </div>
  );
}
