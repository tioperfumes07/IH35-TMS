import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { categorizeTransaction, getBankingSuggestions, splitTransaction } from "../../../api/banking";
import { Button } from "../../../components/Button";
import { useToast } from "../../../components/Toast";
import { ApplyToBillForm } from "./forms/ApplyToBillForm";
import { BillPaymentForm } from "./forms/BillPaymentForm";
import { CreateExpenseForm } from "./forms/CreateExpenseForm";
import { DriverSettlementForm } from "./forms/DriverSettlementForm";
import { FactoringAdvanceForm } from "./forms/FactoringAdvanceForm";
import { ManualJEForm } from "./forms/ManualJEForm";
import { SplitTransactionModal } from "./forms/SplitTransactionModal";
import { TransferForm } from "./forms/TransferForm";

const ACTIONS = [
  ["create_expense", "Create Expense"],
  ["apply_bill", "Apply Bill"],
  ["bill_payment", "Bill Payment"],
  ["transfer", "Transfer"],
  ["driver_settlement", "Driver Settlement"],
  ["split_transaction", "Split Transaction"],
  ["factoring_advance", "Factoring"],
  ["manual_je", "Manual JE"],
] as const;

type ActionType = (typeof ACTIONS)[number][0];

type Props = {
  open: boolean;
  transaction: Record<string, unknown> | null;
  operatingCompanyId: string;
  onClose: () => void;
  onSaved: () => void;
};

export function CategorizeDrawer({ open, transaction, operatingCompanyId, onClose, onSaved }: Props) {
  const { pushToast } = useToast();
  const [action, setAction] = useState<ActionType>("create_expense");
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [splitOpen, setSplitOpen] = useState(false);
  const txId = String(transaction?.id ?? "");

  const suggestionsQuery = useQuery({
    queryKey: ["banking", "suggestions", operatingCompanyId, txId],
    queryFn: () => getBankingSuggestions(txId, operatingCompanyId),
    enabled: open && Boolean(operatingCompanyId && txId),
  });

  const formNode = useMemo(() => {
    if (action === "create_expense") return <CreateExpenseForm value={form} onChange={setForm} />;
    if (action === "apply_bill") return <ApplyToBillForm value={form} onChange={setForm} />;
    if (action === "bill_payment") return <BillPaymentForm value={form} onChange={setForm} />;
    if (action === "transfer") return <TransferForm value={form} onChange={setForm} />;
    if (action === "driver_settlement") return <DriverSettlementForm value={form} onChange={setForm} />;
    if (action === "factoring_advance") return <FactoringAdvanceForm value={form} onChange={setForm} />;
    if (action === "manual_je") return <ManualJEForm value={form} onChange={setForm} />;
    return (
      <Button size="sm" variant="secondary" onClick={() => setSplitOpen(true)}>
        Open Split Modal
      </Button>
    );
  }, [action, form]);

  if (!open || !transaction) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <aside className="fixed right-0 top-0 z-50 h-full w-[480px] overflow-y-auto border-l border-gray-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Categorize Transaction</h3>
          <button type="button" className="text-xs text-gray-500 underline" onClick={onClose}>Close</button>
        </div>

        <section className="mb-3 rounded border border-gray-200 bg-gray-50 p-2 text-xs">
          <div className="font-semibold">Transaction Detail</div>
          <div className="mt-1">Date: {String(transaction.txn_date ?? "")}</div>
          <div>Description: {String(transaction.description ?? "")}</div>
          <div>Amount: ${Number(transaction.amount ?? 0).toFixed(2)}</div>
        </section>

        <section className="mb-3 rounded border border-gray-200 bg-white p-2 text-xs">
          <div className="mb-1 font-semibold">Suggestions</div>
          <div className="space-y-1">
            {(suggestionsQuery.data?.suggestions ?? []).slice(0, 3).map((sugg) => (
              <div key={String(sugg.id)} className="flex items-center justify-between rounded border border-gray-100 px-2 py-1">
                <div className="truncate">{String(sugg.category ?? "categorized")} · ${Number(sugg.amount ?? 0).toFixed(2)}</div>
                <button
                  type="button"
                  className="text-blue-700 underline"
                  onClick={() => {
                    void categorizeTransaction(txId, operatingCompanyId, {
                      action_type: String(sugg.category ?? "create_expense"),
                      payload: { source_suggestion_id: String(sugg.id ?? "") },
                    })
                      .then(() => {
                        pushToast("Suggestion applied", "success");
                        onSaved();
                        onClose();
                      })
                      .catch((error) => pushToast(String((error as Error).message || "Failed"), "error"));
                  }}
                >
                  Apply
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-3">
          <div className="mb-1 text-xs font-semibold">Actions</div>
          <div className="grid grid-cols-2 gap-1">
            {ACTIONS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`rounded border px-2 py-1 text-xs ${action === key ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-700"}`}
                onClick={() => setAction(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        <section className="mb-3 rounded border border-gray-200 bg-white p-2">
          {formNode}
        </section>

        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={onClose}>Save Draft</Button>
          <Button
            size="sm"
            onClick={() => {
              void categorizeTransaction(txId, operatingCompanyId, {
                action_type: action,
                linked_entity_id: typeof form.linked_entity_id === "string" ? form.linked_entity_id : undefined,
                payload: form,
              })
                .then(() => {
                  pushToast("Transaction categorized", "success");
                  onSaved();
                  onClose();
                })
                .catch((error) => pushToast(String((error as Error).message || "Failed"), "error"));
            }}
          >
            Save & Post to QBO
          </Button>
        </div>
      </aside>

      <SplitTransactionModal
        open={splitOpen}
        amount={Number(transaction.amount ?? 0)}
        onClose={() => setSplitOpen(false)}
        onSave={(lines) => {
          void splitTransaction(txId, operatingCompanyId, lines)
            .then(() => {
              pushToast("Split saved", "success");
              setSplitOpen(false);
              onSaved();
              onClose();
            })
            .catch((error) => pushToast(String((error as Error).message || "Split failed"), "error"));
        }}
      />
    </>
  );
}
