/**
 * M7 — ScentsX bank deposits (CC-2 ROUND L.34, 03:00 UTC 2026-11-28).
 * Moves undeposited receipts from 1090 Undeposited Funds → 1000 Operating Checking using the
 * existing accounting/bank-deposits engine (createBankDeposit). Lists past deposits. No new GL math.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { DatePicker } from "../../components/forms/DatePicker";
import { ParityTable } from "../../components/parity/ParityTable";
import { ListErrorState } from "../../components/ListErrorState";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { companyToday } from "../../lib/businessDate";
import {
  createBankDeposit,
  listBankDeposits,
  listUndepositedReceipts,
  type BankDepositSummary,
  type UndepositedReceipt,
} from "../../api/bankDeposits";
import { getScentsxCompany, listScentsxAccounts } from "../../api/scentsx";
import { tr } from "./perfumeI18n";

const money = (cents: number | string) =>
  (Number(cents) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const usDate = (d: string | null) =>
  d ? new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

export function ScentsxDepositsPanel() {
  const co = useQuery({ queryKey: ["scentsx", "company"], queryFn: getScentsxCompany });
  const companyId = co.data?.company.id ?? null;
  if (co.isError) return <ListErrorState title="Couldn't load ScentsX" status={0} message={(co.error as Error)?.message} onRetry={() => void co.refetch()} />;
  if (!companyId) return null;
  return <DepositsContent companyId={companyId} />;
}

function DepositsContent({ companyId }: { companyId: string }) {
  const { pushToast } = useToast();
  const qc = useQueryClient();
  const undeposited = useQuery({
    queryKey: ["scentsx", "deposits", "undeposited", companyId],
    queryFn: () => listUndepositedReceipts(companyId),
  });
  const deposits = useQuery({
    queryKey: ["scentsx", "deposits", "list", companyId],
    queryFn: () => listBankDeposits(companyId, { limit: 50 }),
  });
  const accounts = useQuery({ queryKey: ["scentsx", "accounts"], queryFn: listScentsxAccounts });

  // Bank GL accounts: Asset type, account numbers in the 1000–1099 cash/bank range
  const banks = (accounts.data?.accounts ?? []).filter(
    (a) => a.account_type === "Asset" && /^10\d\d$/.test(a.account_number ?? "")
  );
  const operatingBank = banks.find((a) => a.account_number === "1000");

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bankId, setBankId] = useState<string>("");
  const [date, setDate] = useState(companyToday());
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);

  const receipts: UndepositedReceipt[] = undeposited.data?.rows ?? [];
  const totalSelected = receipts.filter((r) => selectedIds.includes(r.id)).reduce((s, r) => s + r.amount_cents, 0);

  const effectiveBankId = bankId || operatingBank?.id || banks[0]?.id || "";

  const deposit = async () => {
    if (!effectiveBankId || selectedIds.length === 0) return;
    setBusy(true);
    try {
      const res = await createBankDeposit({
        operating_company_id: companyId,
        bank_account_id: effectiveBankId,
        deposit_date: date,
        memo: memo.trim() || null,
        payment_ids: selectedIds.filter((id) => receipts.find((r) => r.id === id)?.kind === "customer_payment"),
        factoring_advance_ids: selectedIds.filter((id) => receipts.find((r) => r.id === id)?.kind === "factoring_advance"),
      });
      pushToast(
        `Deposit ${res.deposit.display_id} posted · JE ${res.deposit.journal_entry_id.slice(0, 8)} · ${money(res.deposit.amount_deposited_cents)}`,
        "success"
      );
      setSelectedIds([]);
      setMemo("");
      await Promise.all([undeposited.refetch(), deposits.refetch(), qc.invalidateQueries({ queryKey: ["scentsx", "accounts"] })]);
    } catch (e) {
      pushToast(userFacingApiError(e, "Deposit not recorded"), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 rounded-[3px] border border-[#D8E0E8] bg-white p-3" data-testid="scentsx-deposits-panel" aria-label="Bank deposits">
      <div className="text-card-title">{tr("scentsx.deposits.title", "Bank deposits · 1090 → 1000")}</div>
      <div className="text-xs text-[#64748B]">
        {tr("scentsx.deposits.note", "Select undeposited receipts and move them to the bank account.")}
      </div>

      <ParityTable<UndepositedReceipt>
        selectable
        cardTitle
        title={tr("scentsx.deposits.undeposited", "Undeposited receipts")}
        rows={receipts}
        rowKey={(r) => r.id}
        loading={undeposited.isLoading}
        storageKey="scentsx-undeposited-v1"
        emptyText="No undeposited receipts — 1090 is empty."
        onSelectionChange={setSelectedIds}
        columns={[
          { key: "receipt_date", label: "Date", sortable: true, cellClass: "text-right tabular-nums", render: (r) => usDate(r.receipt_date) },
          { className: "text-left", key: "payee_name", label: "Received from", sortable: true, render: (r) => r.payee_name ?? "—" },
          { className: "text-left", key: "display_id", label: "Ref", sortable: true, render: (r) => r.display_id ?? r.id.slice(0, 8) },
          { className: "text-left", key: "kind", label: "Type", sortable: true, render: (r) => r.kind === "customer_payment" ? "Payment" : "Factoring" },
          { key: "amount_cents", label: "Amount", sortable: true, kind: "number", cellClass: "text-right tabular-nums font-semibold", render: (r) => money(r.amount_cents) },
        ]}
      />

      {selectedIds.length > 0 ? (
        <div className="rounded-[3px] border border-[#D8E0E8] p-3 space-y-2" data-testid="scentsx-deposit-form">
          <div className="text-xs font-semibold text-[#1F2A44]">
            {tr("scentsx.deposits.form_title", "Make deposit")} · {selectedIds.length} receipt{selectedIds.length > 1 ? "s" : ""} · {money(totalSelected)}
          </div>
          <div className="flex flex-wrap items-end gap-2 text-xs">
            <label>
              {tr("scentsx.deposits.to_bank", "Deposit to")}
              <select
                className="ml-1 rounded border border-[#D1D5DB] bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#1B2333]"
                value={effectiveBankId}
                onChange={(e) => setBankId(e.target.value)}
                aria-label="Deposit to bank"
                data-testid="scentsx-deposit-bank"
              >
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>{`${b.account_number ?? ""} ${b.account_name}`.trim()}</option>
                ))}
              </select>
            </label>
            <label>
              {tr("scentsx.deposits.date", "Date")}
              <DatePicker aria-label="Deposit date" value={date} onChange={(v) => setDate(v || companyToday())} />
            </label>
            <label>
              {tr("scentsx.deposits.memo", "Memo")}
              <input
                className="ml-1 rounded border border-[#D1D5DB] bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#1B2333] w-[180px]"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="optional"
                aria-label="Deposit memo"
                data-testid="scentsx-deposit-memo"
              />
            </label>
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              className="h-[34px] px-3 text-xs"
              disabled={busy || !effectiveBankId}
              onClick={() => void deposit()}
              data-testid="scentsx-deposit-save"
            >
              {busy ? tr("scentsx.deposits.posting", "Posting…") : tr("scentsx.deposits.post", `Post deposit ${money(totalSelected)}`)}
            </Button>
          </div>
        </div>
      ) : null}

      <ParityTable<BankDepositSummary>
        selectable
        cardTitle
        title={tr("scentsx.deposits.history", "Recent deposits")}
        rows={deposits.data?.rows ?? []}
        rowKey={(r) => r.id}
        loading={deposits.isLoading}
        storageKey="scentsx-deposits-history-v1"
        exportFilename="ScentsX deposits"
        exportExcel
        emptyText="No deposits yet."
        columns={[
          { key: "deposit_date", label: "Date", sortable: true, cellClass: "text-right tabular-nums", render: (r) => usDate(r.deposit_date), exportValue: (r) => r.deposit_date },
          { className: "text-left", key: "display_id", label: "Deposit #", sortable: true, render: (r) => r.display_id, exportValue: (r) => r.display_id },
          { className: "text-left", key: "bank_account_name", label: "Bank", sortable: true, render: (r) => r.bank_account_name ?? "—", exportValue: (r) => r.bank_account_name ?? "" },
          { key: "amount_deposited_cents", label: "Amount", sortable: true, kind: "number", cellClass: "text-right tabular-nums font-semibold", render: (r) => money(r.amount_deposited_cents), exportValue: (r) => Number(r.amount_deposited_cents) / 100 },
          { className: "text-left", key: "voided_at", label: "Status", sortable: true, render: (r) => r.voided_at ? "Voided" : "Posted", exportValue: (r) => r.voided_at ? "Voided" : "Posted" },
        ]}
      />
    </section>
  );
}
