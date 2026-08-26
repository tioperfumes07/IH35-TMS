import { formatDateUS } from "../../../lib/formatDate";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel } from "../../../lib/entity-label";
import { ConfirmModal } from "../../../components/shared/ConfirmModal";
import { ListErrorState } from "../../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { ArrowLeft, RefreshCw, ToggleLeft, Zap } from "lucide-react";
import {
  listRecurringBillTemplates,
  deactivateRecurringBillTemplate,
  generateRecurringBillNow,
  type RecurringBillTemplate,
} from "../../../api/accounting";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { useToast } from "../../../components/Toast";
import { hasInAppHistory } from "../../../lib/smart-back";

function money(amount: string | number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(amount));
}

function frequencyLabel(f: string) {
  return { weekly: "Weekly", biweekly: "Bi-weekly", monthly: "Monthly", quarterly: "Quarterly", annually: "Annually" }[f] ?? f;
}

function statusBadge(isActive: boolean) {
  return isActive ? (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">Active</span>
  ) : (
    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">Inactive</span>
  );
}

export function RecurringBillList() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showInactive, setShowInactive] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<{ uuid: string; name: string } | null>(null);
  const [lastGeneratedBillId, setLastGeneratedBillId] = useState<string | null>(null);

  const templatesQuery = useQuery({
    queryKey: ["accounting", "recurring-bills", "templates", companyId, showInactive],
    queryFn: () => listRecurringBillTemplates(companyId, { activeOnly: !showInactive }),
    enabled: !!companyId,
  });

  const deactivateMutation = useMutation({
    mutationFn: (uuid: string) => deactivateRecurringBillTemplate(uuid, companyId),
    onSuccess: () => {
      pushToast("Template deactivated", "success");
      void queryClient.invalidateQueries({ queryKey: ["accounting", "recurring-bills", "templates"] });
    },
    onError: (err) => pushToast(err instanceof Error ? err.message : "Deactivate failed", "error"),
  });

  const generateNowMutation = useMutation({
    mutationFn: (uuid: string) =>
      generateRecurringBillNow(uuid, companyId, `generate-${uuid}-${Date.now()}`),
    onSuccess: (result: { billUuid: string }) => {
      pushToast(`Bill generated: ${entityLabel(null, result.billUuid, "Bill")}`, "success");
      void queryClient.invalidateQueries({ queryKey: ["accounting", "bills"] });
      void queryClient.invalidateQueries({ queryKey: ["accounting", "recurring-bills"] });
      // LINK-F5188: result.billUuid is the real freshly-created accounting.bills id -- it was
      // rendered as plain text inside the toast string above and then discarded. Surface a real
      // drill target instead of just an announcement.
      setLastGeneratedBillId(result.billUuid);
    },
    onError: (err) => pushToast(err instanceof Error ? err.message : "Generate failed", "error"),
  });

  const templates: RecurringBillTemplate[] = templatesQuery.data?.rows ?? [];

  // Display-only ParityTable migration: column order, amount formatting (money → USD currency),
  // date formatting, badges, and the Generate-now / Deactivate inline action handlers are
  // preserved 1:1 from the former hand-rolled table markup.
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
        render: (tmpl) => money(tmpl.amount),
      },
      {
        key: "auto_post",
        label: "Auto-Post",
        className: "text-center",
        cellClass: "text-center",
        render: (tmpl) =>
          tmpl.auto_post ? (
            <span className="text-xs font-medium text-slate-700">Yes</span>
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
                  className="rounded-sm p-1 text-gray-400 hover:bg-gray-100 hover:text-slate-700 disabled:opacity-50"
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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-gray-500">
        {/*
          UI-BACK-BUTTON-IGNORES-REAL-NAVIGATION-HISTORY: this was hardcoded to /accounting/bills
          regardless of where the user actually came from -- missed by the earlier waves of this
          audit because its aria-label was "Back to Bills", not the exact "Back" string those
          waves' detection matched on. Same smart-back fix as the rest of the app.
        */}
        <button
          onClick={() => {
            if (hasInAppHistory(window.history.state)) {
              navigate(-1);
              return;
            }
            navigate("/accounting/bills");
          }}
          className="inline-flex items-center gap-1 rounded-sm px-1 py-0.5 text-[11px] font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          aria-label="Back to Bills"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          <span>Back</span>
        </button>
        <Link to="/accounting" className="hover:underline">Accounting</Link>
        <span>/</span>
        <Link to="/accounting/bills" className="hover:underline">Bills</Link>
        <span>/</span>
        <span className="text-gray-700">Recurring Bills</span>
      </div>

      {lastGeneratedBillId ? (
        <div
          className="flex items-center justify-between rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700"
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

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-gray-900">Recurring Bill Templates</h2>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-500">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded-sm"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Show inactive
          </label>
        </div>
        <button
          onClick={() => navigate("/accounting/bills/recurring/create")}
          className="rounded-sm border border-[#1f2a44] bg-[#1f2a44] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0f1729]"
        >
          + Create
        </button>
      </div>

      {templatesQuery.isLoading && (
        <div className="flex items-center gap-2 py-8 text-sm text-gray-500">
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

      {!templatesQuery.isLoading && !templatesQuery.isError && templates.length === 0 && (
        <div className="rounded-sm border border-dashed border-gray-300 bg-gray-50 px-6 py-10 text-center">
          <p className="text-sm text-gray-500">No recurring bill templates yet.</p>
          <button
            onClick={() => navigate("/accounting/bills/recurring/create")}
            className="mt-3 text-sm font-medium text-slate-700 hover:underline"
          >
            Create your first template →
          </button>
        </div>
      )}

      {templates.length > 0 && (
        <ParityTable
          columns={columns}
          rows={templates}
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
    </div>
  );
}
