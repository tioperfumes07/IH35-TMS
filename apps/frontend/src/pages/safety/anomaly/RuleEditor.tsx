import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../../api/client";
import { Button } from "../../../components/Button";

type Props = { operatingCompanyId: string; isOwner: boolean };

export function RuleEditor({ operatingCompanyId, isOwner }: Props) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["anomaly-rules", operatingCompanyId],
    enabled: Boolean(operatingCompanyId),
    queryFn: () => apiRequest<{ rules: Array<Record<string, unknown>> }>(
      `/api/safety/anomaly/rules?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
    ),
  });
  const seed = useMutation({
    mutationFn: () => apiRequest("/api/safety/anomaly/seed-defaults", { method: "POST", body: { operating_company_id: operatingCompanyId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["anomaly-rules"] }),
  });
  if (!isOwner) return <p className="p-3 text-sm text-gray-600">Owner access required to edit rules.</p>;
  return (
    <div className="space-y-3 p-3" data-testid="anomaly-rule-editor">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Detection Rules</h2>
        <Button type="button" onClick={() => seed.mutate()}>Seed defaults</Button>
      </div>
      <ul className="divide-y rounded border">
        {(q.data?.rules ?? []).map((rule) => (
          <li key={String(rule.uuid)} className="p-2 text-sm">
            <span className="font-medium">{String(rule.rule_name)}</span>
            <span className="ml-2 text-gray-500">({String(rule.rule_slug)}) — {String(rule.severity)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
