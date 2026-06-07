import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { CertExpiryBadge } from "../../components/safety/CertExpiryBadge";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";

type UnitPermit = {
  uuid: string;
  permit_type: string;
  issuing_state: string;
  permit_number: string;
  effective_date: string;
  expiration_date: string;
  cost: string | null;
  notes: string | null;
};

type PermitsResponse = {
  permits: UnitPermit[];
  expiry_alerts: Array<{ permit_uuid: string; severity: string }>;
};

type UnitPermitsTabProps = {
  unitId: string;
  companyId: string;
};

function fetchPermits(unitId: string, companyId: string) {
  return apiRequest<PermitsResponse>(
    `/api/units/${unitId}/permits?operating_company_id=${encodeURIComponent(companyId)}`
  );
}

export function UnitPermitsTab({ unitId, companyId }: UnitPermitsTabProps) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const permitsQuery = useQuery({
    queryKey: ["unit-permits", unitId, companyId],
    queryFn: () => fetchPermits(unitId, companyId),
    enabled: Boolean(unitId && companyId),
  });

  const deleteMutation = useMutation({
    mutationFn: (permitUuid: string) =>
      apiRequest(`/api/units/${unitId}/permits/${permitUuid}?operating_company_id=${encodeURIComponent(companyId)}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["unit-permits", unitId, companyId] });
      pushToast("Permit archived", "success");
    },
    onError: () => pushToast("Failed to archive permit", "error"),
  });

  const alertByPermit = new Map(
    (permitsQuery.data?.expiry_alerts ?? []).map((alert) => [alert.permit_uuid, alert.severity])
  );

  return (
    <section className="rounded border border-gray-200 bg-white p-3" data-testid="unit-permits-tab">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">Unit Permits</h3>
        <span className="text-xs text-gray-500">Oversize · Overweight · Hazmat</span>
      </div>
      {permitsQuery.isLoading ? <p className="mt-2 text-xs text-gray-500">Loading permits...</p> : null}
      <div className="mt-2 overflow-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-gray-50 text-[11px] uppercase text-gray-600">
            <tr>
              <th className="px-2 py-2">Type</th>
              <th className="px-2 py-2">State</th>
              <th className="px-2 py-2">Number</th>
              <th className="px-2 py-2">Expires</th>
              <th className="px-2 py-2">Cost</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {(permitsQuery.data?.permits ?? []).map((permit) => (
              <tr key={permit.uuid} className="border-b border-gray-100">
                <td className="px-2 py-2 font-medium capitalize text-gray-900">{permit.permit_type}</td>
                <td className="px-2 py-2">{permit.issuing_state}</td>
                <td className="px-2 py-2">{permit.permit_number}</td>
                <td className="px-2 py-2">
                  <CertExpiryBadge label="Expiry" expiresAt={permit.expiration_date} />
                  {alertByPermit.get(permit.uuid) === "critical" ? (
                    <span className="ml-1 text-[10px] font-semibold text-red-600">Critical</span>
                  ) : null}
                </td>
                <td className="px-2 py-2">{permit.cost ? `$${permit.cost}` : "—"}</td>
                <td className="px-2 py-2 text-right">
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate(permit.uuid)}
                  >
                    Archive
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!permitsQuery.isLoading && (permitsQuery.data?.permits.length ?? 0) === 0 ? (
        <p className="mt-2 text-xs text-gray-500">No active permits on file for this unit.</p>
      ) : null}
    </section>
  );
}
