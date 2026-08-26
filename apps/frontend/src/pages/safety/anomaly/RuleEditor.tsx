import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../../api/client";
import { Button } from "../../../components/Button";
import { userFacingApiError } from "../../../lib/api-error-message";

type Props = { operatingCompanyId: string; isOwner: boolean };

export function RuleEditor({ operatingCompanyId, isOwner }: Props) {
  const qc = useQueryClient();
  const actionGenerationRef = useRef(0);
  const [seedError, setSeedError] = useState<unknown>(null);
  const q = useQuery({
    queryKey: ["anomaly-rules", operatingCompanyId],
    enabled: Boolean(operatingCompanyId),
    queryFn: () => apiRequest<{ rules: Array<Record<string, unknown>> }>(
      `/api/safety/anomaly/rules?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
    ),
  });
  const seed = useMutation({
    mutationFn: (input: { companyId: string; generation: number }) => apiRequest("/api/safety/anomaly/seed-defaults", { method: "POST", body: { operating_company_id: input.companyId } }),
    onMutate: () => setSeedError(null),
    onSuccess: async (_result, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      await qc.invalidateQueries({ queryKey: ["anomaly-rules", input.companyId] });
    },
    onError: (error, input) => {
      if (input.generation === actionGenerationRef.current) setSeedError(error);
    },
  });
  useEffect(() => {
    actionGenerationRef.current += 1;
    setSeedError(null);
    seed.reset();
  }, [operatingCompanyId]); // Company transitions own a fresh seed lifecycle.
  if (!isOwner) return <p className="p-3 text-sm text-gray-600">Owner access required to edit rules.</p>;
  return (
    <div className="space-y-3 p-3" data-testid="anomaly-rule-editor">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Detection Rules</h2>
        <Button type="button" onClick={() => seed.mutate({ companyId: operatingCompanyId, generation: actionGenerationRef.current })} disabled={seed.isPending}>
          Seed defaults
        </Button>
      </div>
      {seedError ? (
        <p className="text-xs text-red-700" data-testid="anomaly-seed-defaults-error">
          {userFacingApiError(seedError, "Could not seed anomaly detection defaults.")}
        </p>
      ) : null}
      <ul className="divide-y rounded-sm border">
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
