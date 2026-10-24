import { formatDateUS } from "../../../lib/formatDate";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel } from "../../../lib/entity-label";
import { ConfirmModal } from "../../../components/shared/ConfirmModal";
import { ListErrorState } from "../../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { RefreshCw, ToggleLeft, Zap } from "lucide-react";
import {
  listRecurringBillTemplates,
  deactivateRecurringBillTemplate,
  generateRecurringBillNow,
  type RecurringBillFrequency,
  type RecurringBillTemplate,
} from "../../../api/accounting";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { useToast } from "../../../components/Toast";
import { AccountingSubNavWrapper } from "../AccountingSubNavWrapper";
import { MoneyListToolbar } from "../../../components/table/MoneyListToolbar";
import { MultiSelectDropdown } from "../../../components/forms/MultiSelectDropdown";
import { Button } from "../../../components/Button";
import { addDaysIso, companyToday } from "../../../lib/businessDate";

import { formatUsd } from "../../../lib/money";

const FREQUENCY_FILTER_OPTIONS: { value: RecurringBillFrequency; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Bi-weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annually", label: "Annually" },
];

function frequencyLabel(f: string) {
  return { weekly: "Weekly", biweekly: "Bi-weekly", monthly: "Monthly", quarterly: "Quarterly", annually: "Annually" }[f] ?? f;
}

function statusBadge(isActive: boolean) {
  return isActive ? (
    <span className="rounded-full bg-[#F7F8FA] px-2 py-0.5 text-xs font-medium text-[#1F2A44]">Active</span>
  ) : (
    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">Inactive</span>
  );
}

function recurringKpiCard(label: string, value: string, sublabel: string, tone: "neutral" | "warn" | "danger" = "neutral") {
  const toneClass =
    tone === "danger" ? "border-l-4 border-l-red-500" : tone === "warn" ? "border-l-4 border-l-[#6B7280]" : "border-l-4 border-l-[#E5E7EB]";
  return (
    <div className={`rounded-sm border border-gray-200 bg-white px-3 py-2 ${toneClass}`}>
      <p className="text-section-header font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-page-title font-semibold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500">{sublabel}</p>
    </div>
  );
}

export function RecurringBillList() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [frequencyFilter, setFrequencyFilter] = useState<string[]>([]);
  const [deactivateTarget, setDeactivateTarget] = useState<{ uuid: string; name: string } | null>(null);
  const [lastGeneratedBillId, setLastGeneratedBillId] = useState<string | null>(null);

  const templatesQuery = useQuery({
    queryKey: ["accounting", "recurring-bills", "templates", companyId],
    queryFn: () => listRecurringBillTemplates(companyId, { activeOnly: false }),
    enabled: !!companyId,
  });

  const deactivateMutation = useMutation({
    meta: { loads: true },
    mutationFn: (uuid: string) => deactivateRecurringBillTemplate(uuid, companyId),
    onSuccess: () => {
      pushToast("Template deactivated", "success");
      void queryClient.invalidateQueries({ queryKey: ["accounting", "recurring-bills", "templates"] });
    },
    onError: (err) => pushToast(err instanceof Error ? err.message : "Deactivate failed", "error"),
  });

  const generateNowMutation = useMutation({
    meta: { loads: true },
    mutationFn: (uuid: string) =>
      generateRecurringBillNow(uuid, companyId, `generate-${uuid}-${Date.now()}`),
    onSuccess: (result: { billUuid: string }) => {
      pushToast(`Bill generated: ${entityLabel(null, result.billUuid, "Bill")}`, "success");
      void queryClient.invalidateQueries({ queryKey: ["accounting", "bills"] });
      void queryClient.invalidateQueries({ queryKey: ["accounting", "recurring-bills"] });
      setLastGeneratedBillId(result.billUuid);
    },
    onError: (err) => pushToast(err instanceof Error ? err.message : "Generate failed", "error"),
  });

  const allTemplates: RecurringBillTemplate[] = templatesQuery.data?.rows ?? [];

  const recurringKpis = useMemo(() => {
    const active = allTemplates.filter((t) => t.is_active);
    const inactive = allTemplates.filter((t) => !t.is_active);
    const sumAmount = (rows: RecurringBillTemplate[]) => rows.reduce((s, t) => s + Number(t.amount), 0);
    const today = companyToday();
    const in7 = addDaysIso(today, 7);
    const dueSoon = active.filter((t) => {
      const next = t.next_generation_date ?? "";
      return next && next >= today && next <= in7;
    });
    return {
      activeCount: active.length,
      inactiveCount: inactive.length,
      activeAmount: sumAmount(active),
      autoPostCount: active.filter((t) => t.auto_post).length,
      dueSoonCount: dueSoon.length,
    };
  }, [allTemplates]);

  const filteredTemplates = useMemo(() => {
    let rows = allTemplates;
    if (statusFilter.length === 0) {
      rows = rows.filter((t) => t.is_active);
    } else {
      rows = rows.filter((t) => {
        if (statusFilter.includes("active") && t.is_active) return true;
        if (statusFilter.includes("inactive") && !t.is_active) return true;
        return false;
      });
    }
    if (frequencyFilter.length > 0) {
      rows = rows.filter((t) => frequencyFilter.includes(t.frequency));
    }
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (t) =>
          t.template_name.toLowerCase().includes(q) ||
          (t.vendor_name ?? "").toLowerCase().includes(q) ||
          t.vendor_uuid.toLowerCase().includes(q),
      );
    }
    return rows;
  }, [allTemplates, statusFilter, frequencyFilter, search]);

  const activeFilterCount = statusFilter.length + frequencyFilter.length + (search.trim() ? 1 : 0);

  const columns = useMemo<ParityColumn<RecurringBillTemplate>[]>(
    () => [
      {
        key: "template_name",
        label: "Template Name",
        sortable: true,
        cellClass: "font-medium text-gray-900",
        render: (tmpl) => tmpl.template_name,
      },
      {
        key: "vendor_uuid",
        label: "Vendor",
        cellClass: "font-mono text-xs",
        sortValue: (tmpl) => tmpl.vendor_name ?? tmpl.vendor_uuid,
        render: (tmpl) => (
          <EntityLink kind="vendor" id={tmpl.vendor_uuid} label={entityLabel(tmpl.vendor_name, tmpl.vendor_uuid, "Vendor")} />
        ),
      },
      {
        key: "frequency",
        label: "Frequency",
        sortable: true,
        cellClass: "text-gray-700",
        render: (tmpl) => frequencyLabel(tmpl.frequency),
      },
      {
        key: "next_generation_date",
        label: "Next Date",
        sortable: true,
        cellClass: "text-gray-700",
        render: (tmpl) => formatDateUS(tmpl.next_generation_date),
      },
      {
        key: "amount",
        label: "Amount",
        sortable: true,
        className: "text-right",
        cellClass: "text-right font-medium text-gray-900",
        sortValue: (tmpl) => Number(tmpl.amount),
        render: (tmpl) => formatUsd(Number(tmpl.amount)),
      },
      {
        key: "auto_post",
        label: "Auto-Post",
        className: "text-center",
        cellClass: "text-center",
        render: (tmpl) =>
          tmpl.auto_post ? (
            <span className="text-xs font-medium text-[#1F2A44]">Yes</span>
          ) : (
            <span className="text-xs text-gray-400">No</span>
          ),
      },
      {
        key: "is_active",
        label: "Status",
        className: "text-center",
        cellClass: "text-center",
        render: (tmpl) => statusBadge(tmpl.is_active),
      },
      {
        key: "actions",
        label: "Actions",
        alwaysVisible: true,
        className: "text-right",
        cellClass: "text-right",
        render: (tmpl) => (
          <div className="flex items-center justify-end gap-2">
            {tmpl.is_active && (
              <>
                <button
                  title="Generate bill now"
                  disabled={generateNowMutation.isPending}
                  onClick={() => generateNowMutation.mutate(tmpl.uuid)}
                  className="rounded-sm p-1 text-gray-400 hover:bg-gray-100 hover:text-[#1F2A44] disabled:opacity-50"
                >
                  <Zap className="h-3.5 w-3.5" />
                </button>
                <button
                  title="Deactivate template"
                  disabled={deactivateMutation.isPending}
                  onClick={() => setDeactivateTarget({ uuid: tmpl.uuid, name: tmpl.template_name })}
                  className="rounded-sm p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600 disabled:opacity-50"
                >
                  <ToggleLeft className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        ),
      },
    ],
    [generateNowMutation, deactivateMutation],
  );

  const filterBar = (
    <MoneyListToolbar
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Template name, vendor…"
      searchTestId="recurring-bills-search-input"
      onClearAll={() => {
        setSearch("");
        setStatusFilter([]);
        setFrequencyFilter([]);
      }}
      activeFilterCount={activeFilterCount}
      testIdPrefix="recurring-bills"
    >
      <MultiSelectDropdown
        label="Status"
        options={[
          { value: "active", label: "Active" },
          { value: "inactive", label: "Inactive" },
        ]}
        selected={statusFilter}
        onChange={setStatusFilter}
        allLabel="Active only (default)"
        data-testid="recurring-bills-status-filter"
      />
      <MultiSelectDropdown
        label="Frequency"
        options={FREQUENCY_FILTER_OPTIONS}
        selected={frequencyFilter}
        onChange={setFrequencyFilter}
        allLabel="All frequencies"
        data-testid="recurring-bills-frequency-filter"
      />
    </MoneyListToolbar>
  );

  return (
    <AccountingSubNavWrapper
      title="Recurring Bills"
      subtitle="Recurring bill templates — schedule, auto-post, and generate vendor bills"
      crumbs={[{ label: "Bills", href: "/accounting/bills" }]}
      createControl={
        <Button
          type="button"
          data-testid="recurring-bills-create-cta"
          onClick={() => navigate("/accounting/bills/recurring/create")}
          disabled={!companyId}
        >
          + Create
        </Button>
      }
      kpiStrip={
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4" data-testid="recurring-bills-kpi-strip">
          {templatesQuery.isError ? (
            <>
              {recurringKpiCard("Active Templates", "—", "Error loading")}
              {recurringKpiCard("Scheduled Amount", "—", "Error loading")}
              {recurringKpiCard("Due within 7 days", "—", "Error loading")}
              {recurringKpiCard("Auto-post enabled", "—", "Error loading")}
            </>
          ) : (
            <>
              {recurringKpiCard(
                "Active Templates",
                String(recurringKpis.activeCount),
                `${formatUsd(recurringKpis.activeAmount)} per run`,
                recurringKpis.activeCount ? "neutral" : "warn",
              )}
              {recurringKpiCard(
                "Due within 7 days",
                String(recurringKpis.dueSoonCount),
                "Next generation date",
                recurringKpis.dueSoonCount ? "warn" : "neutral",
              )}
              {recurringKpiCard("Auto-post enabled", String(recurringKpis.autoPostCount), "Active templates")}
              {recurringKpiCard(
                "Inactive",
                String(recurringKpis.inactiveCount),
                "Not generating",
                recurringKpis.inactiveCount ? "neutral" : "neutral",
              )}
            </>
          )}
        </div>
      }
      actions={filterBar}
    >
      {lastGeneratedBillId ? (
        <div
          className="flex items-center justify-between rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] px-3 py-2 text-xs text-[#1F2A44]"
          data-testid="recurring-bill-generated-banner"
        >
          <span>
            Bill generated: <EntityLink kind="bill" id={lastGeneratedBillId} label="View bill →" />
          </span>
          <button
            type="button"
            onClick={() => setLastGeneratedBillId(null)}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ) : null}

      {templatesQuery.isLoading && (
        <div className="flex items-center gap-2 py-8 text-xs text-gray-500">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading templates…
        </div>
      )}

      {templatesQuery.isError && (
        <ListErrorState
          title="Couldn't load recurring templates"
          status={0}
          message={(templatesQuery.error as Error | undefined)?.message}
          onRetry={() => void templatesQuery.refetch()}
        />
      )}

      {!templatesQuery.isLoading && !templatesQuery.isError && allTemplates.length === 0 && (
        <div className="rounded-sm border border-dashed border-gray-300 bg-gray-50 px-6 py-10 text-center">
          <p className="text-xs text-gray-500">No recurring bill templates yet.</p>
          <button
            onClick={() => navigate("/accounting/bills/recurring/create")}
            className="mt-3 text-xs font-medium text-[#1F2A44] hover:underline"
          >
            Create your first template →
          </button>
        </div>
      )}

      {!templatesQuery.isLoading && !templatesQuery.isError && allTemplates.length > 0 && filteredTemplates.length === 0 && (
        <div className="rounded-sm border border-dashed border-gray-300 bg-gray-50 px-6 py-10 text-center">
          <p className="text-xs text-gray-500">No recurring bill templates match these filters.</p>
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setStatusFilter([]);
              setFrequencyFilter([]);
            }}
            className="mt-3 text-xs font-medium text-[#1F2A44] hover:underline"
          >
            Clear filters
          </button>
        </div>
      )}

      {filteredTemplates.length > 0 && (
        <ParityTable
          title="Recurring bill templates"
          columns={columns}
          rows={filteredTemplates}
          rowKey={(tmpl) => tmpl.uuid}
          storageKey="acct-recurring-bill-templates"
          tableTestId="recurring-bill-templates-table"
        />
      )}

      <ConfirmModal
        open={Boolean(deactivateTarget)}
        title="Deactivate template"
        message={`Deactivate "${deactivateTarget?.name ?? ""}"? It stops generating new bills (soft delete — it is not removed).`}
        confirmLabel="Deactivate"
        danger
        onClose={() => setDeactivateTarget(null)}
        onConfirm={async () => {
          if (!deactivateTarget) return;
          await deactivateMutation.mutateAsync(deactivateTarget.uuid);
          setDeactivateTarget(null);
        }}
      />
    </AccountingSubNavWrapper>
  );
}
