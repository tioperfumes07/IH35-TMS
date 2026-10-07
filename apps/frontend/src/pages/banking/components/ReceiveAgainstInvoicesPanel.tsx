import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { listInvoices, type Invoice } from "../../../api/accounting";
import { getCoaAccounts, receivePaymentsAndMatchBankLine } from "../../../api/banking";
import { EntityLink } from "../../../components/shared/EntityLink";
import { ReferenceSelect } from "../../../components/parity/ReferenceSelect";
import { coaAccountReferenceOption } from "../../../components/parity/referenceOptionLabels";
import { MoneyInput } from "../../../components/forms/MoneyInput";
import { useToast } from "../../../components/Toast";
import { formatUsdCents } from "../../../lib/money";
import { formatDateUS } from "../../../lib/formatDate";
import { userFacingApiError } from "../../../lib/api-error-message";

/**
 * ROUND 433 B8 (owner) — "when several transactions match one deposit, the user must be able to select SEVERAL
 * invoices." A SELECTION MODEL, not a filter: tick any number of open invoices (any customers), set how much of each the
 * deposit pays (default: its open balance, capped at what is left of the deposit), and watch Deposit / Selected /
 * Remainder. Confirm creates one receive payment per customer FROM this bank line and matches them all to it in one
 * transaction (POST /api/v1/bank-recon/receive-and-match). A remainder is never dropped: it becomes a customer credit or
 * posts to a named difference account. Shown on deposits (money in) only.
 */
type Props = {
  operatingCompanyId: string;
  bankTransactionId: string;
  bankAmountCents: number;
  onReceived?: () => void;
};

type RemainderKind = "customer_credit" | "difference";

export function ReceiveAgainstInvoicesPanel({ operatingCompanyId, bankTransactionId, bankAmountCents, onReceived }: Props) {
  const { pushToast } = useToast();
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState<Map<string, number>>(new Map());
  const [remainderKind, setRemainderKind] = useState<RemainderKind>("customer_credit");
  const [creditCustomerId, setCreditCustomerId] = useState<string>("");
  const [differenceAccountId, setDifferenceAccountId] = useState<string>("");

  const invoicesQuery = useQuery({
    queryKey: ["banking", "receive-against-invoices", operatingCompanyId, search],
    queryFn: () => listInvoices(operatingCompanyId, { has_balance: true, search: search.trim() || undefined, limit: 200 }),
    enabled: Boolean(operatingCompanyId),
  });
  const coaQuery = useQuery({
    queryKey: ["banking", "receive-against-invoices", "coa", operatingCompanyId],
    queryFn: () => getCoaAccounts(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });

  const invoices: Invoice[] = useMemo(
    () => (invoicesQuery.data?.invoices ?? []).filter((i) => Number(i.amount_open_cents ?? 0) > 0),
    [invoicesQuery.data?.invoices]
  );
  const byId = useMemo(() => new Map(invoices.map((i) => [i.id, i])), [invoices]);
  const selectedCents = [...applied.values()].reduce((s, c) => s + c, 0);
  const remainderCents = bankAmountCents - selectedCents;
  const selectedCustomers = useMemo(() => {
    const m = new Map<string, string>();
    for (const id of applied.keys()) {
      const inv = byId.get(id);
      if (inv) m.set(inv.customer_id, inv.customer_name ?? "Customer");
    }
    return m;
  }, [applied, byId]);
  const creditCustomer = creditCustomerId && selectedCustomers.has(creditCustomerId) ? creditCustomerId : [...selectedCustomers.keys()][0] ?? "";

  const toggle = (inv: Invoice) => {
    setApplied((prev) => {
      const next = new Map(prev);
      if (next.has(inv.id)) next.delete(inv.id);
      else {
        const left = Math.max(0, bankAmountCents - [...prev.values()].reduce((s, c) => s + c, 0));
        next.set(inv.id, Math.min(Number(inv.amount_open_cents ?? 0), left || Number(inv.amount_open_cents ?? 0)));
      }
      return next;
    });
  };
  const setAmount = (id: string, cents: number | null) =>
    setApplied((prev) => {
      const next = new Map(prev);
      next.set(id, Math.max(0, cents ?? 0));
      return next;
    });

  const overApplied = [...applied.entries()].some(([id, c]) => c > Number(byId.get(id)?.amount_open_cents ?? Infinity));
  const blocker =
    applied.size === 0
      ? "Select at least one invoice."
      : [...applied.values()].some((c) => c <= 0)
        ? "Every selected invoice needs an amount."
        : overApplied
          ? "An amount is more than that invoice's open balance."
          : remainderCents < 0
            ? "The selected amounts are more than the deposit."
            : remainderCents > 0 && remainderKind === "difference" && !differenceAccountId
              ? "Name the difference account for the remainder."
              : remainderCents > 0 && remainderKind === "customer_credit" && !creditCustomer
                ? "Pick the customer who gets the credit."
                : null;

  const receive = useMutation({
    mutationFn: () =>
      receivePaymentsAndMatchBankLine({
        operating_company_id: operatingCompanyId,
        bank_transaction_id: bankTransactionId,
        applications: [...applied.entries()].map(([invoice_id, amount_cents]) => ({ invoice_id, amount_cents })),
        remainder:
          remainderCents > 0
            ? remainderKind === "difference"
              ? { kind: "difference", account_id: differenceAccountId }
              : { kind: "customer_credit", customer_id: creditCustomer }
            : null,
      }),
    onSuccess: (res) => {
      const n = res.result.payments.length;
      pushToast(`Received ${n} payment${n === 1 ? "" : "s"} against ${applied.size} invoice${applied.size === 1 ? "" : "s"} — deposit matched.`, "success");
      setApplied(new Map());
      onReceived?.();
    },
    onError: (error) => pushToast(userFacingApiError(error, "Receive and match failed"), "error"),
  });

  return (
    <section className="mb-3 rounded-sm border border-slate-200 bg-white p-2" data-testid="receive-against-invoices">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-section-header font-bold uppercase text-slate-600">Receive against open invoices</h3>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search invoice # or customer"
          className="h-[34px] w-60 rounded-sm border border-slate-300 px-2 text-xs"
          data-testid="receive-against-invoices-search"
        />
      </div>

      <div className="mb-2 grid grid-cols-3 gap-2 text-xs" data-testid="receive-against-invoices-arithmetic">
        <div>
          <div className="text-slate-500">Deposit</div>
          <div className="font-semibold tabular-nums">{formatUsdCents(bankAmountCents)}</div>
        </div>
        <div>
          <div className="text-slate-500">Selected</div>
          <div className="font-semibold tabular-nums" data-testid="receive-against-invoices-selected">{formatUsdCents(selectedCents)}</div>
        </div>
        <div>
          <div className="text-slate-500">Remainder</div>
          <div className={`font-semibold tabular-nums ${remainderCents < 0 ? "text-red-700" : ""}`} data-testid="receive-against-invoices-remainder">
            {formatUsdCents(remainderCents)}
          </div>
        </div>
      </div>

      <div className="max-h-72 overflow-auto rounded-sm border border-slate-200">
        <table className="w-full border-collapse text-xs tabular-nums" data-testid="receive-against-invoices-table">
          <thead className="sticky top-0 bg-slate-50 text-slate-600">
            <tr>
              <th className="w-8 px-2 py-1" />
              <th className="px-2 py-1 text-center">Invoice</th>
              <th className="px-2 py-1 text-center">Customer</th>
              <th className="px-2 py-1 text-center">Due</th>
              <th className="px-2 py-1 text-center">Open balance</th>
              <th className="px-2 py-1 text-center">Apply</th>
            </tr>
          </thead>
          <tbody>
            {invoicesQuery.isLoading ? (
              <tr><td colSpan={6} className="px-2 py-2 text-slate-500">Loading open invoices…</td></tr>
            ) : invoicesQuery.isError ? (
              <tr><td colSpan={6} className="px-2 py-2 text-red-700">Couldn't load open invoices.</td></tr>
            ) : invoices.length === 0 ? (
              <tr><td colSpan={6} className="px-2 py-2 text-slate-500">No open invoices.</td></tr>
            ) : (
              invoices.map((inv) => {
                const checked = applied.has(inv.id);
                return (
                  <tr key={inv.id} className="border-t border-slate-100" data-testid={`receive-invoice-row-${inv.id}`}>
                    <td className="px-2 py-1">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(inv)}
                        aria-label={`Select invoice ${inv.display_id}`}
                        data-testid={`receive-invoice-check-${inv.id}`}
                      />
                    </td>
                    <td className="px-2 py-1"><EntityLink kind="invoice" id={inv.id} label={inv.display_id} /></td>
                    <td className="px-2 py-1"><EntityLink kind="customer" id={inv.customer_id} label={inv.customer_name ?? "Customer"} /></td>
                    <td className="px-2 py-1 tabular-nums">{inv.due_date ? formatDateUS(inv.due_date) : "—"}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{formatUsdCents(Number(inv.amount_open_cents ?? 0))}</td>
                    <td className="w-32 px-2 py-1">
                      {checked ? (
                        <MoneyInput
                          valueCents={applied.get(inv.id) ?? 0}
                          onChangeCents={(c) => setAmount(inv.id, c)}
                          ariaLabel={`Amount applied to ${inv.display_id}`}
                        />
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {remainderCents > 0 && applied.size > 0 ? (
        <div className="mt-2 space-y-1 text-xs" data-testid="receive-against-invoices-remainder-home">
          <div className="text-slate-600">The deposit is {formatUsdCents(remainderCents)} more than the selected invoices. Where does it go?</div>
          <label className="mr-3 inline-flex items-center gap-1">
            <input type="radio" checked={remainderKind === "customer_credit"} onChange={() => setRemainderKind("customer_credit")} />
            Credit on account for
          </label>
          <select
            className="h-[34px] w-60 rounded-sm border border-slate-300 px-2 text-xs"
            value={creditCustomer}
            onChange={(e) => setCreditCustomerId(e.target.value)}
            disabled={remainderKind !== "customer_credit"}
            data-testid="receive-against-invoices-credit-customer"
          >
            {[...selectedCustomers.entries()].map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1">
              <input type="radio" checked={remainderKind === "difference"} onChange={() => setRemainderKind("difference")} />
              Difference account
            </label>
            <div className="w-72">
              <ReferenceSelect
                value={differenceAccountId || null}
                onChange={(aid) => setDifferenceAccountId(aid ?? "")}
                options={(coaQuery.data?.accounts ?? []).map(coaAccountReferenceOption)}
                createKind="category"
                operatingCompanyId={operatingCompanyId}
                placeholder="Select difference account"
                onOptionCreated={() => void coaQuery.refetch()}
                disabled={remainderKind !== "difference"}
              />
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs text-slate-600" data-testid="receive-against-invoices-blocker">{blocker ?? ""}</span>
        <button
          type="button"
          className="rounded-sm border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-white hover:bg-slate-800 disabled:opacity-60"
          disabled={Boolean(blocker) || receive.isPending}
          onClick={() => receive.mutate()}
          data-testid="receive-against-invoices-confirm"
        >
          {receive.isPending ? "Receiving…" : `Receive ${applied.size} invoice${applied.size === 1 ? "" : "s"} and match`}
        </button>
      </div>
    </section>
  );
}
