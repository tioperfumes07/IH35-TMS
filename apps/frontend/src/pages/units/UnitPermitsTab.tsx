import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { CertExpiryBadge } from "../../components/safety/CertExpiryBadge";
import { Button } from "../../components/Button";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
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
  const scopeGenerationRef = useRef(0);

  useEffect(() => {
    scopeGenerationRef.current += 1;
  }, [unitId, companyId]);

  const permitsQuery = useQuery({
    queryKey: ["unit-permits", unitId, companyId],
    queryFn: () => fetchPermits(unitId, companyId),
    enabled: Boolean(unitId && companyId),
  });

  const deleteMutation = useMutation({
    mutationFn: (input: {
      permitUuid: string;
      unitId: string;
      companyId: string;
      generation: number;
    }) =>
      apiRequest(
        `/api/units/${input.unitId}/permits/${input.permitUuid}?operating_company_id=${encodeURIComponent(input.companyId)}`,
        { method: "DELETE" }
      ),
    onSuccess: (_data, input) => {
      if (input.generation !== scopeGenerationRef.current) return;
      void queryClient.invalidateQueries({
        queryKey: ["unit-permits", input.unitId, input.companyId],
        exact: true,
      });
      pushToast("Permit archived", "success");
    },
    onError: (_error, input) => {
      if (input.generation !== scopeGenerationRef.current) return;
      pushToast("Failed to archive permit", "error");
    },
  });

  const alertByPermit = useMemo(
    () =>
      new Map(
        (permitsQuery.data?.expiry_alerts ?? []).map((alert) => [alert.permit_uuid, alert.severity])
      ),
    [permitsQuery.data?.expiry_alerts]
  );

  const rows = permitsQuery.data?.permits ?? [];

  const columns = useMemo<Array<ParityColumn<UnitPermit>>>(
    () => [
      {
        key: "permit_type",
        label: "Type",
        sortable: true,
        render: (permit) => <span className="font-medium capitalize text-gray-900">{permit.permit_type}</span>,
      },
      { key: "issuing_state", label: "State", sortable: true, render: (permit) => permit.issuing_state },
      { key: "permit_number", label: "Number", sortable: true, render: (permit) => permit.permit_number },
      {
        key: "expiration_date",
        label: "Expires",
        sortable: true,
        render: (permit) => (
          <>
            <CertExpiryBadge label="Expiry" expiresAt={permit.expiration_date} />
            {alertByPermit.get(permit.uuid) === "critical" ? (
              <span className="ml-1 text-[10px] font-semibold text-red-600">Critical</span>
            ) : null}
          </>
        ),
      },
      {
        key: "cost",
        label: "Cost",
        sortable: true,
        render: (permit) => (permit.cost ? `$${permit.cost}` : "—"),
      },
      {
        key: "actions",
        label: "",
        alwaysVisible: true,
        render: (permit) => (
          <div className="text-right">
            <Button
              size="sm"
              variant="secondary"
              loading={deleteMutation.isPending}
              onClick={() =>
                deleteMutation.mutate({
                  permitUuid: permit.uuid,
                  unitId,
                  companyId,
                  generation: scopeGenerationRef.current,
                })
              }
            >
              Archive
            </Button>
          </div>
        ),
      },
    ],
    [alertByPermit, deleteMutation]
  );

  return (
    <section className="rounded-sm border border-gray-200 bg-white p-3" data-testid="unit-permits-tab">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">Unit Permits</h3>
        <span className="text-xs text-gray-500">Oversize · Overweight · Hazmat</span>
      </div>

      {permitsQuery.isError ? (
        <div className="mt-2" data-testid="unit-permits-error">
          <ListErrorState
            title="Couldn't load unit permits"
            status={0}
            message={(permitsQuery.error as Error)?.message}
            onRetry={() => void permitsQuery.refetch()}
          />
        </div>
      ) : (
        <div className="mt-2">
          <ParityTable
            columns={columns}
            rows={rows}
            rowKey={(permit) => permit.uuid}
            loading={permitsQuery.isLoading}
            storageKey="unit-permits"
            tableTestId="unit-permits-table"
            rowTestId={(permit) => `unit-permits-row-${permit.uuid}`}
            emptyText="No active permits on file for this unit."
          />
        </div>
      )}
    </section>
  );
}
