import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createIntegrityAlertRule,
  evaluateIntegrityAlerts,
  getIntegrityAlertRules,
  getIntegrityAlerts,
  updateIntegrityAlertRule,
} from "../../api/safety";
import { IntegrityAlertDetailDrawer } from "./components/IntegrityAlertDetailDrawer";
import { SelectCombobox } from "../../components/shared/SelectCombobox";

type Props = {
  operatingCompanyId: string;
};

type PageTab = "inbox" | "rules";

export function IntegrityAlertsPage({ operatingCompanyId }: Props) {
  const queryClient = useQueryClient();
  const [pageTab, setPageTab] = useState<PageTab>("inbox");
  const [category, setCategory] = useState("");
  const [severity, setSeverity] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [editingRule, setEditingRule] = useState<Record<string, unknown> | null>(null);
  const [createRuleOpen, setCreateRuleOpen] = useState(false);
  const [draftRule, setDraftRule] = useState({
    rule_code: "",
    rule_name: "",
    source_view: "safety.v_fuel_mpg_anomalies",
    alert_category: "driver_mpg_anomaly",
    subject_type: "driver",
    severity: "warning",
    enabled: true,
  });

  const alertsQuery = useQuery({
    queryKey: ["safety", "integrity-alerts", operatingCompanyId, category, severity, status],
    queryFn: () =>
      getIntegrityAlerts(operatingCompanyId, {
        alert_category: category,
        severity,
        resolution_status: status,
      }),
    enabled: Boolean(operatingCompanyId),
  });

  const rulesQuery = useQuery({
    queryKey: ["safety", "integrity-alert-rules", operatingCompanyId],
    queryFn: () => getIntegrityAlertRules(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });

  const evaluateMutation = useMutation({
    mutationFn: () => evaluateIntegrityAlerts(operatingCompanyId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["safety", "integrity-alerts", operatingCompanyId] });
    },
  });

  const saveRuleMutation = useMutation({
    mutationFn: async () => {
      if (editingRule?.id) {
        return updateIntegrityAlertRule(String(editingRule.id), operatingCompanyId, {
          rule_name: draftRule.rule_name,
          source_view: draftRule.source_view,
          alert_category: draftRule.alert_category,
          subject_type: draftRule.subject_type,
          severity: draftRule.severity,
          enabled: draftRule.enabled,
        });
      }
      return createIntegrityAlertRule(operatingCompanyId, draftRule);
    },
    onSuccess: async () => {
      setCreateRuleOpen(false);
      setEditingRule(null);
      await queryClient.invalidateQueries({ queryKey: ["safety", "integrity-alert-rules", operatingCompanyId] });
    },
  });

  const rows = alertsQuery.data?.integrity_alerts ?? [];
  const rules = rulesQuery.data?.integrity_alert_rules ?? [];

  return (
    <div className="space-y-3" data-testid="integrity-alerts-page">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded border px-3 py-1 text-xs font-semibold"
          style={pageTab === "inbox" ? { background: "#1f2a44", borderColor: "#1f2a44", color: "white" } : { background: "white", borderColor: "#cbd5e1", color: "#334155" }}
          onClick={() => setPageTab("inbox")}
        >
          Alerts inbox
        </button>
        <button
          type="button"
          className="rounded border px-3 py-1 text-xs font-semibold"
          style={pageTab === "rules" ? { background: "#1f2a44", borderColor: "#1f2a44", color: "white" } : { background: "white", borderColor: "#cbd5e1", color: "#334155" }}
          onClick={() => setPageTab("rules")}
        >
          Rules
        </button>
        {pageTab === "inbox" ? (
          <button
            type="button"
            className="ml-auto rounded bg-slate-700 px-3 py-1 text-xs font-semibold text-white"
            disabled={evaluateMutation.isPending}
            onClick={() => evaluateMutation.mutate()}
          >
            Run evaluator
          </button>
        ) : (
          <button
            type="button"
            className="ml-auto rounded bg-slate-700 px-3 py-1 text-xs font-semibold text-white"
            data-testid="integrity-rule-create-btn"
            onClick={() => {
              setEditingRule(null);
              setCreateRuleOpen(true);
            }}
          >
            + Create rule
          </button>
        )}
      </div>

      {pageTab === "inbox" ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="rounded border border-gray-300 px-2 py-1 text-xs"
              placeholder="Category"
            />
            <SelectCombobox value={severity} onChange={(event) => setSeverity(event.target.value)} className="rounded border border-gray-300 px-2 py-1 text-xs">
              <option value="">All severities</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </SelectCombobox>
            <SelectCombobox value={status} onChange={(event) => setStatus(event.target.value)} className="rounded border border-gray-300 px-2 py-1 text-xs">
              <option value="">All statuses</option>
              <option value="unresolved">Unresolved</option>
              <option value="investigating">Investigating</option>
              <option value="false_positive">False positive</option>
              <option value="confirmed_action_taken">Confirmed action taken</option>
              <option value="dismissed">Dismissed</option>
            </SelectCombobox>
          </div>

          <div className="overflow-x-auto rounded border border-gray-200 bg-white">
            <table className="min-w-[980px] w-full text-left text-xs">
              <thead className="bg-gray-50 text-[10px] uppercase text-gray-600">
                <tr>
                  <th className="px-2 py-1">Created</th>
                  <th className="px-2 py-1">Category</th>
                  <th className="px-2 py-1">Severity</th>
                  <th className="px-2 py-1">Subject</th>
                  <th className="px-2 py-1">Status</th>
                  <th className="px-2 py-1">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={String(row.id)} className="border-t border-gray-100">
                    <td className="px-2 py-1">{String(row.created_at ?? "").slice(0, 10)}</td>
                    <td className="px-2 py-1">{String(row.alert_category ?? "—")}</td>
                    <td className="px-2 py-1">{String(row.severity ?? "—")}</td>
                    <td className="px-2 py-1">{String(row.subject_type ?? "—")}</td>
                    <td className="px-2 py-1">{String(row.resolution_status ?? "unresolved")}</td>
                    <td className="px-2 py-1">
                      <button type="button" className="text-blue-700 underline" onClick={() => setSelected(row)}>
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-2 py-3 text-center text-gray-500">
                      No active integrity alerts. Run the evaluator or wait for the scheduled job.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200 bg-white" data-testid="integrity-rules-panel">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-gray-50 text-[10px] uppercase text-gray-600">
              <tr>
                <th className="px-2 py-1">Rule</th>
                <th className="px-2 py-1">Source view</th>
                <th className="px-2 py-1">Severity</th>
                <th className="px-2 py-1">Enabled</th>
                <th className="px-2 py-1">Action</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={String(rule.id)} className="border-t border-gray-100">
                  <td className="px-2 py-1">{String(rule.rule_name ?? rule.rule_code)}</td>
                  <td className="px-2 py-1">{String(rule.source_view ?? "—")}</td>
                  <td className="px-2 py-1">{String(rule.severity ?? "—")}</td>
                  <td className="px-2 py-1">{rule.enabled ? "Yes" : "No"}</td>
                  <td className="px-2 py-1">
                    <button
                      type="button"
                      className="text-blue-700 underline"
                      onClick={() => {
                        setEditingRule(rule);
                        setDraftRule({
                          rule_code: String(rule.rule_code ?? ""),
                          rule_name: String(rule.rule_name ?? ""),
                          source_view: String(rule.source_view ?? ""),
                          alert_category: String(rule.alert_category ?? ""),
                          subject_type: String(rule.subject_type ?? "driver"),
                          severity: String(rule.severity ?? "warning"),
                          enabled: Boolean(rule.enabled ?? true),
                        });
                        setCreateRuleOpen(true);
                      }}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {createRuleOpen ? (
        <div className="rounded border border-gray-200 bg-white p-3 text-xs" data-testid="integrity-rule-editor">
          <h4 className="font-semibold text-gray-900">{editingRule ? "Edit rule" : "Create rule"}</h4>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {!editingRule ? (
              <label className="flex flex-col gap-1">
                Code
                <input
                  className="rounded border px-2 py-1"
                  value={draftRule.rule_code}
                  onChange={(e) => setDraftRule((d) => ({ ...d, rule_code: e.target.value }))}
                />
              </label>
            ) : null}
            <label className="flex flex-col gap-1">
              Name
              <input
                className="rounded border px-2 py-1"
                value={draftRule.rule_name}
                onChange={(e) => setDraftRule((d) => ({ ...d, rule_name: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1">
              Source view
              <input
                className="rounded border px-2 py-1"
                value={draftRule.source_view}
                onChange={(e) => setDraftRule((d) => ({ ...d, source_view: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1">
              Alert category
              <input
                className="rounded border px-2 py-1"
                value={draftRule.alert_category}
                onChange={(e) => setDraftRule((d) => ({ ...d, alert_category: e.target.value }))}
              />
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="rounded bg-slate-700 px-3 py-1 font-semibold text-white"
              disabled={saveRuleMutation.isPending}
              onClick={() => saveRuleMutation.mutate()}
            >
              Save
            </button>
            <button type="button" className="rounded border px-3 py-1" onClick={() => setCreateRuleOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <IntegrityAlertDetailDrawer
        open={Boolean(selected)}
        alert={selected}
        operatingCompanyId={operatingCompanyId}
        onClose={() => setSelected(null)}
        onUpdated={() => void queryClient.invalidateQueries({ queryKey: ["safety", "integrity-alerts", operatingCompanyId] })}
      />
    </div>
  );
}
