import { entityLabel } from "../../../lib/entity-label";
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EntityLink } from "../../../components/shared/EntityLink";
import { formatDateUS } from "../../../lib/formatDate";
import {
  confirmPresettlementSuggestion,
  listPresettlementSuggestions,
  type PresettlementSuggestionRow,
} from "../../../api/driverFinance";
import { Button } from "../../../components/Button";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { useToast } from "../../../components/Toast";
import { useListState } from "../../../components/list-state";
import { userFacingApiError } from "../../../lib/api-error-message";

// SETTLEMENT-TOUR-NUMBER-SWEEP root-cause fix (2026-09-11, docs/audit/SETTLEMENT-TOUR-NUMBER-SWEEP-2026-09-11.md
// "REMAINING"): this is the first frontend surface ever built for the GO-22 human-confirm queue
// (presettlement-link.routes.ts's GET/POST /presettlement-suggestions) -- the backend has existed
// for a while, but nothing rendered it, so a suggestion that couldn't auto-confirm (trip_type
// still unknown, or a TR/SB leg with no open tour to join yet) sat invisible forever. This is the
// exact mechanism that produced orphan loads 13581/13580/13508 (named in presettlement-link.
// service.ts's own header comment).

export function PresettlementSuggestionsTab({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const suggestionsQuery = useQuery({
    queryKey: ["driver-finance", "presettlement-suggestions", companyId],
    queryFn: () => listPresettlementSuggestions(companyId),
    enabled: Boolean(companyId),
  });

  const confirmMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "create_new" | "link_existing" | "reject" }) =>
      confirmPresettlementSuggestion(id, { operating_company_id: companyId, action }),
    onSuccess: async (result) => {
      pushToast(
        result.status === "rejected"
          ? "Suggestion rejected"
          : result.status === "confirmed"
            ? "Load linked to its pre-settlement"
            : `Suggestion ${result.status}`,
        "success"
      );
      await queryClient.invalidateQueries({ queryKey: ["driver-finance", "presettlement-suggestions"] });
    },
    onError: (error) => pushToast(userFacingApiError(error, "Could not resolve this suggestion"), "error"),
  });

  const rows = suggestionsQuery.data?.rows ?? [];
  const listState = useListState(suggestionsQuery, rows.length === 0);

  const columns = useMemo<ParityColumn<PresettlementSuggestionRow>[]>(
    () => [
      {
        key: "load_number",
        label: "Load #",
        alwaysVisible: true,
        sortable: true,
        sortValue: (row) => row.load_number ?? "",
        render: (row) => <EntityLink kind="load" id={row.load_id} label={row.load_number ?? entityLabel(null, row.load_id, "Load")} />,
      },
      {
        key: "driver_id",
        label: "Driver",
        sortable: true,
        sortValue: (row) => [row.first_name, row.last_name].filter(Boolean).join(" ") || "",
        render: (row) => (
          <EntityLink
            kind="driver"
            id={row.driver_id}
            label={entityLabel([row.first_name, row.last_name].filter(Boolean).join(" ") || null, row.driver_id, "Driver")}
            className="single-line-name"
          />
        ),
      },
      {
        key: "trip_type",
        label: "Trip Type",
        sortable: true,
        sortValue: (row) => row.trip_type ?? "",
        render: (row) =>
          row.trip_type ?? (
            <span className="rounded-sm bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Unknown — needs classification</span>
          ),
      },
      {
        key: "suggested_settlement_display_id",
        label: "Suggested Settlement",
        alwaysVisible: true,
        sortable: true,
        sortValue: (row) => row.suggested_settlement_display_id ?? "",
        render: (row) =>
          row.suggested_settlement_id ? (
            <EntityLink
              kind="settlement"
              id={row.suggested_settlement_id}
              label={entityLabel(row.suggested_settlement_display_id, row.suggested_settlement_id, "Settlement")}
            />
          ) : (
            <span className="text-gray-500">None — needs manual attach</span>
          ),
      },
      {
        key: "suggested_reason",
        label: "Reason",
        sortable: true,
        sortValue: (row) => row.suggested_reason ?? "",
        render: (row) => (
          <span className="max-w-[320px] truncate" title={row.suggested_reason}>
            {row.suggested_reason}
          </span>
        ),
      },
      {
        key: "created_at",
        label: "Created",
        sortable: true,
        render: (row) => formatDateUS(row.created_at),
      },
    ],
    []
  );

  return (
    <div className="space-y-3">
      <div className="rounded-sm border border-gray-200 bg-white p-3 text-xs text-gray-600">
        Loads that need a human decision before joining a pre-settlement — trip type not yet known,
        or a return leg with no open tour to join yet. "Create New" opens a fresh pre-settlement for
        this load; "Link Suggested" joins the recommended one; "Reject" clears this row without
        linking (the load can be re-suggested later once more information is known).
      </div>

      {listState.isError ? (
        <p className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          Couldn't load pre-settlement suggestions.{" "}
          <button type="button" className="underline" onClick={() => void suggestionsQuery.refetch()}>
            Retry
          </button>
        </p>
      ) : (
        <ParityTable<PresettlementSuggestionRow>
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          loading={listState.isLoading}
          emptyText="No pre-settlement suggestions awaiting review."
          storageKey="presettlement-suggestions"
          exportFilename="presettlement-suggestions"
          rowActions={(row) => (
            <div className="flex flex-wrap gap-1">
              {row.suggested_settlement_id ? (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={confirmMutation.isPending}
                  onClick={() => confirmMutation.mutate({ id: row.id, action: "link_existing" })}
                >
                  Link Suggested
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="secondary"
                disabled={confirmMutation.isPending}
                onClick={() => confirmMutation.mutate({ id: row.id, action: "create_new" })}
              >
                Create New
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={confirmMutation.isPending}
                onClick={() => confirmMutation.mutate({ id: row.id, action: "reject" })}
              >
                Reject
              </Button>
            </div>
          )}
        />
      )}
    </div>
  );
}
