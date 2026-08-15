import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityPicker } from "../../components/parity/EntityPicker";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";

type Props = {
  operatingCompanyId: string;
};

type IntegrityAlertRow = Record<string, unknown>;
type IntegrityAlertRuleRow = Record<string, unknown>;

type PageTab = "inbox" | "rules";
const INTEGRITY_TAB_IDS = new Set<string>(["inbox", "rules"]);

function parseIntegrityAlertsTab(raw: string | null): PageTab {
  if (raw && INTEGRITY_TAB_IDS.has(raw)) return raw as PageTab;
  return "inbox";
}

export function IntegrityAlertsPage({ operatingCompanyId }: Props) {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const pageTab = parseIntegrityAlertsTab(searchParams.get("tab"));
  const setPageTab = (next: PageTab) => {
    const params = new URLSearchParams(searchParams);
    if (next === "inbox") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  };
  const [category, setCategory] = useState("");
  const [severity, setSeverity] = useState("");
  const [status, setStatus] = useState("");
  const subjectDriverFromUrl = searchParams.get("subject_driver_id")?.trim() ?? "";
  const subjectUnitFromUrl = searchParams.get("subject_unit_id")?.trim() ?? "";
  const subjectVendorFromUrl = searchParams.get("subject_vendor_id")?.trim() ?? "";
  // LST-F5163H: visible reverse subject filters (allowCreate=false); URL seeds pickers.
  const [driverFilter, setDriverFilter] = useState("");
  const [unitFilter, setUnitFilter] = useState("");
  const [vendorFilter, setVendorFilter] = useState("");
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

  useEffect(() => {
    if (subjectDriverFromUrl) setDriverFilter(subjectDriverFromUrl);
  }, [subjectDriverFromUrl]);
  useEffect(() => {
    if (subjectUnitFromUrl) setUnitFilter(subjectUnitFromUrl);
  }, [subjectUnitFromUrl]);
  useEffect(() => {
    if (subjectVendorFromUrl) setVendorFilter(subjectVendorFromUrl);
  }, [subjectVendorFromUrl]);

  const effectiveDriverId = driverFilter.trim() || subjectDriverFromUrl || undefined;
  const effectiveUnitId = unitFilter.trim() || subjectUnitFromUrl || undefined;
  const effectiveVendorId = vendorFilter.trim() || subjectVendorFromUrl || undefined;

  const alertsQuery = useQuery({
    queryKey: [
      "safety",
      "integrity-alerts",
      operatingCompanyId,
      category,
      severity,
      status,
      effectiveDriverId,
      effectiveUnitId,
      effectiveVendorId,
    ],
    queryFn: () =>
      getIntegrityAlerts(operatingCompanyId, {
        alert_category: category,
        severity,
        resolution_status: status,
        subject_driver_id: effectiveDriverId,
        subject_unit_id: effectiveUnitId,
        subject_vendor_id: effectiveVendorId,
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
  const alertId = searchParams.get("alert_id");
  useEffect(() => {
    if (!alertId) return;
    const match = rows.find((row) => String(row.id) === alertId);
    if (match) setSelected(match);
  }, [alertId, rows]);

  // Migrated to the shared QBO-parity grid — columns, order, and the per-row "Open" action are
  // preserved verbatim (§7 additive-only).
  const alertColumns: Array<ParityColumn<IntegrityAlertRow>> = [
    { key: "created_at", label: "Created", sortable: true, render: (row) => formatDateUS(row.created_at) },
    { key: "alert_category", label: "Category", sortable: true, render: (row) => String(row.alert_category ?? "—") },
    { key: "severity", label: "Severity", sortable: true, render: (row) => String(row.severity ?? "—") },
    { key: "subject_type", label: "Subject", render: (row) => String(row.subject_type ?? "—") },
    {
      key: "subject_link",
      label: "Linked to",
      render: (row) => {
        if (row.subject_driver_id) {
          return (
            <EntityLink
              kind="driver"
              id={String(row.subject_driver_id)}
              label={entityLabel(row.subject_driver_name, String(row.subject_driver_id), "Driver")}
            />
          );
        }
        if (row.subject_unit_id) {
          return (
            <EntityLink
              kind="unit"
              id={String(row.subject_unit_id)}
              label={entityLabel(row.subject_unit_number, String(row.subject_unit_id), "Unit")}
            />
          );
        }
        if (row.subject_vendor_id) {
          return (
            <EntityLink
              kind="vendor"
              id={String(row.subject_vendor_id)}
              label={entityLabel(row.subject_vendor_name, String(row.subject_vendor_id), "Vendor")}
            />
          );
        }
        return <span className="text-slate-400">—</span>;
      },
    },
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

      {pageTab === "inbox" && alertsQuery.isError ? (
        <ListErrorBanner message="Integrity alerts could not be loaded." onRetry={() => void alertsQuery.refetch()} />
      ) : null}
      {pageTab === "rules" && rulesQuery.isError ? (
        <ListErrorBanner message="Integrity alert rules could not be loaded." onRetry={() => void rulesQuery.refetch()} />
      ) : null}

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
              <label className="text-[11px] text-slate-600">
                Driver
                <EntityPicker
                  kind="driver"
                  operatingCompanyId={operatingCompanyId}
                  value={driverFilter || null}
                  onChange={(next) => setDriverFilter(next ?? "")}
                  allowCreate={false}
                  placeholder="All drivers"
                  className="mt-1"
                  dataTestId="integrity-alerts-filter-driver"
                />
              </label>
              <label className="text-[11px] text-slate-600">
                Unit
                <EntityPicker
                  kind="unit"
                  operatingCompanyId={operatingCompanyId}
                  value={unitFilter || null}
                  onChange={(next) => setUnitFilter(next ?? "")}
                  allowCreate={false}
                  placeholder="All units"
                  className="mt-1"
                  dataTestId="integrity-alerts-filter-unit"
                />
              </label>
              <label className="text-[11px] text-slate-600">
                Vendor
                <EntityPicker
                  kind="vendor"
                  operatingCompanyId={operatingCompanyId}
                  value={vendorFilter || null}
                  onChange={(next) => setVendorFilter(next ?? "")}
                  allowCreate={false}
                  placeholder="All vendors"
                  className="mt-1"
                  dataTestId="integrity-alerts-filter-vendor"
                />
              </label>
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
