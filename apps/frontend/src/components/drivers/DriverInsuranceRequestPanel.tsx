import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  insuranceCoiApi,
  type CoiRequestStatus,
  type InsuranceCoiRequest,
} from "../../api/insurance";
import { ApiError } from "../../api/client";
import { Button } from "../Button";
import { DataPanel } from "../layout/DataPanel";
import { StatusBadge } from "../layout/StatusBadge";
import { ListErrorState } from "../ListErrorState";
import { Modal } from "../Modal";
import { useToast } from "../Toast";

type Props = {
  driverId: string;
  driverName: string;
  operatingCompanyId?: string;
};

// INSURANCE REQUEST FEATURE (owner-authorized 2026-08-31): the driver-add half of the one
// customer-COI/driver-add/(future unit-add) pipeline. Mirrors CoiTab's shape deliberately (same
// backend table, same lifecycle) but is its own component because the target/copy differ enough
// that forcing one component to branch on both would obscure more than it shares.
function statusVariant(status: CoiRequestStatus): "neutral" | "warn" | "positive" | "crit" {
  if (status === "issued") return "positive";
  if (status === "declined") return "crit";
  if (status === "acknowledged" || status === "sent" || status === "requested") return "neutral";
  return "neutral";
}

function statusLabel(status: CoiRequestStatus) {
  return status.replace("_", " ");
}

const TERMINAL_STATUSES: CoiRequestStatus[] = ["sent", "acknowledged", "issued", "declined"];

export function DriverInsuranceRequestPanel({ driverId, driverName, operatingCompanyId }: Props) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [resendTargetId, setResendTargetId] = useState<string | null>(null);
  const [resendReason, setResendReason] = useState("");

  const listKey = ["insurance-coi-requests", operatingCompanyId ?? "none", "driver", driverId];
  const query = useQuery({
    queryKey: listKey,
    queryFn: () =>
      insuranceCoiApi
        .list({ operating_company_id: operatingCompanyId!, driver_id: driverId, request_type: "driver_add" })
        .then((result) => result.requests),
    enabled: Boolean(operatingCompanyId),
  });

  const scheduleQuery = useQuery({
    queryKey: ["insurance-driver-schedule-status", operatingCompanyId ?? "none", driverId],
    queryFn: () => insuranceCoiApi.driverScheduleStatus(driverId, operatingCompanyId!),
    enabled: Boolean(operatingCompanyId),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      insuranceCoiApi.create({
        operating_company_id: operatingCompanyId!,
        request_type: "driver_add",
        driver_id: driverId,
        notes: notes.trim() ? notes.trim() : null,
      }),
    onSuccess: () => {
      pushToast("Driver-add request created", "success");
      setNotes("");
      setCreateOpen(false);
      void queryClient.invalidateQueries({ queryKey: listKey });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 404) {
        pushToast("Driver not found", "error");
        return;
      }
      pushToast("Failed to create request", "error");
    },
  });

  const sendMutation = useMutation({
    mutationFn: (input: { id: string; force?: boolean; reason?: string }) =>
      insuranceCoiApi.send(input.id, operatingCompanyId!, { force: input.force, reason: input.reason }),
    onSuccess: () => {
      pushToast("Request sent to the insurer", "success");
      setResendTargetId(null);
      setResendReason("");
      void queryClient.invalidateQueries({ queryKey: listKey });
    },
    onError: (error, input) => {
      if (error instanceof ApiError && error.status === 409) {
        // Already sent once -- offer the Owner/Accountant-only resend path rather than a dead end
        // (LAW-EDITABLE-BY-PERMISSION-ALWAYS-TRACEABLE-2026-09-01: no hard, unfixable wall).
        setResendTargetId(input.id);
        return;
      }
      if (error instanceof ApiError && error.status === 403) {
        pushToast("Only Owner or Accountant can force a resend", "error");
        return;
      }
      pushToast("Failed to send request", "error");
    },
  });

  const requests = query.data ?? [];
  const schedule = scheduleQuery.data;

  if (!operatingCompanyId) {
    return (
      <div className="rounded-sm border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
        Select an operating company to manage insurance requests.
      </div>
    );
  }

  return (
    <DataPanel title={`Insurance Requests · ${driverName}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-gray-600">
          Auto Liability schedule status:{" "}
          {scheduleQuery.isLoading ? (
            "loading..."
          ) : schedule?.on_schedule ? (
            <StatusBadge variant="positive">on schedule (issued)</StatusBadge>
          ) : (
            <StatusBadge variant="warn">not evidenced</StatusBadge>
          )}
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          + Request AL Add
        </Button>
      </div>

      {query.isError ? (
        <ListErrorState
          title="Couldn't load insurance requests"
          status={query.error instanceof ApiError ? query.error.status : 0}
          message={(query.error as Error)?.message}
          onRetry={() => void query.refetch()}
        />
      ) : null}

      {!query.isError ? (
        <div className="space-y-2">
          {query.isLoading ? <div className="text-sm text-gray-500">Loading requests...</div> : null}
          {!query.isLoading && requests.length === 0 ? (
            <div className="rounded-sm border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
              No driver-add requests yet for this driver.
            </div>
          ) : null}
          {requests.map((request: InsuranceCoiRequest) => (
            <div key={request.id} className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-gray-200 p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <StatusBadge variant={statusVariant(request.status)}>{statusLabel(request.status)}</StatusBadge>
                  <span className="text-xs text-gray-500">{new Date(request.requested_at).toLocaleString()}</span>
                </div>
                {request.notes ? <div className="mt-1 text-xs text-gray-600">{request.notes}</div> : null}
                {request.sent_at ? (
                  <div className="mt-1 text-xs text-gray-500">Sent to {request.broker_email} at {new Date(request.sent_at).toLocaleString()}</div>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                {resendTargetId === request.id ? (
                  <>
                    <input
                      className="w-48 rounded-sm border border-gray-300 px-2 py-1 text-xs"
                      placeholder="Reason for resend (required)"
                      value={resendReason}
                      onChange={(event) => setResendReason(event.target.value)}
                    />
                    <Button
                      size="sm"
                      disabled={!resendReason.trim()}
                      loading={sendMutation.isPending}
                      onClick={() => sendMutation.mutate({ id: request.id, force: true, reason: resendReason.trim() })}
                    >
                      Confirm resend
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setResendTargetId(null)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={sendMutation.isPending}
                    onClick={() => sendMutation.mutate({ id: request.id })}
                  >
                    {TERMINAL_STATUSES.includes(request.status) ? "Resend" : "Send"}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <Modal variant="drawer" title="Request Auto Liability Add" open={createOpen} onClose={() => setCreateOpen(false)}>
        <label className="block text-xs">
          Notes
          <textarea
            rows={3}
            className="mt-0.5 w-full rounded-sm border border-gray-300 px-2 py-1 text-sm"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Optional details for the broker"
          />
        </label>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={createMutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => createMutation.mutate()} loading={createMutation.isPending}>
            + Create
          </Button>
        </div>
      </Modal>
    </DataPanel>
  );
}
