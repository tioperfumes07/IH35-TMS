import { useEffect, useRef, useState } from "react";
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
import { Button } from "../../components/Button";
import { useStagedListFilters } from "../../components/table";
import { userFacingApiError } from "../../lib/api-error-message";

type Props = {
  operatingCompanyId: string;
};

type IntegrityAlertRow = Record<string, unknown>;
type IntegrityAlertRuleRow = Record<string, unknown>;

type PageTab = "inbox" | "rules";
const INTEGRITY_TAB_IDS = new Set<string>(["inbox", "rules"]);

const EMPTY_FILTERS = {
  category: "",
  severity: "",
  status: "",
  driverId: "",
  unitId: "",
  vendorId: "",
};

const EMPTY_RULE_DRAFT = {
  rule_code: "",
  rule_name: "",
  source_view: "safety.v_fuel_mpg_anomalies",
  alert_category: "driver_mpg_anomaly",
  subject_type: "driver",
  severity: "warning",
  enabled: true,
};

function parseIntegrityAlertsTab(raw: string | null): PageTab {
  if (raw && INTEGRITY_TAB_IDS.has(raw)) return raw as PageTab;
  return "inbox";
}

export function IntegrityAlertsPage({ operatingCompanyId }: Props) {
  const pageSize = 50;
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const pageTab = parseIntegrityAlertsTab(searchParams.get("tab"));
  const setPageTab = (next: PageTab) => {
    const params = new URLSearchParams(searchParams);
    if (next === "inbox") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  };
  const subjectDriverFromUrl = searchParams.get("subject_driver_id")?.trim() ?? "";
  const subjectUnitFromUrl = searchParams.get("subject_unit_id")?.trim() ?? "";
  const subjectVendorFromUrl = searchParams.get("subject_vendor_id")?.trim() ?? "";
  // LST-F5163H: visible reverse subject filters (allowCreate=false); URL seeds pickers.
  // LV-SAFETY-INTEGRITY-ALERTS-FILTER-SILENT-APPLY — stage until Apply; Cancel restores.
  function patchSearchParam(next: { driverId: string; unitId: string; vendorId: string }) {
    const p = new URLSearchParams(searchParams);
    if (next.driverId) p.set("subject_driver_id", next.driverId);
    else p.delete("subject_driver_id");
    if (next.unitId) p.set("subject_unit_id", next.unitId);
    else p.delete("subject_unit_id");
    if (next.vendorId) p.set("subject_vendor_id", next.vendorId);
    else p.delete("subject_vendor_id");
    setSearchParams(p, { replace: true });
  }

  const [applied, setApplied] = useState(() => ({
    ...EMPTY_FILTERS,
    driverId: subjectDriverFromUrl,
    unitId: subjectUnitFromUrl,
    vendorId: subjectVendorFromUrl,
  }));
  const staged = useStagedListFilters({
    applied,
    empty: EMPTY_FILTERS,
    onApply: (next) => {
      setApplied(next);
      patchSearchParam(next);
    },
  });
  const draft = staged.draft;

  useEffect(() => {
    setApplied((prev) => ({
      ...prev,
      ...(subjectDriverFromUrl ? { driverId: subjectDriverFromUrl } : {}),
      ...(subjectUnitFromUrl ? { unitId: subjectUnitFromUrl } : {}),
      ...(subjectVendorFromUrl ? { vendorId: subjectVendorFromUrl } : {}),
    }));
  }, [subjectDriverFromUrl, subjectUnitFromUrl, subjectVendorFromUrl]);

  function setDriverFilter(next: string) {
    staged.setDraft((d) => ({ ...d, driverId: next }));
  }
  function setUnitFilter(next: string) {
    staged.setDraft((d) => ({ ...d, unitId: next }));
  }
  function setVendorFilter(next: string) {
    staged.setDraft((d) => ({ ...d, vendorId: next }));
  }

  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [editingRule, setEditingRule] = useState<Record<string, unknown> | null>(null);
  const [createRuleOpen, setCreateRuleOpen] = useState(false);
  const [draftRule, setDraftRule] = useState(EMPTY_RULE_DRAFT);
  const lifecycleGenerationRef = useRef(0);

  const alertsQuery = useQuery({
    queryKey: [
      "safety",
      "integrity-alerts",
      operatingCompanyId,
      applied.category,
      applied.severity,
      applied.status,
      applied.driverId,
      applied.unitId,
      applied.vendorId,
      page,
    ],
    queryFn: () =>
      getIntegrityAlerts(operatingCompanyId, {
        alert_category: applied.category || undefined,
        severity: applied.severity || undefined,
        resolution_status: applied.status || undefined,
        subject_driver_id: applied.driverId || undefined,
        subject_unit_id: applied.unitId || undefined,
        subject_vendor_id: applied.vendorId || undefined,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
    enabled: Boolean(operatingCompanyId),
  });
  const totalCount = alertsQuery.isError ? 0 : alertsQuery.data?.total_count ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  useEffect(() => setPage(1), [operatingCompanyId, applied.category, applied.severity, applied.status, applied.driverId, applied.unitId, applied.vendorId]);

  const rulesQuery = useQuery({
    queryKey: ["safety", "integrity-alert-rules", operatingCompanyId],
    queryFn: () => getIntegrityAlertRules(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });

  const evaluateMutation = useMutation({
    mutationFn: (input: { companyId: string; generation: number }) => evaluateIntegrityAlerts(input.companyId),
    onSuccess: async (_result, input) => {
      if (input.generation !== lifecycleGenerationRef.current) return;
      await queryClient.invalidateQueries({ queryKey: ["safety", "integrity-alerts", input.companyId] });
    },
  });

  const saveRuleMutation = useMutation({
    mutationFn: async (input: { companyId: string; generation: number; ruleId: string | null; payload: Record<string, unknown> }) => {
      if (input.ruleId) {
        return updateIntegrityAlertRule(input.ruleId, input.companyId, input.payload);
      }
      return createIntegrityAlertRule(input.companyId, input.payload);
    },
    onSuccess: async (_result, input) => {
      if (input.generation !== lifecycleGenerationRef.current) return;
      setCreateRuleOpen(false);
      setEditingRule(null);
      setDraftRule(EMPTY_RULE_DRAFT);
      await queryClient.invalidateQueries({ queryKey: ["safety", "integrity-alert-rules", input.companyId] });
    },
  });

  useEffect(() => {
    lifecycleGenerationRef.current += 1;
    evaluateMutation.reset();
    saveRuleMutation.reset();
    setSelected(null);
    setEditingRule(null);
    setCreateRuleOpen(false);
    setDraftRule(EMPTY_RULE_DRAFT);
  }, [operatingCompanyId]); // Mutation reset functions are stable; company transitions own fresh alert action state.

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
            onClick={() => evaluateMutation.mutate({ companyId: operatingCompanyId, generation: lifecycleGenerationRef.current })}
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

      {evaluateMutation.isError ? (
        <p className="text-xs text-red-700" data-testid="integrity-evaluate-error">
          {userFacingApiError(evaluateMutation.error, "Could not run the integrity evaluator.")}
        </p>
      ) : null}

      {pageTab === "inbox" && alertsQuery.isError ? (
        <ListErrorBanner message="Integrity alerts could not be loaded." onRetry={() => void alertsQuery.refetch()} />
      ) : null}
      {pageTab === "rules" && rulesQuery.isError ? (
        <ListErrorBanner message="Integrity alert rules could not be loaded." onRetry={() => void rulesQuery.refetch()} />
      ) : null}

      {pageTab === "inbox" ? (
        <>
        <ParityTable<IntegrityAlertRow>
          columns={alertColumns}
          rows={rows}
          rowKey={(row) => String(row.id)}
          loading={alertsQuery.isLoading}
          emptyText="No active integrity alerts. Run the evaluator or wait for the scheduled job."
          storageKey="safety-integrity-alerts"
          exportFilename="integrity-alerts"
          pageSize={pageSize}
          pageSizeOptions={[pageSize]}
          hidePager
          filterBar={
            <div className="relative flex flex-wrap items-end gap-2" data-testid="integrity-alerts-filters">
              <input
                value={draft.category}
                onChange={(event) => staged.setDraft((d) => ({ ...d, category: event.target.value }))}
                className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
                placeholder="Category"
              />
              <SelectCombobox
                value={draft.severity}
                onChange={(event) => staged.setDraft((d) => ({ ...d, severity: event.target.value }))}
                className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
              >
                <option value="">All severities</option>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </SelectCombobox>
              <SelectCombobox
                value={draft.status}
                onChange={(event) => staged.setDraft((d) => ({ ...d, status: event.target.value }))}
                className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
              >
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
                  value={draft.driverId || null}
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
                  value={draft.unitId || null}
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
                  value={draft.vendorId || null}
                  onChange={(next) => setVendorFilter(next ?? "")}
                  allowCreate={false}
                  placeholder="All vendors"
                  className="mt-1"
                  dataTestId="integrity-alerts-filter-vendor"
                />
              </label>
              <Button type="button" size="sm" data-testid="integrity-alerts-filter-apply" onClick={staged.apply} disabled={!staged.dirty}>
                Apply
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                data-testid="integrity-alerts-filter-cancel"
                onClick={staged.cancel}
                disabled={!staged.dirty}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                data-testid="integrity-alerts-filter-reset"
                onClick={() => {
                  staged.cancel();
                  setApplied(EMPTY_FILTERS);
                  patchSearchParam(EMPTY_FILTERS);
                }}
              >
                Reset
              </Button>
            </div>
          }
        />
        {totalCount > pageSize ? (
          <div className="flex items-center justify-end gap-2 text-xs" data-testid="integrity-alerts-server-pager">
            <Button size="sm" variant="secondary" disabled={page <= 1 || alertsQuery.isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button>
            <span className="text-gray-600">Page {page} of {pageCount} · {totalCount} alerts</span>
            <Button size="sm" variant="secondary" disabled={page >= pageCount || alertsQuery.isFetching} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Next</Button>
          </div>
        ) : null}
        </>
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
          {saveRuleMutation.isError ? (
            <p className="mt-2 text-xs text-red-700" data-testid="integrity-rule-save-error">
              {userFacingApiError(saveRuleMutation.error, "Could not save the integrity alert rule.")}
            </p>
          ) : null}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="rounded-sm bg-slate-700 px-3 py-1 font-semibold text-white"
              disabled={saveRuleMutation.isPending}
              onClick={() => saveRuleMutation.mutate({
                companyId: operatingCompanyId,
                generation: lifecycleGenerationRef.current,
                ruleId: editingRule?.id ? String(editingRule.id) : null,
                payload: editingRule?.id ? {
                  rule_name: draftRule.rule_name,
                  source_view: draftRule.source_view,
                  alert_category: draftRule.alert_category,
                  subject_type: draftRule.subject_type,
                  severity: draftRule.severity,
                  enabled: draftRule.enabled,
                } : { ...draftRule },
              })}
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
