/**
 * "Relay wallet" tab (ROUND 443.29 c, owner 2026-10-10 7:15 PM CT): the wallet roll-forward the owner opens —
 * + settled deposit amount − fuel fills − fill fees − lumper = running balance, by Relay day. The 3.25% deposit fee is
 * shown beside it: it is charged to the funding card, never the wallet. Every number opens the documents behind it.
 * Read-only: GET /api/integrations/relay/wallet-roll-forward.
 *
 * ROUND 443.326 — KPI + MoneyListToolbar + ParityTable + FuelBoardSection (no V3Panel). getRelayWalletRollForward unchanged.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRelayWalletRollForward, type RelayRollForwardDay, type RelayRollForwardDoc } from "../../../api/relay";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { V3KpiTile } from "../../../components/v3/V3KpiTile";
import { MoneyListToolbar } from "../../../components/table/MoneyListToolbar";
import { FuelBoardSection } from "../FuelBoardSection";
import { formatDateUS } from "../../../lib/formatDate";
import { formatMoneyCents } from "../../../components/dispatch/constants";

type Bucket = "deposits" | "fills" | "lumper";
const BUCKET_LABEL: Record<Bucket, string> = { deposits: "Deposits", fills: "Fuel fills (with fee)", lumper: "Lumper (with fee)" };
const money = (c: number) => formatMoneyCents(c, "USD");

function kpiMoney(cents: number | undefined, loading: boolean): string {
  if (loading) return "…";
  if (cents == null) return "—";
  return money(cents);
}

export function RelayWalletRollForwardPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [open, setOpen] = useState<{ day: string; bucket: Bucket } | null>(null);
  const [search, setSearch] = useState("");

  const query = useQuery({
    queryKey: ["fuel", "relay-wallet-roll-forward", companyId],
    queryFn: () => getRelayWalletRollForward(companyId),
    enabled: Boolean(companyId),
  });

  const allDays = query.data?.days ?? [];
  const q = search.trim().toLowerCase();
  const days = q ? allDays.filter((d) => d.day.toLowerCase().includes(q) || formatDateUS(d.day).toLowerCase().includes(q)) : allDays;
  const totals = query.data?.totals;

  const drill = (row: RelayRollForwardDay, bucket: Bucket, cents: number) =>
    row[bucket].length > 0 ? (
      <button
        type="button"
        className="text-[#1F4E9D] underline"
        data-testid={`relay-wallet-open-${bucket}-${row.day}`}
        onClick={() => setOpen({ day: row.day, bucket })}
      >
        {money(cents)}
      </button>
    ) : (
      money(cents)
    );

  const columns: ParityColumn<RelayRollForwardDay>[] = [
    { key: "day", label: "Day", sortable: true, render: (row) => formatDateUS(row.day) },
    { key: "deposits_cents", label: "+ Deposits", sortable: true, render: (row) => drill(row, "deposits", row.deposits_cents) },
    { key: "fills_cents", label: "− Fuel fills", sortable: true, render: (row) => drill(row, "fills", row.fills_cents) },
    { key: "fill_fees_cents", label: "− Fill fees", sortable: true, render: (row) => money(row.fill_fees_cents) },
    { key: "lumper_cents", label: "− Lumper", sortable: true, render: (row) => drill(row, "lumper", row.lumper_cents) },
    { key: "balance_cents", label: "= Balance", sortable: true, render: (row) => money(row.balance_cents) },
    { key: "deposit_fees_cents", label: "Deposit fees (card)", sortable: true, render: (row) => money(row.deposit_fees_cents) },
  ];

  const openDay = open ? days.find((d) => d.day === open.day) : undefined;
  const docColumns: ParityColumn<RelayRollForwardDoc>[] = [
    { key: "ref", label: "Relay reference", sortable: true, render: (d) => d.ref },
    { key: "cents", label: "Amount", sortable: true, render: (d) => money(d.cents) },
  ];

  if (!companyId) {
    return (
      <div className="space-y-3" data-testid="relay-wallet-page">
        <FuelBoardSection title="Relay wallet" testId="relay-wallet-need-company">
          <div className="px-3.5 py-3 text-xs text-gray-700">
            Select an operating company to view the Relay wallet.
          </div>
        </FuelBoardSection>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="relay-wallet-page">
      {/* ROUND 443.250 Relay Wallet V3 — same totals from getRelayWalletRollForward.totals. */}
      <div
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 8 }}
        data-testid="relay-wallet-v3-kpi-strip"
        data-relay-wallet-v3-kpis="1"
      >
        <V3KpiTile
          label="Deposits"
          value={kpiMoney(totals?.deposits_cents, query.isPending)}
          sub="settled into wallet"
          testId="relay-wallet-kpi-deposits"
        />
        <V3KpiTile
          label="Fuel fills"
          value={kpiMoney(totals?.fills_cents, query.isPending)}
          sub="drawn from wallet"
          testId="relay-wallet-kpi-fills"
        />
        <V3KpiTile
          label="Fill fees"
          value={kpiMoney(totals?.fill_fees_cents, query.isPending)}
          sub="on fuel fills"
          testId="relay-wallet-kpi-fill-fees"
        />
        <V3KpiTile
          label="Lumper"
          value={kpiMoney(totals?.lumper_cents, query.isPending)}
          sub="with fee"
          testId="relay-wallet-kpi-lumper"
        />
        <V3KpiTile
          label="Balance"
          value={kpiMoney(totals?.balance_cents, query.isPending)}
          sub="deposits − fills − fees − lumper"
          tone="ink"
          testId="relay-wallet-kpi-balance"
        />
        <V3KpiTile
          label="Deposit fees (card)"
          value={kpiMoney(totals?.deposit_fees_cents, query.isPending)}
          sub="charged to funding card"
          tone="muted"
          testId="relay-wallet-kpi-deposit-fees"
        />
      </div>
      <MoneyListToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search day…"
        onClearAll={() => setSearch("")}
        activeFilterCount={0}
        testIdPrefix="relay-wallet"
      >
        <span />
      </MoneyListToolbar>
      <FuelBoardSection
        title="Relay wallet — roll-forward"
        subtitle="Deposits − fuel fills − fill fees − lumper = balance, by Relay day. The 3.25% deposit fee is charged to the funding card, not the wallet."
        testId="relay-wallet-roll-forward-v3-panel"
      >
        {query.isError ? (
          <ListErrorBanner onRetry={() => void query.refetch()} message="The Relay wallet roll-forward could not be loaded." />
        ) : (
          <ParityTable
            rows={days}
            columns={columns}
            loading={query.isPending}
            storageKey="fuel-relay-wallet-roll-forward"
            emptyText="No Relay deposits or fills yet."
            rowKey={(row) => row.day}
            suppressToolbarSearch
          />
        )}
      </FuelBoardSection>
      {open && openDay ? (
        <FuelBoardSection
          title={`${BUCKET_LABEL[open.bucket]} — ${formatDateUS(open.day)}`}
          subtitle="The documents behind this number"
          testId="relay-wallet-docs-v3-panel"
          headerRight={
            <button type="button" className="rounded-sm border border-gray-300 px-2 py-1 text-xs" data-testid="relay-wallet-close" onClick={() => setOpen(null)}>
              Close
            </button>
          }
        >
          <ParityTable
            rows={openDay[open.bucket]}
            columns={docColumns}
            loading={false}
            storageKey={`fuel-relay-wallet-docs-${open.bucket}`}
            emptyText="No documents."
            rowKey={(d) => d.id}
          />
        </FuelBoardSection>
      ) : null}
    </div>
  );
}
