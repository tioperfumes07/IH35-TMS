/**
 * "Relay wallet" tab (ROUND 443.29 c, owner 2026-10-10 7:15 PM CT): the wallet roll-forward the owner opens —
 * + settled deposit amount − fuel fills − fill fees − lumper = running balance, by Relay day. The 3.25% deposit fee is
 * shown beside it: it is charged to the funding card, never the wallet. Every number opens the documents behind it.
 * Read-only: GET /api/integrations/relay/wallet-roll-forward.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRelayWalletRollForward, type RelayRollForwardDay, type RelayRollForwardDoc } from "../../../api/relay";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { DataPanel } from "../../../components/layout/DataPanel";
import { formatDateUS } from "../../../lib/formatDate";
import { formatMoneyCents } from "../../../components/dispatch/constants";

type Bucket = "deposits" | "fills" | "lumper";
const BUCKET_LABEL: Record<Bucket, string> = { deposits: "Deposits", fills: "Fuel fills (with fee)", lumper: "Lumper (with fee)" };
const money = (c: number) => formatMoneyCents(c, "USD");

export function RelayWalletRollForwardPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [open, setOpen] = useState<{ day: string; bucket: Bucket } | null>(null);

  const query = useQuery({
    queryKey: ["fuel", "relay-wallet-roll-forward", companyId],
    queryFn: () => getRelayWalletRollForward(companyId),
    enabled: Boolean(companyId),
  });

  const days = query.data?.days ?? [];
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
      <div className="rounded-sm border border-dashed border-gray-300 bg-gray-50 p-4 text-xs text-gray-700" data-testid="relay-wallet-page">
        Select an operating company to view the Relay wallet.
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="relay-wallet-page">
      <DataPanel
        title="Relay wallet — roll-forward"
        titleHint="Deposits − fuel fills − fill fees − lumper = balance, by Relay day. The 3.25% deposit fee is charged to the funding card, not the wallet."
      >
        {query.isError ? (
          <ListErrorBanner onRetry={() => void query.refetch()} message="The Relay wallet roll-forward could not be loaded." />
        ) : (
          <>
            {totals ? (
              <div className="mb-2 flex flex-wrap gap-4 text-xs text-[#1F2A44]" data-testid="relay-wallet-totals">
                <span>Deposits {money(totals.deposits_cents)}</span>
                <span>Fuel fills {money(totals.fills_cents)}</span>
                <span>Fill fees {money(totals.fill_fees_cents)}</span>
                <span>Lumper {money(totals.lumper_cents)}</span>
                <span className="font-semibold">Balance {money(totals.balance_cents)}</span>
                <span>Deposit fees (card) {money(totals.deposit_fees_cents)}</span>
              </div>
            ) : null}
            <ParityTable
              rows={days}
              columns={columns}
              loading={query.isPending}
              storageKey="fuel-relay-wallet-roll-forward"
              emptyText="No Relay deposits or fills yet."
              rowKey={(row) => row.day}
            />
          </>
        )}
      </DataPanel>
      {open && openDay ? (
        <DataPanel title={`${BUCKET_LABEL[open.bucket]} — ${formatDateUS(open.day)}`} titleHint="The documents behind this number">
          <div className="mb-2">
            <button type="button" className="rounded-sm border border-gray-300 px-2 py-1 text-xs" data-testid="relay-wallet-close" onClick={() => setOpen(null)}>
              Close
            </button>
          </div>
          <ParityTable
            rows={openDay[open.bucket]}
            columns={docColumns}
            loading={false}
            storageKey={`fuel-relay-wallet-docs-${open.bucket}`}
            emptyText="No documents."
            rowKey={(d) => d.id}
          />
        </DataPanel>
      ) : null}
    </div>
  );
}
