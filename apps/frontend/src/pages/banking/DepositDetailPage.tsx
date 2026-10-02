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
              <table className="w-full border-collapse text-xs tabular-nums">
                <thead>
                  <tr className="border-b border-[#E5E7EB] text-center font-bold uppercase text-[#4B5563]">
                    <th className="px-2 py-[7px]">Type</th>
                    <th className="px-2 py-[7px]">Payment / Advance</th>
                    <th className="px-2 py-[7px]">Customer</th>
                    <th className="px-2 py-[7px]">Invoice</th>
                    <th className="px-2 py-[7px]">Load</th>
                    <th className="px-2 py-[7px]">Amount</th>
                    <th className="px-2 py-[7px]">Memo</th>
                  </tr>
                </thead>
                <tbody>
                  {(deposit.lines ?? []).map((line) => (
                    <tr key={line.id} className="border-b border-[#E5E7EB] text-center text-[#0F1219]">
                      <td className="px-2 py-[7px]">{(line.line_type ?? "—").replaceAll("_", " ")}</td>
                      <td className="px-2 py-[7px]">
                        {line.source_payment_id ? (
                          <EntityLink
                            kind="payment"
                            id={line.source_payment_id}
                            label={line.payment_display_id ?? "Payment"}
                          />
                        ) : line.source_factoring_advance_id ? (
                          <EntityLink
                            kind="factoring_advance"
                            id={line.source_factoring_advance_id}
                            label={line.factoring_advance_display_id ?? line.faro_invoice_number ?? "Advance"}
                          />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-2 py-[7px]">
                        {line.customer_id ? (
                          <EntityLink kind="customer" id={line.customer_id} label={line.customer_name ?? "Customer"} />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-2 py-[7px]">
                        {line.invoice_id ? (
                          <EntityLink kind="invoice" id={line.invoice_id} label={line.invoice_display_id ?? "Invoice"} />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-2 py-[7px]">
                        {line.load_id ? (
                          <EntityLink kind="load" id={line.load_id} label={line.load_number ?? "Load"} />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-2 py-[7px] tabular-nums">
                        {formatCurrencyFromCents(Number(line.amount_cents ?? 0))}
                      </td>
                      <td className="px-2 py-[7px]">{line.memo ?? "—"}</td>
                    </tr>
                  ))}
                  {(deposit.lines ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-2 py-[7px] text-center text-[#6B7280]">
                        No lines.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
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
