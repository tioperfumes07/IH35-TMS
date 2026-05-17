import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  applyCategorizationRuleHistorical,
  createCategorizationRule,
  deactivateCategorizationRule,
  getCategorizationPreview,
  getCategorizationRules,
  getCoaAccounts,
  type CategorizationRule,
  updateCategorizationRule,
} from "../../api/banking";
import { useAuth } from "../../auth/useAuth";
import { PageHeader } from "../../components/layout/PageHeader";
import { ActionButton } from "../../components/shared/ActionButton";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { SelectCombobox } from "../../components/shared/SelectCombobox";

function canAccess(role?: string) {
  return role === "Owner" || role === "Administrator" || role === "Accountant";
}

export function CategorizationRulesPage() {
  const auth = useAuth();
  const { selectedCompanyId } = useCompanyContext();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const companyId = selectedCompanyId ?? "";
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [dragRuleId, setDragRuleId] = useState<string | null>(null);
  const [pattern, setPattern] = useState("");
  const [priority, setPriority] = useState("100");
  const [coaAccountId, setCoaAccountId] = useState("");
  const [saving, setSaving] = useState(false);

  const rulesQuery = useQuery({
    queryKey: ["banking", "categorization-rules", companyId],
    queryFn: () => getCategorizationRules(companyId),
    enabled: Boolean(companyId && canAccess(auth.user?.role)),
  });
  const accountsQuery = useQuery({
    queryKey: ["banking", "coa-accounts"],
    queryFn: () => getCoaAccounts(),
    enabled: canAccess(auth.user?.role),
  });
  const previewQuery = useQuery({
    queryKey: ["banking", "categorization-rules-preview", companyId],
    queryFn: () => getCategorizationPreview(companyId),
    enabled: Boolean(companyId && canAccess(auth.user?.role)),
  });

  const rules = rulesQuery.data?.rules ?? [];
  const selectedRule = rules.find((rule) => rule.id === selectedRuleId) ?? null;

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["banking", "categorization-rules", companyId] }),
      queryClient.invalidateQueries({ queryKey: ["banking", "categorization-rules-preview", companyId] }),
      queryClient.invalidateQueries({ queryKey: ["banking", "categorization-rules-stats", companyId] }),
    ]);
  };

  const coaLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const account of accountsQuery.data?.accounts ?? []) {
      map.set(account.id, `${account.account_number} - ${account.account_name}`);
    }
    return map;
  }, [accountsQuery.data?.accounts]);

  if (!canAccess(auth.user?.role)) {
    return (
      <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        Auto-categorization rules are available to Owner/Admin/Accountant roles.
      </div>
    );
  }

  async function onSaveRule() {
    const nextPattern = (selectedRule ? pattern || selectedRule.plaid_category_pattern : pattern).trim();
    const nextPriority = Number(selectedRule ? priority || String(selectedRule.priority) : priority || "100");
    const nextCoa = selectedRule ? (coaAccountId || selectedRule.coa_account_id || null) : (coaAccountId || null);
    if (!nextPattern) {
      pushToast("Pattern is required", "error");
      return;
    }
    setSaving(true);
    try {
      if (selectedRule) {
        await updateCategorizationRule(selectedRule.id, companyId, {
          plaid_category_pattern: nextPattern,
          coa_account_id: nextCoa,
          priority: nextPriority,
        });
      } else {
        await createCategorizationRule(companyId, {
          plaid_category_pattern: nextPattern,
          coa_account_id: nextCoa,
          priority: nextPriority,
        });
      }
      setPattern("");
      setPriority("100");
      setCoaAccountId("");
      setSelectedRuleId(null);
      await refresh();
      pushToast(selectedRule ? "Rule updated" : "Rule created", "success");
    } catch (error) {
      pushToast(String((error as Error)?.message ?? "Save failed"), "error");
    } finally {
      setSaving(false);
    }
  }

  async function onApplyHistorical() {
    if (!selectedRuleId) {
      pushToast("Select a rule first", "error");
      return;
    }
    setSaving(true);
    try {
      const result = await applyCategorizationRuleHistorical(selectedRuleId, companyId);
      pushToast(`Historical apply matched ${result.matched} transactions`, "success");
      await refresh();
    } catch (error) {
      pushToast(String((error as Error)?.message ?? "Apply historical failed"), "error");
    } finally {
      setSaving(false);
    }
  }

  async function onDeactivate(rule: CategorizationRule) {
    setSaving(true);
    try {
      await deactivateCategorizationRule(rule.id, companyId);
      if (selectedRuleId === rule.id) setSelectedRuleId(null);
      await refresh();
      pushToast("Rule deactivated", "success");
    } catch (error) {
      pushToast(String((error as Error)?.message ?? "Deactivate failed"), "error");
    } finally {
      setSaving(false);
    }
  }

  async function onDropRule(targetRuleId: string) {
    if (!dragRuleId || dragRuleId === targetRuleId) return;
    const ordered = [...rules];
    const fromIndex = ordered.findIndex((rule) => rule.id === dragRuleId);
    const toIndex = ordered.findIndex((rule) => rule.id === targetRuleId);
    if (fromIndex < 0 || toIndex < 0) return;
    const [moved] = ordered.splice(fromIndex, 1);
    ordered.splice(toIndex, 0, moved);

    setSaving(true);
    try {
      for (let i = 0; i < ordered.length; i += 1) {
        const nextPriority = (i + 1) * 10;
        if (ordered[i].priority !== nextPriority) {
          await updateCategorizationRule(ordered[i].id, companyId, { priority: nextPriority });
        }
      }
      await refresh();
      pushToast("Rule priorities updated", "success");
    } catch (error) {
      pushToast(String((error as Error)?.message ?? "Reorder failed"), "error");
    } finally {
      setSaving(false);
      setDragRuleId(null);
    }
  }

  return (
    <div className="space-y-3">
      <PageHeader title="Auto-Categorize Rules" subtitle="Map Plaid category patterns to Chart of Accounts" />
      {rulesQuery.isError || previewQuery.isError || accountsQuery.isError ? <ListErrorBanner onRetry={() => void refresh()} /> : null}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <div className="rounded border border-gray-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Rules</p>
            <ActionButton disabled={saving} onClick={() => setSelectedRuleId(null)}>
              Add Rule
            </ActionButton>
          </div>
          <div className="space-y-2">
            {rules.map((rule) => (
              <button
                key={rule.id}
                type="button"
                draggable
                onDragStart={() => setDragRuleId(rule.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => void onDropRule(rule.id)}
                onClick={() => {
                  setSelectedRuleId(rule.id);
                  setPattern(rule.plaid_category_pattern);
                  setPriority(String(rule.priority));
                  setCoaAccountId(rule.coa_account_id ?? "");
                }}
                className={`w-full rounded border px-2 py-2 text-left text-xs ${
                  selectedRuleId === rule.id ? "border-blue-300 bg-blue-50" : "border-gray-100 hover:bg-gray-50"
                }`}
              >
                <p className="font-semibold text-gray-900">
                  #{rule.priority} {rule.plaid_category_pattern}
                </p>
                <p className="text-gray-600">{rule.coa_account_id ? coaLookup.get(rule.coa_account_id) ?? "Mapped account" : "No account selected"}</p>
              </button>
            ))}
            {rules.length === 0 && !rulesQuery.isLoading ? <p className="text-sm text-gray-500">No active rules yet.</p> : null}
          </div>
        </div>

        <div className="rounded border border-gray-200 bg-white p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Rule Editor</p>
          <div className="space-y-2">
            <input
              value={pattern}
              onChange={(event) => {
                if (selectedRule) setSelectedRuleId(selectedRule.id);
                setPattern(event.target.value);
              }}
              placeholder="Pattern (e.g. FOOD_* or TRANSPORTATION.GAS)"
              className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
            />
            <input
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
              type="number"
              min={1}
              className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
            />
            <SelectCombobox
              value={coaAccountId}
              onChange={(event) => setCoaAccountId(event.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
            >
              <option value="">Select target COA account</option>
              {(accountsQuery.data?.accounts ?? []).map((account) => (
                <option key={account.id} value={account.id}>
                  {account.account_number} - {account.account_name}
                </option>
              ))}
            </SelectCombobox>
            <div className="flex flex-wrap gap-2 pt-1">
              <ActionButton disabled={saving} onClick={() => void onSaveRule()}>
                {saving ? "Saving..." : "Save Rule"}
              </ActionButton>
              <ActionButton disabled={saving || !selectedRule} onClick={() => void onApplyHistorical()}>
                Apply to Historical Transactions
              </ActionButton>
              {selectedRule ? (
                <ActionButton disabled={saving} onClick={() => void onDeactivate(selectedRule)}>
                  Deactivate
                </ActionButton>
              ) : null}
            </div>
          </div>
        </div>

        <div className="rounded border border-gray-200 bg-white p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Preview (Last 50 Transactions)</p>
          <div className="space-y-2">
            {(previewQuery.data?.transactions ?? []).map((tx) => (
              <div key={tx.id} className="rounded border border-gray-100 px-2 py-1 text-xs">
                <p className="font-medium text-gray-900">{tx.description || "(No description)"}</p>
                <p className="text-gray-600">{(tx.plaid_category ?? []).join(" / ") || "No Plaid category"}</p>
                <p className={tx.coa_account_id ? "text-green-700" : "text-amber-700"}>
                  {tx.coa_account_id
                    ? `Matched: ${tx.account_number || ""} ${tx.account_name || ""}`.trim()
                    : "Unmatched"}
                </p>
              </div>
            ))}
            {(previewQuery.data?.transactions ?? []).length === 0 && !previewQuery.isLoading ? (
              <p className="text-sm text-gray-500">No transactions available for preview.</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

