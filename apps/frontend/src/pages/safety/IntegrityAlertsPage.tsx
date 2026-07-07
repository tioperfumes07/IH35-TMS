import { useState } from "react";
import { formatDateUS } from "../../lib/formatDate";
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
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";

type Props = {
  operatingCompanyId: string;
};

type IntegrityAlertRow = Record<string, unknown>;
type IntegrityAlertRuleRow = Record<string, unknown>;

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

  // Migrated to the shared QBO-parity grid — columns, order, and the per-row "Open" action are
  // preserved verbatim (§7 additive-only).
  const alertColumns: Array<ParityColumn<IntegrityAlertRow>> = [
    { key: "created_at", label: "Created", sortable: true, render: (row) => formatDateUS(row.created_at) },
    { key: "alert_category", label: "Category", sortable: true, render: (row) => String(row.alert_category ?? "—") },
    { key: "severity", label: "Severity", sortable: true, render: (row) => String(row.severity ?? "—") },
    { key: "subject_type", label: "Subject", render: (row) => String(row.subject_type ?? "—") },
    { key: "resolution_status", label: "Status", sortable: true, render: (row) => String(row.resolution_status ?? "unresolved") },
    {
      key: "action",
      label: "Action",
      render: (row) => (
        <button type="button" className="text-slate-700 underline" onClick={() => setSelected(row)}>
          Open
        </button>
      ),
    },
  ];

  // Migrated to the shared QBO-parity grid — columns, order, and the per-row "Edit" action are
  // preserved verbatim (§7 additive-only).
  const ruleColumns: Array<ParityColumn<IntegrityAlertRuleRow>> = [
    { key: "rule_name", label: "Rule", sortable: true, render: (row) => String(row.rule_name ?? row.rule_code) },
    { key: "source_view", label: "Source view", render: (row) => String(row.source_view ?? "—") },
    { key: "severity", label: "Severity", sortable: true, render: (row) => String(row.severity ?? "—") },
    { key: "enabled", label: "Enabled", sortable: true, render: (row) => (row.enabled ? "Yes" : "No") },
    {
      key: "action",
      label: "Action",
      render: (row) => (
        <button
          type="button"
          className="text-slate-700 underline"
          onClick={() => {
            setEditingRule(row);
            setDraftRule({
              rule_code: String(row.rule_code ?? ""),
              rule_name: String(row.rule_name ?? ""),
              source_view: String(row.source_view ?? ""),
              alert_category: String(row.alert_category ?? ""),
              subject_type: String(row.subject_type ?? "driver"),
              severity: String(row.severity ?? "warning"),
              enabled: Boolean(row.enabled ?? true),
            });
            setCreateRuleOpen(true);
          }}
        >
          Edit
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-3" data-testid="integrity-alerts-page">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded-sm border px-3 py-1 text-xs font-semibold"
          style={pageTab === "inbox" ? { background: "#1f2a44", borderColor: "#1f2a44", color: "white" } : { background: "white", borderColor: "#cbd5e1", color: "#334155" }}
          onClick={() => setPageTab("inbox")}
        >
          Alerts inbox
        </button>
        <button
          type="button"
          className="rounded-sm border px-3 py-1 text-xs font-semibold"
          style={pageTab === "rules" ? { background: "#1f2a44", borderColor: "#1f2a44", color: "white" } : { background: "white", borderColor: "#cbd5e1", color: "#334155" }}
          onClick={() => setPageTab("rules")}
        >
          Rules
        </button>
        {pageTab === "inbox" ? (
          <button
            type="button"
            className="ml-auto rounded-sm bg-slate-700 px-3 py-1 text-xs font-semibold text-white"
            disabled={evaluateMutation.isPending}
            onClick={() => evaluateMutation.mutate()}
          >
            Run evaluator
          </button>
        ) : (
          <button
            type="button"
            className="ml-auto rounded-sm bg-slate-700 px-3 py-1 text-xs font-semibold text-white"
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
        <ParityTable<IntegrityAlertRow>
          columns={alertColumns}
          rows={rows}
          rowKey={(row) => String(row.id)}
          loading={alertsQuery.isLoading}
          emptyText="No active integrity alerts. Run the evaluator or wait for the scheduled job."
          storageKey="safety-integrity-alerts"
          exportFilename="integrity-alerts"
          filterBar={
            <div className="relative flex flex-wrap items-center gap-2">
              <input
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
                placeholder="Category"
              />
              <SelectCombobox value={severity} onChange={(event) => setSeverity(event.target.value)} className="rounded-sm border border-gray-300 px-2 py-1 text-xs">
                <option value="">All severities</option>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </SelectCombobox>
              <SelectCombobox value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-sm border border-gray-300 px-2 py-1 text-xs">
                <option value="">All statuses</option>
                <option value="unresolved">Unresolved</option>
                <option value="investigating">Investigating</option>
                <option value="false_positive">False positive</option>
                <option value="confirmed_action_taken">Confirmed action taken</option>
                <option value="dismissed">Dismissed</option>
              </SelectCombobox>
            </div>
          }
        />
      ) : (
        <ParityTable<IntegrityAlertRuleRow>
          columns={ruleColumns}
          rows={rules}
          rowKey={(row) => String(row.id)}
          loading={rulesQuery.isLoading}
          emptyText="No integrity alert rules."
          storageKey="safety-integrity-alert-rules"
          exportFilename="integrity-alert-rules"
          tableTestId="integrity-rules-panel"
        />
      )}

      {createRuleOpen ? (
        <div className="rounded-sm border border-gray-200 bg-white p-3 text-xs" data-testid="integrity-rule-editor">
          <h4 className="font-semibold text-gray-900">{editingRule ? "Edit rule" : "Create rule"}</h4>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {!editingRule ? (
              <label className="flex flex-col gap-1">
                Code
                <input
                  className="rounded-sm border px-2 py-1"
                  value={draftRule.rule_code}
                  onChange={(e) => setDraftRule((d) => ({ ...d, rule_code: e.target.value }))}
                />
              </label>
            ) : null}
            <label className="flex flex-col gap-1">
              Name
              <input
                className="rounded-sm border px-2 py-1"
                value={draftRule.rule_name}
                onChange={(e) => setDraftRule((d) => ({ ...d, rule_name: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1">
              Source view
              <input
                className="rounded-sm border px-2 py-1"
                value={draftRule.source_view}
                onChange={(e) => setDraftRule((d) => ({ ...d, source_view: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1">
              Alert category
              <input
                className="rounded-sm border px-2 py-1"
                value={draftRule.alert_category}
                onChange={(e) => setDraftRule((d) => ({ ...d, alert_category: e.target.value }))}
              />
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="rounded-sm bg-slate-700 px-3 py-1 font-semibold text-white"
              disabled={saveRuleMutation.isPending}
              onClick={() => saveRuleMutation.mutate()}
            >
              Save
            </button>
            <button type="button" className="rounded-sm border px-3 py-1" onClick={() => setCreateRuleOpen(false)}>
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
