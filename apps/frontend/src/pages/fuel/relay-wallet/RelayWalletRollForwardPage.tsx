/**
 * "Relay wallet" tab (ROUND 443.29 c, owner 2026-10-10 7:15 PM CT): the wallet roll-forward the owner opens —
 * + settled deposit amount − fuel fills − fill fees − lumper = running balance, by Relay day. The 3.25% deposit fee is
 * shown beside it: it is charged to the funding card, never the wallet. Every number opens the documents behind it.
 * Read-only: GET /api/integrations/relay/wallet-roll-forward.
 *
 * ROUND 443.326 — KPI + MoneyListToolbar + ParityTable + FuelBoardSection (no V3Panel). getRelayWalletRollForward unchanged.
 */
import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { currentOriginHref, withReturnContext } from "../../../lib/returnContext";
import { useQuery } from "@tanstack/react-query";
import { getRelayWalletRollForward, type RelayRollForwardDay, type RelayRollForwardDoc } from "../../../api/relay";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { EntityLink } from "../../../components/shared/EntityLink";
import { MoneyCell } from "../../../components/shared/MoneyCell";
import { V3KpiTile } from "../../../components/v3/V3KpiTile";
import { MoneyListToolbar } from "../../../components/table/MoneyListToolbar";
import { FuelBoardSection } from "../FuelBoardSection";
import { formatDateUS } from "../../../lib/formatDate";
import { formatUsdCents } from "../../../lib/money";

type Bucket = "deposits" | "fills" | "lumper";
const BUCKET_LABEL: Record<Bucket, string> = { deposits: "Deposits", fills: "Fuel fills (with fee)", lumper: "Lumper (with fee)" };
const money = (c: number) => formatUsdCents(c);

function kpiMoney(cents: number | undefined, loading: boolean): string {
  if (loading) return "…";
  if (cents == null) return "—";
  return money(cents);
}

function docRefLink(bucket: Bucket, d: RelayRollForwardDoc) {
  if (bucket === "deposits") {
    // Deposit detail lives on the Relay inbox (no dedicated EntityLink route for relay_topup yet).
    return (
      <Link to="/fuel/inbox" className="text-[#1F4E9D] underline" data-testid="relay-wallet-doc-deposit-link">
        {d.ref || d.id}
      </Link>
    );
  }
  return (
    <EntityLink
      kind="fuel_transaction"
      id={d.id}
      label={d.ref || d.id}
      data-testid="relay-wallet-doc-fill-link"
    />
  );
}

export function RelayWalletRollForwardPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pathname, search: locSearch } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const originHref = currentOriginHref(pathname, locSearch);
  // ROUND 8.20 board19 — docs drill open state is URL SoT (bucket+day) so KPI href+ret works.
  const bucketFromUrl = searchParams.get("bucket");
  const dayFromUrl = searchParams.get("day");
  const open: { day: string; bucket: Bucket } | null =
    bucketFromUrl === "deposits" || bucketFromUrl === "fills" || bucketFromUrl === "lumper"
      ? dayFromUrl
        ? { day: dayFromUrl, bucket: bucketFromUrl }
        : { day: "", bucket: bucketFromUrl }
      : null;
  const setOpen = (next: { day: string; bucket: Bucket } | null) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (!next) {
          p.delete("bucket");
          p.delete("day");
        } else {
          p.set("bucket", next.bucket);
          if (next.day) p.set("day", next.day);
          else p.delete("day");
        }
        return p;
      },
      { replace: true },
    );
  };
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

  const drill = (row: RelayRollForwardDay, bucket: Bucket, cents: number) => {
    const docs = row[bucket];
    if (docs.length === 1) {
      const kind = bucket === "deposits" ? "relay_topup" : "fuel_transaction";
      return (
        <MoneyCell
          cents={cents}
          drill={{ entity: { kind, id: docs[0].id } }}
          data-testid={`relay-wallet-open-${bucket}-${row.day}`}
        />
      );
    }
    if (docs.length > 1) {
      return (
        <button
          type="button"
          className="text-[#1F4E9D] underline"
          data-testid={`relay-wallet-open-${bucket}-${row.day}`}
          onClick={() => setOpen({ day: row.day, bucket })}
        >
          {money(cents)}
        </button>
      );
    }
    return money(cents);
  };

  const feeOrBalance = (
    row: RelayRollForwardDay,
    cents: number,
    source: Bucket | null,
  ) => {
    if (source && row[source].length === 1) {
      const kind = source === "deposits" ? "relay_topup" : "fuel_transaction";
      return <MoneyCell cents={cents} drill={{ entity: { kind, id: row[source][0].id } }} />;
    }
    if (source && row[source].length > 1) {
      return (
        <button
          type="button"
          className="text-[#1F4E9D] underline"
          onClick={() => setOpen({ day: row.day, bucket: source })}
        >
          {money(cents)}
        </button>
      );
    }
    return money(cents);
  };

  const columns: ParityColumn<RelayRollForwardDay>[] = [
    { key: "day", label: "Day", sortable: true, render: (row) => formatDateUS(row.day) },
    { key: "deposits_cents", label: "+ Deposits", sortable: true, render: (row) => drill(row, "deposits", row.deposits_cents) },
    { key: "fills_cents", label: "− Fuel fills", sortable: true, render: (row) => drill(row, "fills", row.fills_cents) },
    {
      key: "fill_fees_cents",
      label: "− Fill fees",
      sortable: true,
      render: (row) => feeOrBalance(row, row.fill_fees_cents, "fills"),
    },
    { key: "lumper_cents", label: "− Lumper", sortable: true, render: (row) => drill(row, "lumper", row.lumper_cents) },
    {
      key: "balance_cents",
      label: "= Balance",
      sortable: true,
      // Running wallet balance for the day — open deposits when present, else fills.
      render: (row) => feeOrBalance(row, row.balance_cents, row.deposits.length ? "deposits" : row.fills.length ? "fills" : null),
    },
    {
      key: "deposit_fees_cents",
      label: "Deposit fees (card)",
      sortable: true,
      render: (row) => feeOrBalance(row, row.deposit_fees_cents, "deposits"),
    },
  ];

  const openDay = open?.day ? days.find((d) => d.day === open.day) : undefined;
  const latestDayFor = (bucket: Bucket) => [...days].reverse().find((d) => d[bucket].length > 0)?.day ?? "";
  useEffect(() => {
    if (!open || open.day || !days.length) return;
    const day = latestDayFor(open.bucket);
    if (day) setOpen({ day, bucket: open.bucket });
  }, [open, days]);
  const bucketHref = (bucket: Bucket) => {
    const day = latestDayFor(bucket);
    const p = new URLSearchParams(searchParams);
    p.set("bucket", bucket);
    if (day) p.set("day", day);
    else p.delete("day");
    const q = p.toString();
    return withReturnContext(`${pathname}${q ? `?${q}` : ""}`, originHref);
  };
  const docAmount = (bucket: Bucket, d: RelayRollForwardDoc) =>
    bucket === "deposits" ? (
      <MoneyCell
        cents={Number(d.cents ?? 0)}
        drill={{ entity: { kind: "relay_topup", id: d.id } }}
      />
    ) : (
      <MoneyCell
        cents={Number(d.cents ?? 0)}
        drill={{ entity: { kind: "fuel_transaction", id: d.id } }}
      />
    );

  const docColumns: ParityColumn<RelayRollForwardDoc>[] = open
    ? [
        {
          key: "ref",
          label: "Relay reference",
          sortable: true,
          render: (d) => docRefLink(open.bucket, d),
        },
        { key: "cents", label: "Amount", sortable: true, render: (d) => docAmount(open.bucket, d) },
      ]
    : [
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
          href={bucketHref("deposits")}
        />
        <V3KpiTile
          label="Fuel fills"
          value={kpiMoney(totals?.fills_cents, query.isPending)}
          sub="drawn from wallet"
          testId="relay-wallet-kpi-fills"
          href={bucketHref("fills")}
        />
        <V3KpiTile
          label="Fill fees"
          value={kpiMoney(totals?.fill_fees_cents, query.isPending)}
          sub="on fuel fills"
          testId="relay-wallet-kpi-fill-fees"
          href={bucketHref("fills")}
        />
        <V3KpiTile
          label="Lumper"
          value={kpiMoney(totals?.lumper_cents, query.isPending)}
          sub="with fee"
          testId="relay-wallet-kpi-lumper"
          href={bucketHref("lumper")}
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
          href={bucketHref("deposits")}
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
          <ParityTable appearance="board"
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
          <ParityTable appearance="board"
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
