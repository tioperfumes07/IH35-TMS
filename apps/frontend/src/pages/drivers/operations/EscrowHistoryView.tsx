import { OperationsHistoryTable } from "../../../components/drivers/OperationsHistoryTable";

type Props = { driverId: string; operatingCompanyId: string };

export function EscrowHistoryView({ driverId, operatingCompanyId }: Props) {
  return (
    <OperationsHistoryTable
      driverId={driverId}
      operatingCompanyId={operatingCompanyId}
      subView="escrow-history"
      title="Escrow History"
      description="Escrow deposits, deductions and releases."
      columns={[
        { key: "entry_type", label: "Entry" },
        { key: "amount", label: "Amount" },
        { key: "running_balance", label: "Balance" },
        { key: "created_at", label: "Date" },
        // SAF-B22 — the hop back to the settlement that produced the movement. The ids were always
        // on driver_finance.escrow_ledger and were simply never selected, so an escrow balance could
        // not be traced to its source. entityKind renders the drill-through; idKey lets the cell
        // link on settlement_id while the column itself is that id.
        { key: "settlement_id", label: "Settlement", entityKind: "settlement", idKey: "settlement_id" },
        // SAF-B22 (GL leg) — the journal entry the movement posted to, resolved through
        // accounting.escrow_postings. This is the hop that makes the escrow subledger tie out to the
        // general ledger: NetSuite drills a subledger row to its GL impact and QuickBooks drills a
        // register line to the journal behind it. Blank when the posting is ambiguous or absent,
        // never a guessed entry.
        { key: "journal_entry_id", label: "Journal Entry", entityKind: "journal_entry", idKey: "journal_entry_id" },
        // SAF-B22 (bank leg) — the bank transaction that moved the cash, reached THROUGH the
        // settlement. Escrow is a withholding, not a separate cash movement: the money moves once,
        // when the settlement is paid. A direct escrow->bank FK would have been a modelling error.
        { key: "bank_transaction_id", label: "Bank Txn", entityKind: "bank_transaction", idKey: "bank_transaction_id" },
      ]}
    />
  );
}
