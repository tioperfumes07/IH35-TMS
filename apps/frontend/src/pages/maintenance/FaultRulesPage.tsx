import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiRequest } from "../../api/client";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useToast } from "../../components/Toast";
import { FaultRuleModal, type FaultRuleFormValues } from "../../components/maintenance/FaultRuleModal";

type FaultRule = FaultRuleFormValues & { id: string; active?: boolean };

function fetchRules(companyId: string) {
  return apiRequest<{ rules: FaultRule[] }>(
    `/api/v1/maintenance/fault-rules?operating_company_id=${encodeURIComponent(companyId)}`
  );
}

export function FaultRulesPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editRule, setEditRule] = useState<FaultRule | null>(null);

  const rulesQuery = useQuery({
    queryKey: ["maintenance", "fault-rules", companyId],
    queryFn: () => fetchRules(companyId),
    enabled: Boolean(companyId),
  });

  const saveMutation = useMutation({
    mutationFn: (values: FaultRuleFormValues & { id?: string }) => {
      if (values.id) {
        return apiRequest(`/api/v1/maintenance/fault-rules/${values.id}`, {
          method: "PATCH",
          body: { ...values, operating_company_id: companyId },
        });
      }
      return apiRequest("/api/v1/maintenance/fault-rules", {
        method: "POST",
        body: { ...values, operating_company_id: companyId },
      });
    },
    onSuccess: () => {
      pushToast("Fault rule saved.", "success");
      queryClient.invalidateQueries({ queryKey: ["maintenance", "fault-rules", companyId] });
      setModalOpen(false);
      setEditRule(null);
    },
    onError: () => pushToast("Could not save fault rule.", "error"),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/v1/maintenance/fault-rules/${id}/archive`, {
        method: "POST",
        body: { operating_company_id: companyId },
      }),
    onSuccess: () => {
      pushToast("Fault rule archived.", "success");
      queryClient.invalidateQueries({ queryKey: ["maintenance", "fault-rules", companyId] });
    },
  });

  const rules = rulesQuery.data?.rules ?? [];

  return (
    <div className="space-y-4 p-4">
      <PageHeader
        title="Fault Rules"
        subtitle="Map Samsara / J1939 fault codes to severity and auto-WO behavior. Initial rule set is empty — build from operational experience."
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2 text-sm">
          <Link to="/maintenance" className="text-slate-700 underline">
            Maintenance home
          </Link>
          <span className="text-gray-400">·</span>
          <Link to="/maintenance/fault-drafts" className="text-slate-700 underline">
            Fault-driven drafts
          </Link>
        </div>
        {/* ARCHIVE-not-DELETE (B25): prior CTA "+ Add rule" — Sunset: 2026-09. Canonical: + Create Rule. */}
        <Button
          size="sm"
          onClick={() => {
            setEditRule(null);
            setModalOpen(true);
          }}
        >
          + Create Rule
        </Button>
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Severity</th>
              <th className="px-3 py-2">Auto WO</th>
              <th className="px-3 py-2">Priority</th>
              <th className="px-3 py-2">Est. hours</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                  No fault rules configured yet.
                </td>
              </tr>
            ) : (
              rules.map((rule) => (
                <tr key={rule.id} className="border-t border-gray-100">
                  <td className="px-3 py-2 font-mono text-xs">{rule.fault_code}</td>
                  <td className="px-3 py-2">{rule.source}</td>
                  <td className="px-3 py-2 capitalize">{rule.severity}</td>
                  <td className="px-3 py-2">{rule.auto_create_wo ? "Yes" : "No"}</td>
                  <td className="px-3 py-2">{rule.suggested_priority ?? "—"}</td>
                  <td className="px-3 py-2">{rule.estimated_repair_hours ?? "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setEditRule(rule);
                          setModalOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                      <Button size="sm" variant="tertiary" onClick={() => archiveMutation.mutate(rule.id)}>
                        Archive
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalOpen ? (
        <FaultRuleModal
          initial={editRule}
          onClose={() => {
            setModalOpen(false);
            setEditRule(null);
          }}
          onSave={(values) => saveMutation.mutate(values)}
          saving={saveMutation.isPending}
        />
      ) : null}
    </div>
  );
}
