import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, RefreshCw, ToggleLeft, Zap } from "lucide-react";
import {
  listRecurringBillTemplates,
  deactivateRecurringBillTemplate,
  generateRecurringBillNow,
  type RecurringBillTemplate,
} from "../../../api/accounting";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { useToast } from "../../../components/Toast";

function money(amount: string | number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(amount));
}

function frequencyLabel(f: string) {
  return { weekly: "Weekly", biweekly: "Bi-weekly", monthly: "Monthly", quarterly: "Quarterly", annually: "Annually" }[f] ?? f;
}

function statusBadge(isActive: boolean) {
  return isActive ? (
    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Active</span>
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
      pushToast(`Bill generated: ${result.billUuid.slice(0, 8)}…`, "success");
      void queryClient.invalidateQueries({ queryKey: ["accounting", "bills"] });
      void queryClient.invalidateQueries({ queryKey: ["accounting", "recurring-bills"] });
    },
    onError: (err) => pushToast(err instanceof Error ? err.message : "Generate failed", "error"),
  });

  const templates: RecurringBillTemplate[] = templatesQuery.data?.rows ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-gray-900">Recurring Bill Templates</h2>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-500">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Show inactive
          </label>
        </div>
        <button
          onClick={() => navigate("/accounting/bills/recurring/create")}
          className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-3.5 w-3.5" />
          Create Recurring Bill
        </button>
      </div>

      {templatesQuery.isLoading && (
        <div className="flex items-center gap-2 py-8 text-sm text-gray-500">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading templates…
        </div>
      )}

      {templatesQuery.isError && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load recurring templates.
        </div>
      )}

      {!templatesQuery.isLoading && templates.length === 0 && (
        <div className="rounded border border-dashed border-gray-300 bg-gray-50 px-6 py-10 text-center">
          <p className="text-sm text-gray-500">No recurring bill templates yet.</p>
          <button
            onClick={() => navigate("/accounting/bills/recurring/create")}
            className="mt-3 text-sm font-medium text-blue-600 hover:underline"
          >
            Create your first template →
          </button>
        </div>
      )}

      {templates.length > 0 && (
        <div className="overflow-x-auto rounded border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-500">
                <th className="px-4 py-2 text-left">Template Name</th>
                <th className="px-4 py-2 text-left">Vendor</th>
                <th className="px-4 py-2 text-left">Frequency</th>
                <th className="px-4 py-2 text-left">Next Date</th>
                <th className="px-4 py-2 text-right">Amount</th>
                <th className="px-4 py-2 text-center">Auto-Post</th>
                <th className="px-4 py-2 text-center">Status</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {templates.map((tmpl) => (
                <tr key={tmpl.uuid} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-900">{tmpl.template_name}</td>
                  <td className="px-4 py-2 font-mono text-xs text-gray-500">{tmpl.vendor_uuid.slice(0, 8)}…</td>
                  <td className="px-4 py-2 text-gray-700">{frequencyLabel(tmpl.frequency)}</td>
                  <td className="px-4 py-2 text-gray-700">{tmpl.next_generation_date}</td>
                  <td className="px-4 py-2 text-right font-medium text-gray-900">{money(tmpl.amount)}</td>
                  <td className="px-4 py-2 text-center">
                    {tmpl.auto_post ? (
                      <span className="text-xs font-medium text-blue-600">Yes</span>
                    ) : (
                      <span className="text-xs text-gray-400">No</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-center">{statusBadge(tmpl.is_active)}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end gap-2">
                      {tmpl.is_active && (
                        <>
                          <button
                            title="Generate bill now"
                            disabled={generateNowMutation.isPending}
                            onClick={() => generateNowMutation.mutate(tmpl.uuid)}
                            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-blue-600 disabled:opacity-50"
                          >
                            <Zap className="h-3.5 w-3.5" />
                          </button>
                          <button
                            title="Deactivate template"
                            disabled={deactivateMutation.isPending}
                            onClick={() => {
                              if (confirm(`Deactivate "${tmpl.template_name}"?`)) {
                                deactivateMutation.mutate(tmpl.uuid);
                              }
                            }}
                            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600 disabled:opacity-50"
                          >
                            <ToggleLeft className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
