import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../api/client";
import { Button } from "../Button";
import { MoneyInput } from "../forms/MoneyInput";
import { DataPanel } from "../layout/DataPanel";
import { ListErrorState } from "../ListErrorState";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";

type CustomerFreeTimeTerms = {
  customer_uuid: string;
  operating_company_id: string;
  free_time_minutes: number;
  detention_rate_per_hour: string;
  detention_currency: "USD" | "MXN" | "CAD";
  detention_requires_approval: boolean;
  terms_updated_at: string | null;
  terms_updated_by_user_uuid: string | null;
};

type CustomerTermsHistoryRow = {
  uuid: string;
  free_time_minutes: number;
  detention_rate_per_hour: string;
  detention_currency: "USD" | "MXN" | "CAD";
  detention_requires_approval: boolean;
  terms_updated_at: string;
  terms_updated_by_user_uuid: string | null;
  recorded_at: string;
};

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleString();
}

const HISTORY_COLUMNS: Array<ParityColumn<CustomerTermsHistoryRow>> = [
  {
    key: "recorded_at",
    label: "Recorded",
    sortable: true,
    sortValue: (row) => new Date(row.recorded_at).getTime(),
    render: (row) => formatTimestamp(row.recorded_at),
  },
  {
    key: "free_time_minutes",
    label: "Free Time",
    sortable: true,
    render: (row) => row.free_time_minutes,
  },
  {
    key: "detention_rate_per_hour",
    label: "Rate",
    sortable: true,
    render: (row) => row.detention_rate_per_hour,
  },
  {
    key: "detention_currency",
    label: "Currency",
    sortable: true,
  },
  {
    key: "detention_requires_approval",
    label: "Approval",
    sortable: true,
    render: (row) => (row.detention_requires_approval ? "Required" : "Not required"),
  },
];

export function FreeTimeDetentionEditor(props: {
  customerUuid: string;
  operatingCompanyId: string;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const [freeTimeMinutes, setFreeTimeMinutes] = useState("120");
  const [detentionRatePerHour, setDetentionRatePerHour] = useState("0");
  const [detentionCurrency, setDetentionCurrency] = useState<"USD" | "MXN" | "CAD">("USD");
  const [detentionRequiresApproval, setDetentionRequiresApproval] = useState(true);

  const termsQuery = useQuery({
    queryKey: ["customer-free-time-detention", props.customerUuid, props.operatingCompanyId],
    queryFn: () =>
      apiRequest<{ terms: CustomerFreeTimeTerms }>(
        `/api/v1/customers/${props.customerUuid}/free-time-detention?operating_company_id=${encodeURIComponent(props.operatingCompanyId)}`
      ).then((res) => res.terms),
    enabled: Boolean(props.customerUuid && props.operatingCompanyId),
  });

  const historyQuery = useQuery({
    queryKey: ["customer-terms-history", props.customerUuid, props.operatingCompanyId],
    queryFn: () =>
      apiRequest<{ rows: CustomerTermsHistoryRow[] }>(
        `/api/v1/customers/${props.customerUuid}/terms-history?operating_company_id=${encodeURIComponent(props.operatingCompanyId)}&limit=25`
      ).then((res) => res.rows),
    enabled: Boolean(props.customerUuid && props.operatingCompanyId),
  });

  useEffect(() => {
    if (!termsQuery.data) return;
    setFreeTimeMinutes(String(termsQuery.data.free_time_minutes));
    setDetentionRatePerHour(String(termsQuery.data.detention_rate_per_hour ?? "0"));
    setDetentionCurrency(termsQuery.data.detention_currency ?? "USD");
    setDetentionRequiresApproval(Boolean(termsQuery.data.detention_requires_approval));
  }, [termsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest<{ terms: CustomerFreeTimeTerms }>(
        `/api/v1/customers/${props.customerUuid}/free-time-detention?operating_company_id=${encodeURIComponent(props.operatingCompanyId)}`,
        {
          method: "PATCH",
          body: {
            free_time_minutes: Number(freeTimeMinutes),
            detention_rate_per_hour: Number(detentionRatePerHour),
            detention_currency: detentionCurrency,
            detention_requires_approval: detentionRequiresApproval,
          },
        }
      ).then((res) => res.terms),
    onSuccess: (updated) => {
      queryClient.setQueryData(["customer-free-time-detention", props.customerUuid, props.operatingCompanyId], updated);
      void queryClient.invalidateQueries({ queryKey: ["customer-terms-history", props.customerUuid, props.operatingCompanyId] });
    },
  });

  const isDirty = useMemo(() => {
    if (!termsQuery.data) return false;
    return (
      Number(freeTimeMinutes) !== Number(termsQuery.data.free_time_minutes) ||
      Number(detentionRatePerHour) !== Number(termsQuery.data.detention_rate_per_hour) ||
      detentionCurrency !== termsQuery.data.detention_currency ||
      detentionRequiresApproval !== termsQuery.data.detention_requires_approval
    );
  }, [detentionCurrency, detentionRatePerHour, detentionRequiresApproval, freeTimeMinutes, termsQuery.data]);

  const historyColumns = useMemo(() => HISTORY_COLUMNS, []);
  const historyErr = historyQuery.error as { status?: number; message?: string } | null;
  const termsErr = termsQuery.error as { status?: number; message?: string } | null;

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <DataPanel title="Free Time + Detention Terms">
        {termsQuery.isLoading ? <p className="text-xs text-gray-500">Loading terms...</p> : null}
        {termsQuery.isError ? (
          <ListErrorState
            title="Couldn't load free-time terms"
            status={typeof termsErr?.status === "number" ? termsErr.status : 0}
            message={termsErr?.message}
            onRetry={() => void termsQuery.refetch()}
          />
        ) : null}
        {/* CUST-MONEY-F6985 — gate on !isError too: React Query RETAINS `data` from the last
            successful fetch across a failed refetch, so a stale-but-truthy termsQuery.data kept
            this money-bearing rate editor (and its Save button) fully live and editable on top of
            values the app had just told the user it could not confirm were current. */}
        {!termsQuery.isError && termsQuery.data ? (
          <div className="space-y-2 text-sm">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-600">Free Time (minutes)</span>
              <input
                type="number"
                min={0}
                max={1440}
                value={freeTimeMinutes}
                onChange={(event) => setFreeTimeMinutes(event.target.value)}
                disabled={!props.canEdit}
                className="w-full rounded-sm border border-gray-300 px-2 py-1 disabled:bg-gray-50"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-600">Detention Rate (per hour)</span>
              {/* M-1: dollars-mode QBO money entry; rate is DOLLARS (numeric(8,2)), submit Number() byte-for-byte. */}
              <MoneyInput
                valueDollars={detentionRatePerHour ? Number(detentionRatePerHour) : null}
                onChangeDollars={(d) => setDetentionRatePerHour(d == null ? "" : String(d))}
                disabled={!props.canEdit}
                ariaLabel="Detention Rate (per hour)"
                className="w-full"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-600">Currency</span>
              <select
                value={detentionCurrency}
                onChange={(event) => setDetentionCurrency(event.target.value as "USD" | "MXN" | "CAD")}
                disabled={!props.canEdit}
                className="w-full rounded-sm border border-gray-300 px-2 py-1 disabled:bg-gray-50"
              >
                <option value="USD">USD</option>
                <option value="MXN">MXN</option>
                <option value="CAD">CAD</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={detentionRequiresApproval}
                onChange={(event) => setDetentionRequiresApproval(event.target.checked)}
                disabled={!props.canEdit}
              />
              Require manager approval for detention charges
            </label>
            <div className="text-xs text-gray-600">
              <div>Last updated: {formatTimestamp(termsQuery.data.terms_updated_at)}</div>
              <div>Updated by user: {termsQuery.data.terms_updated_by_user_uuid ?? "Not set"}</div>
            </div>
            {props.canEdit ? (
              <Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending} disabled={!isDirty}>
                Save terms
              </Button>
            ) : (
              <p className="text-xs text-gray-500">Manager+ role required to update these terms.</p>
            )}
            {saveMutation.isError ? <p className="text-xs text-red-700">Update failed. Verify values and retry.</p> : null}
          </div>
        ) : null}
      </DataPanel>

      <DataPanel title="Terms History">
        {historyQuery.isLoading ? <p className="text-xs text-gray-500">Loading history...</p> : null}
        {historyQuery.isError ? (
          <ListErrorState
            title="Couldn't load terms history"
            status={typeof historyErr?.status === "number" ? historyErr.status : 0}
            message={historyErr?.message}
            onRetry={() => void historyQuery.refetch()}
          />
        ) : null}
        {/* CUST-MONEY-F6985 — same stale-retained-data gate for the history table. */}
        {!historyQuery.isError && historyQuery.data ? (
          <ParityTable
            storageKey="customer-freetime-detention-history"
            tableTestId="customer-terms-history"
            columns={historyColumns}
            rows={historyQuery.data}
            rowKey={(row) => row.uuid}
            emptyText="No term changes captured yet."
            initialPageSize={25}
            pageSizeOptions={[10, 25, 50]}
            loading={historyQuery.isLoading}
          />
        ) : null}
      </DataPanel>
    </div>
  );
}
