import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  createBankingRule,
  deleteBankingRule,
  getBankingRules,
  patchBankingRule,
} from "../../api/banking-wave2";
import { getCoaAccounts, getPlaidBankAccounts } from "../../api/banking";
import { PageHeader } from "../../components/layout/PageHeader";
import { ActionButton } from "../../components/shared/ActionButton";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";

export function BankingRulesPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [thenAccountId, setThenAccountId] = useState("");
  const [bankFilterId, setBankFilterId] = useState("");
  const [descriptionContains, setDescriptionContains] = useState("");
  const [priority, setPriority] = useState("0");

  const rulesQuery = useQuery({
    queryKey: ["banking", "rules", companyId],
    queryFn: () => getBankingRules(companyId),
    enabled: Boolean(companyId),
  });

  const coaQuery = useQuery({
    queryKey: ["catalogs", "coa", "banking-rules"],
    queryFn: () => getCoaAccounts(),
    enabled: Boolean(companyId),
  });

  const banksQuery = useQuery({
    queryKey: ["banking", "plaid-accounts", companyId, "rules"],
    queryFn: () => getPlaidBankAccounts(companyId),
    enabled: Boolean(companyId),
  });

  const createMut = useMutation({
    mutationFn: () =>
      createBankingRule(companyId, {
        priority: Number(priority) || 0,
        description_contains: descriptionContains.trim() || undefined,
        bank_account_filter_id: bankFilterId || undefined,
        then_account_id: thenAccountId,
      }),
    onSuccess: () => {
      pushToast("Rule created", "success");
      setCreateOpen(false);
      setThenAccountId("");
      setBankFilterId("");
      setDescriptionContains("");
      void qc.invalidateQueries({ queryKey: ["banking", "rules"] });
    },
    onError: (e) => pushToast(String((e as Error).message ?? "Create failed"), "error"),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => patchBankingRule(id, companyId, { is_active: active }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["banking", "rules"] }),
    onError: (e) => pushToast(String((e as Error).message ?? "Update failed"), "error"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteBankingRule(id, companyId),
    onSuccess: () => {
      pushToast("Rule deleted", "success");
      void qc.invalidateQueries({ queryKey: ["banking", "rules"] });
    },
    onError: (e) => pushToast(String((e as Error).message ?? "Delete failed"), "error"),
  });

  const items = rulesQuery.data?.items ?? [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Banking rules"
        subtitle="Auto-suggest vendors and accounts from description, amount, and bank account filters."
        actions={
          <ActionButton
            type="button"
            className="bg-blue-600 text-white"
            aria-label="Create banking rule"
            disabled={!companyId}
            onClick={() => setCreateOpen(true)}
          >
            + Rule
          </ActionButton>
        }
      />

      {!companyId ? <p className="text-sm text-amber-800">Select an operating company.</p> : null}
      {rulesQuery.isError ? <ListErrorBanner onRetry={() => void rulesQuery.refetch()} /> : null}

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-600">
            <tr>
              <th className="px-3 py-2">Priority</th>
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Then account</th>
              <th className="px-3 py-2">Active</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => {
              const id = String(r.id ?? "");
              const p = Number(r.priority ?? 0);
              const desc = String(r.description_contains ?? r.description_regex ?? "—");
              const amt =
                r.amount_min_cents != null || r.amount_max_cents != null
                  ? `${r.amount_min_cents ?? "∞"} – ${r.amount_max_cents ?? "∞"}`
                  : "—";
              const acct = String(r.then_account_id ?? "—");
              const active = r.is_active !== false;
              return (
                <tr key={id} className="border-b border-gray-100">
                  <td className="px-3 py-2 font-mono text-xs">{p}</td>
                  <td className="px-3 py-2">{desc}</td>
                  <td className="px-3 py-2 text-xs text-gray-600">{amt}</td>
                  <td className="px-3 py-2 font-mono text-xs">{acct}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="text-xs font-medium text-blue-700 underline"
                      aria-label={active ? "Deactivate rule" : "Activate rule"}
                      onClick={() => void toggleMut.mutateAsync({ id, active: !active })}
                    >
                      {active ? "On" : "Off"}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="text-xs text-red-700 underline"
                      aria-label="Delete rule"
                      onClick={() => {
                        if (window.confirm("Delete this rule?")) void deleteMut.mutateAsync(id);
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rulesQuery.isLoading && items.length === 0 ? <p className="p-4 text-sm text-gray-600">No rules yet.</p> : null}
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create banking rule" sizePreset="md" resizable modalKind="banking-rule-create">
        <div className="space-y-3 text-sm">
          <label className="block">
            Priority
            <input className="mt-1 w-full rounded border px-2 py-1" value={priority} onChange={(e) => setPriority(e.target.value)} />
          </label>
          <label className="block">
            Description contains
            <input className="mt-1 w-full rounded border px-2 py-1" value={descriptionContains} onChange={(e) => setDescriptionContains(e.target.value)} />
          </label>
          <label className="block">
            Bank account filter (optional)
            <select
              className="mt-1 w-full rounded border px-2 py-1"
              value={bankFilterId}
              onChange={(e) => setBankFilterId(e.target.value)}
            >
              <option value="">Any</option>
              {(banksQuery.data?.accounts ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {(b.institution_name || "") + " — " + (b.account_name || "")}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            Then account (required)
            <select className="mt-1 w-full rounded border px-2 py-1" value={thenAccountId} onChange={(e) => setThenAccountId(e.target.value)}>
              <option value="">—</option>
              {(coaQuery.data?.accounts ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.account_number ? `${a.account_number} · ` : ""}
                  {a.account_name}
                </option>
              ))}
            </select>
          </label>
          <ActionButton
            type="button"
            className="w-full bg-blue-600 text-white"
            aria-label="Save banking rule"
            disabled={!thenAccountId || createMut.isPending}
            onClick={() => void createMut.mutateAsync()}
          >
            Save rule
          </ActionButton>
        </div>
      </Modal>
    </div>
  );
}
