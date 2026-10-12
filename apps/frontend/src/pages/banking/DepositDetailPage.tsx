// TABLE_DATE_OMIT: this table has no date column by design — the lines of ONE deposit; the deposit date is shown in the header above, a line has no date of its own.
/**
 * B-1 §5 — Deposit original document: lines + JE + online banking match banner / Unmatch.
 * Register Edit for source_transaction_type=bank_deposit opens this page.
 */
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { Button } from "../../components/Button";
import { EntityLink } from "../../components/shared/EntityLink";
import { OnlineBankingMatchBanner } from "../../components/accounting/OnlineBankingMatchBanner";
import { VoidedBanner } from "../../components/accounting/VoidedBanner";
import { NavyPageSubNav } from "../../components/layout/NavyPageSubNav";
import { BANKING_MODULE_TABS, BANKING_SUBNAV_TAB_IDS } from "./BANKING_NAV_CONFIG";
import { BANKING_TAB_PATH } from "../../router/route-manifest";
import { getBankDeposit, voidBankDeposit } from "../../api/bankDeposits";
import { formatCurrencyFromCents } from "../lists/accounting/coa-list-utils";
import { formatDateUS } from "../../lib/formatDate";
import { userFacingApiError } from "../../lib/api-error-message";
import { useToast } from "../../components/Toast";
import { ParityTable } from "../../components/parity/ParityTable";

type DepositLine = NonNullable<NonNullable<Awaited<ReturnType<typeof getBankDeposit>>["deposit"]>["lines"]>[number];

export function DepositDetailPage() {
  const { id = "" } = useParams();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [voidReason, setVoidReason] = useState("");
  const [voidOpen, setVoidOpen] = useState(false);

  const query = useQuery({
    queryKey: ["bank-deposits", "detail", companyId, id],
    queryFn: () => getBankDeposit(companyId, id),
    enabled: Boolean(companyId && id),
  });

  const voidMut = useMutation({
    mutationFn: () => voidBankDeposit(id, { operating_company_id: companyId, reason: voidReason.trim() }),
    onSuccess: () => {
      pushToast("Deposit voided", "success");
      setVoidOpen(false);
      setVoidReason("");
      void queryClient.invalidateQueries({ queryKey: ["bank-deposits"] });
    },
    onError: (err) => pushToast(userFacingApiError(err, "Could not void deposit"), "error"),
  });

  const deposit = query.data?.deposit;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F7F8FA]" data-testid="b1-deposit-detail">
      <NavyPageSubNav
        items={BANKING_MODULE_TABS.filter((t) => BANKING_SUBNAV_TAB_IDS.includes(t.id)).map((t) => ({
          label: t.label,
          to: t.id === "deposits" ? "/banking/deposits" : (BANKING_TAB_PATH[t.id] ?? "/banking"),
        }))}
      />
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {!companyId ? (
          <div className="text-xs text-red-600">Select an operating company in the shell header.</div>
        ) : query.isLoading ? (
          <div className="text-xs text-[#6B7280]">Loading…</div>
        ) : query.isError || !deposit ? (
          <div className="text-xs text-red-600">Deposit not found.</div>
        ) : (
          <div className="mx-auto flex max-w-4xl flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <Link to="/banking/deposits" className="text-xs text-[#14314F] hover:underline">
                  ← Deposits
                </Link>
                <h1 className="page-header-title">{deposit.display_id}</h1>
              </div>
              {!deposit.voided_at ? (
                <Button type="button" variant="secondary" onClick={() => setVoidOpen(true)}>
                  Void
                </Button>
              ) : null}
            </div>

            <VoidedBanner
              voidedAt={deposit.voided_at}
              voidReason={deposit.void_reason}
              voidedByUserId={deposit.voided_by_user_id}
              documentLabel="Deposit"
            />
            {deposit.matched_bank_transaction_id ? (
              <OnlineBankingMatchBanner
                companyId={companyId}
                bankTransactionId={deposit.matched_bank_transaction_id}
                txnDate={deposit.matched_bank_transaction_date}
                description={deposit.matched_bank_transaction_description}
                amountCents={deposit.matched_bank_transaction_amount_cents}
                invalidateKeys={[["bank-deposits", "detail", companyId, id]]}
              />
            ) : null}

            <div className="grid grid-cols-2 gap-3 rounded-sm border border-[#E5E7EB] bg-white p-3 text-xs sm:grid-cols-4">
              <div>
                <div className="font-bold uppercase text-[#4B5563]">Date</div>
                <div className="text-[#0F1219]">{formatDateUS(deposit.deposit_date)}</div>
              </div>
              <div>
                <div className="font-bold uppercase text-[#4B5563]">Bank</div>
                <div className="text-[#0F1219]">{deposit.bank_account_name ?? "—"}</div>
              </div>
              <div>
                <div className="font-bold uppercase text-[#4B5563]">Amount deposited</div>
                <div className="tabular-nums text-[#0F1219]">
                  {formatCurrencyFromCents(Number(deposit.amount_deposited_cents))}
                </div>
              </div>
              <div>
                <div className="font-bold uppercase text-[#4B5563]">Journal entry</div>
                <div>
                  {deposit.journal_entry_id ? (
                    <EntityLink kind="journal_entry" id={deposit.journal_entry_id} label="JE" />
                  ) : (
                    "—"
                  )}
                </div>
              </div>
              {deposit.memo ? (
                <div className="col-span-2 sm:col-span-4">
                  <div className="font-bold uppercase text-[#4B5563]">Memo</div>
                  <div className="text-[#0F1219]">{deposit.memo}</div>
                </div>
              ) : null}
            </div>

            <section className="rounded-sm border border-[#E5E7EB] bg-white p-3">
              <h2 className="mb-2 font-bold uppercase text-[#4B5563]">Lines</h2>
              <ParityTable<DepositLine>
                storageKey="deposit-detail-lines"
                tableTestId="deposit-detail-lines"
                rows={deposit.lines ?? []}
                rowKey={(line) => line.id}
                emptyText="No lines."
                suppressToolbarSearch
                suppressToolbarRange
                hidePager
                initialPageSize={300}
                columns={[
                  { key: "line_type", label: "Type", render: (line) => (line.line_type ?? "—").replaceAll("_", " ") },
                  {
                    key: "payment", label: "Payment / Advance", sortValue: (line) => line.payment_display_id ?? line.factoring_advance_display_id ?? "",
                    render: (line) =>
                      line.source_payment_id ? (
                        <EntityLink kind="payment" id={line.source_payment_id} label={line.payment_display_id ?? "Payment"} />
                      ) : line.source_factoring_advance_id ? (
                        <EntityLink
                          kind="factoring_advance"
                          id={line.source_factoring_advance_id}
                          label={line.factoring_advance_display_id ?? line.faro_invoice_number ?? "Advance"}
                        />
                      ) : (
                        "—"
                      ),
                  },
                  {
                    key: "customer", label: "Customer", sortValue: (line) => line.customer_name ?? line.received_from_customer_name ?? line.received_from_vendor_name ?? "",
                    render: (line) =>
                      line.customer_id ? (
                        <EntityLink kind="customer" id={line.customer_id} label={line.customer_name ?? "Customer"} />
                      ) : line.received_from_customer_id ? (
                        <EntityLink kind="customer" id={line.received_from_customer_id} label={line.received_from_customer_name ?? "Customer"} />
                      ) : line.received_from_vendor_id ? (
                        <EntityLink kind="vendor" id={line.received_from_vendor_id} label={line.received_from_vendor_name ?? "Vendor"} />
                      ) : (
                        "—"
                      ),
                  },
                  { key: "invoice_display_id", label: "Invoice", render: (line) => (line.invoice_id ? <EntityLink kind="invoice" id={line.invoice_id} label={line.invoice_display_id ?? "Invoice"} /> : "—") },
                  { key: "load_number", label: "Load", render: (line) => (line.load_id ? <EntityLink kind="load" id={line.load_id} label={line.load_number ?? "Load"} /> : "—") },
                  { key: "amount_cents", label: "Amount", kind: "money", sortValue: (line) => Number(line.amount_cents ?? 0), render: (line) => formatCurrencyFromCents(Number(line.amount_cents ?? 0)) },
                  { key: "memo", label: "Memo", render: (line) => line.memo ?? "—" },
                ]}
              />
            </section>

            {voidOpen ? (
              <div className="flex flex-wrap items-end gap-2 rounded-sm border border-[#E5E7EB] bg-white p-3">
                <label className="block">
                  <span className="mb-1 block font-bold uppercase text-[#4B5563]">Void reason</span>
                  <input
                    className="h-7 w-72 rounded-sm border border-[#E5E7EB] px-2 text-xs"
                    value={voidReason}
                    onChange={(e) => setVoidReason(e.target.value)}
                  />
                </label>
                <Button
                  type="button"
                  disabled={voidReason.trim().length < 3 || voidMut.isPending}
                  onClick={() => voidMut.mutate()}
                >
                  Confirm void
                </Button>
                <Button type="button" variant="secondary" onClick={() => setVoidOpen(false)}>
                  Cancel
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
