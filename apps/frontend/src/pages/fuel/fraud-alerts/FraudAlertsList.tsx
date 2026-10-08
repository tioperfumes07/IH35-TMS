import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { apiRequest } from "../../../api/client";
import { PageHeader } from "../../../components/layout/PageHeader";
import { Modal } from "../../../components/Modal";
import { Button } from "../../../components/Button";
import { ActionButton } from "../../../components/shared/ActionButton";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { useToast } from "../../../components/Toast";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { userFacingApiError } from "../../../lib/api-error-message";
import { StatusBadge } from "../../../components/layout/StatusBadge";
import { EntityLink } from "../../../components/shared/EntityLink";
import { formatUsdCents } from "../../../lib/money";

type FraudAlertRow = {
  uuid: string;
  fuel_transaction_uuid: string;
  rule_id: string;
  severity: "info" | "warn" | "critical";
  detected_at: string;
  evidence: Record<string, unknown>;
  status: string;
  transaction_at: string;
  gallons: number | null;
  location_city: string | null;
  location_state: string | null;
  // GAP-61/FUEL-F7512 — fuel fraud -> recovery chain (#23710): confirming fraud opens/reuses a
  // fuel.fuel_card_overage_events row; these surface here so the list shows where it stands.
  recovery_event_id: string | null;
  recovery_status: string | null;
};

type FraudRecoveryOutcome =
  | {
      outcome: "opened" | "reused";
      recovery_event_id: string;
      status: string;
      recover_cents: number;
      total_cents: number;
      review_reason: string;
    }
  | { outcome: "refused"; reason: string };

type ConfirmFraudResponse = { alert: FraudAlertRow; recovery: FraudRecoveryOutcome };

type BadgeVariant = "crit" | "warn" | "info" | "positive" | "neutral";

function severityClass(severity: FraudAlertRow["severity"]) {
  if (severity === "critical") return "bg-red-100 text-red-800";
  if (severity === "warn") return "bg-[#F7F8FA] text-[#1F2A44]";
  return "bg-[#F7F8FA] text-[#1F2A44]";
}

function money(cents: number) {
  return formatUsdCents(cents);
}

function alertStatusBadge(status: string): { variant: BadgeVariant; label: string } {
  switch (status) {
    case "open":
      return { variant: "warn", label: "Open" };
    case "investigating":
      return { variant: "info", label: "Investigating" };
    case "dismissed":
      return { variant: "neutral", label: "Dismissed" };
    case "confirmed_fraud":
      return { variant: "crit", label: "Confirmed fraud" };
    case "recovered":
      return { variant: "positive", label: "Recovered" };
    default:
      return { variant: "neutral", label: status.replace(/_/g, " ") };
  }
}

function recoveryStatusBadge(status: string | null): { variant: BadgeVariant; label: string } | null {
  if (!status) return null;
  switch (status) {
    case "pending_review":
      return { variant: "warn", label: "Pending review" };
    case "approved":
      return { variant: "info", label: "Approved" };
    case "posted":
      return { variant: "positive", label: "Posted" };
    case "company_variance":
      return { variant: "neutral", label: "Company variance" };
    case "voided":
      return { variant: "crit", label: "Voided" };
    default:
      return { variant: "neutral", label: status.replace(/_/g, " ") };
  }
}

/** Dollars-string input -> integer cents, or `undefined` to recover the whole purchase (backend default). */
function parseRecoverCents(input: string): { cents: number | undefined } | { error: string } {
  const trimmed = input.trim();
  if (!trimmed) return { cents: undefined };
  const dollars = Number(trimmed);
  if (!Number.isFinite(dollars) || dollars <= 0) return { error: "Enter a positive dollar amount." };
  const cents = Math.round(dollars * 100);
  if (cents <= 0) return { error: "Enter a positive dollar amount." };
  return { cents };
}

// ROUND 297 audit (drill): a reverse section (vendor / unit / driver / load) lands here scoped to its record.
const SCOPE_KEYS = ["vendor_id", "unit_id", "driver_id", "load_id"] as const;

async function listAlerts(companyId: string, status?: string, severity?: string, scope?: { key: string; value: string } | null) {
  const params = new URLSearchParams({ operating_company_id: companyId });
  if (scope) params.set(scope.key, scope.value);
  if (status && status !== "all") params.set("status", status);
  if (severity) params.set("severity", severity);
  return apiRequest<{ alerts: FraudAlertRow[] }>(`/api/v1/fuel/fraud-alerts?${params.toString()}`);
}

export function FraudAlertsListPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const scopeKey = SCOPE_KEYS.find((k) => searchParams.get(k));
  const scope = scopeKey ? { key: scopeKey, value: searchParams.get(scopeKey)! } : null;
  // A drilled view opens on ALL statuses — the set the reverse section counted.
  const [statusFilter, setStatusFilter] = useState(scope ? "all" : "open");
  const [dismissTarget, setDismissTarget] = useState<FraudAlertRow | null>(null);
  const [dismissReason, setDismissReason] = useState("");
  const [attemptDismissClose, setAttemptDismissClose] = useState<() => void>(() => () => {});
  const [confirmFraudTarget, setConfirmFraudTarget] = useState<FraudAlertRow | null>(null);
  const [recoverAmountInput, setRecoverAmountInput] = useState("");
  const [confirmFraudResult, setConfirmFraudResult] = useState<
    { kind: "opened"; message: string } | { kind: "refused"; reason: string } | null
  >(null);
  const lifecycleGenerationRef = useRef(0);

  const alertsQuery = useQuery({
    queryKey: ["fuel", "fraud-alerts", companyId, statusFilter, scope?.key ?? "", scope?.value ?? ""],
    queryFn: () => listAlerts(companyId, statusFilter, undefined, scope),
    enabled: Boolean(companyId),
  });

  const invalidate = (targetCompanyId: string) => {
    void queryClient.invalidateQueries({ queryKey: ["fuel", "fraud-alerts", targetCompanyId] });
  };

  type AlertAction = { uuid: string; companyId: string; generation: number };

  const investigateMut = useMutation({
    mutationFn: (input: AlertAction) =>
      apiRequest(`/api/v1/fuel/fraud-alerts/${input.uuid}/investigate`, {
        method: "PATCH",
        body: { operating_company_id: input.companyId },
      }),
    onSuccess: (_result, input) => {
      if (input.generation !== lifecycleGenerationRef.current) return;
      pushToast("Alert marked investigating.", "success");
      invalidate(input.companyId);
    },
    onError: (error, input) => {
      if (input.generation !== lifecycleGenerationRef.current) return;
      pushToast(userFacingApiError(error, "Could not mark the alert as investigating"), "error");
    },
  });

  const confirmMut = useMutation({
    mutationFn: (input: AlertAction & { recover_cents?: number }) =>
      apiRequest<ConfirmFraudResponse>(`/api/v1/fuel/fraud-alerts/${input.uuid}/confirm-fraud`, {
        method: "PATCH",
        body: { operating_company_id: input.companyId, recover_cents: input.recover_cents },
      }),
    onSuccess: (result, input) => {
      if (input.generation !== lifecycleGenerationRef.current) return;
      const { recovery } = result;
      if (recovery.outcome === "refused") {
        setConfirmFraudResult({ kind: "refused", reason: recovery.reason });
        pushToast(`Alert confirmed as fraud. Recovery not opened: ${recovery.reason}`, "error");
      } else if (recovery.status === "company_variance") {
        const message = "No signed contract authority — company absorbs the loss";
        setConfirmFraudResult({ kind: "opened", message });
        pushToast(message, "error");
      } else {
        const statusLabel = recoveryStatusBadge(recovery.status)?.label ?? recovery.status;
        const message = `Recovery opened: ${statusLabel}, ${money(recovery.recover_cents)} of ${money(recovery.total_cents)} — awaiting approval`;
        setConfirmFraudResult({ kind: "opened", message });
        pushToast(message, "success");
      }
      invalidate(input.companyId);
    },
    onError: (error, input) => {
      if (input.generation !== lifecycleGenerationRef.current) return;
      pushToast(userFacingApiError(error, "Could not confirm the alert as fraud"), "error");
    },
  });

  const dismissMut = useMutation({
    mutationFn: (input: AlertAction & { reason: string }) =>
      apiRequest(`/api/v1/fuel/fraud-alerts/${input.uuid}/dismiss`, {
        method: "PATCH",
        body: { operating_company_id: input.companyId, reason: input.reason },
      }),
    onSuccess: (_result, input) => {
      if (input.generation !== lifecycleGenerationRef.current) return;
      pushToast("Alert dismissed.", "success");
      setDismissTarget(null);
      setDismissReason("");
      invalidate(input.companyId);
    },
    onError: (error, input) => {
      if (input.generation !== lifecycleGenerationRef.current) return;
      pushToast(userFacingApiError(error, "Could not dismiss the alert"), "error");
    },
  });

  // All three operations transition the same canonical alert state. Lock the complete action set
  // while any transition is pending so Investigate/Confirm/Dismiss cannot race each other.
  const actionPending = investigateMut.isPending || confirmMut.isPending || dismissMut.isPending;

  useEffect(() => {
    lifecycleGenerationRef.current += 1;
    investigateMut.reset();
    confirmMut.reset();
    dismissMut.reset();
    setDismissTarget(null);
    setDismissReason("");
    setConfirmFraudTarget(null);
    setRecoverAmountInput("");
    setConfirmFraudResult(null);
    setStatusFilter("open");
  }, [companyId]); // Mutation reset functions are stable; company transitions own fresh action state.

  const rows = alertsQuery.data?.alerts ?? [];

  const closeDismiss = () => {
    if (dismissMut.isPending) return;
    setDismissTarget(null);
    setDismissReason("");
  };

  const closeConfirmFraud = () => {
    if (confirmMut.isPending) return;
    setConfirmFraudTarget(null);
    setRecoverAmountInput("");
    setConfirmFraudResult(null);
  };

  const parsedRecoverAmount = parseRecoverCents(recoverAmountInput);

  const columns = useMemo<ParityColumn<FraudAlertRow>[]>(
    () => [
      { key: "detected_at", label: "Detected", sortable: true, render: (row) => new Date(row.detected_at).toLocaleString() },
      {
        key: "severity",
        label: "Severity",
        sortable: true,
        render: (row) => (
          <span className={`rounded-sm px-1.5 py-0.5 text-xs font-semibold ${severityClass(row.severity)}`}>{row.severity}</span>
        ),
      },
      { key: "rule_id", label: "Rule", sortable: true, cellClass: "font-mono text-xs", render: (row) => row.rule_id },
      {
        key: "location_city",
        label: "Location",
        sortable: true,
        render: (row) => [row.location_city, row.location_state].filter(Boolean).join(", ") || "—",
      },
      { key: "gallons", label: "Gallons", sortable: true, render: (row) => (row.gallons != null ? row.gallons.toFixed(1) : "—") },
      {
        key: "status",
        label: "Status",
        sortable: true,
        render: (row) => {
          const badge = alertStatusBadge(row.status);
          return <StatusBadge variant={badge.variant}>{badge.label}</StatusBadge>;
        },
      },
      {
        key: "recovery_status",
        label: "Recovery",
        sortable: true,
        render: (row) => {
          const badge = recoveryStatusBadge(row.recovery_status);
          if (!badge || !row.recovery_event_id) return <span className="text-xs text-gray-500">—</span>;
          return (
            <EntityLink
              kind="fuel_card_overage_event"
              id={row.recovery_event_id}
              label={<StatusBadge variant={badge.variant}>{badge.label}</StatusBadge>}
              className=""
            />
          );
        },
      },
      {
        key: "actions",
        label: "Actions",
        alwaysVisible: true,
        render: (row) => (
          <div className="flex flex-wrap gap-1">
            <ActionButton disabled={actionPending} onClick={() => {
              if (actionPending) return;
              investigateMut.mutate({ uuid: row.uuid, companyId, generation: lifecycleGenerationRef.current });
            }}>
              Investigate
            </ActionButton>
            <ActionButton disabled={actionPending} onClick={() => {
              if (actionPending) return;
              setConfirmFraudTarget(row);
              setRecoverAmountInput("");
              setConfirmFraudResult(null);
            }}>
              Confirm fraud
            </ActionButton>
            <ActionButton
              disabled={actionPending}
              onClick={() => {
                if (actionPending) return;
                setDismissTarget(row);
                setDismissReason("");
              }}
            >
              Dismiss
            </ActionButton>
          </div>
        ),
      },
    ],
    [actionPending, companyId, investigateMut, confirmMut],
  );

  if (!companyId) {
    return (
      <div className="space-y-3 p-4">
        <PageHeader title="Fuel fraud alerts" subtitle="CAP-11 real-time fuel card fraud monitoring" />
        <div className="rounded-sm border border-dashed border-gray-300 bg-gray-50 p-4 text-xs text-gray-700">
          Select an operating company to view fraud alerts.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title="Fuel fraud alerts"
        subtitle="CAP-11 real-time fuel card fraud monitoring"
        actions={
          <Link to="/fuel" className="text-xs font-semibold text-[#1F2A44] hover:underline">
            Back to Fuel Home
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {scope ? (
          <button
            type="button"
            className="rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] px-2 py-1 text-xs"
            data-testid="fraud-alerts-scope-chip"
            onClick={() => setSearchParams((prev) => { const next = new URLSearchParams(prev); next.delete(scope.key); return next; })}
          >
            {scope.key.replace("_id", "")} only · clear ×
          </button>
        ) : null}
        {["all", "open", "investigating", "dismissed", "confirmed_fraud"].map((status) => (
          <button
            key={status}
            type="button"
            className={`rounded-sm border px-2 py-1 text-xs ${statusFilter === status ? "border-[#E5E7EB] bg-[#F7F8FA]" : "border-gray-300"}`}
            onClick={() => setStatusFilter(status)}
          >
            {status.replace("_", " ")}
          </button>
        ))}
      </div>

      {alertsQuery.isError ? (
        <ListErrorBanner onRetry={() => void alertsQuery.refetch()} />
      ) : (
        <ParityTable
          rows={rows}
          columns={columns}
          rowKey={(row) => row.uuid}
          loading={alertsQuery.isLoading}
          storageKey="fuel-fraud-alerts"
          emptyText="No fraud alerts for this filter."
          exportFilename="fuel-fraud-alerts"
        />
      )}
      <Modal
        open={Boolean(dismissTarget)}
        onClose={closeDismiss}
        title="Dismiss fuel fraud alert"
        confirmDiscardOnClose
        isDirty={Boolean(dismissReason.trim())}
        onRegisterAttemptClose={(attemptClose) => setAttemptDismissClose(() => attemptClose)}
      >
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!dismissTarget || !dismissReason.trim()) return;
            dismissMut.mutate({
              uuid: dismissTarget.uuid,
              reason: dismissReason.trim(),
              companyId,
              generation: lifecycleGenerationRef.current,
            });
          }}
        >
          <label className="block space-y-1 text-xs font-semibold text-gray-700">
            Dismiss reason
            <textarea
              value={dismissReason}
              onChange={(event) => setDismissReason(event.target.value)}
              rows={3}
              autoFocus
              className="w-full rounded-sm border border-gray-300 px-2 py-1.5 text-xs font-normal"
              placeholder="Explain why this alert is not fraud"
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={dismissMut.isPending}
              onClick={attemptDismissClose}
            >
              Cancel
            </Button>
            <Button type="submit" loading={dismissMut.isPending} disabled={!dismissReason.trim()}>
              Dismiss alert
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(confirmFraudTarget)} onClose={closeConfirmFraud} title="Confirm fuel fraud">
        {confirmFraudResult ? (
          <div className="space-y-3" data-testid="fraud-confirm-recovery-result">
            <p
              className={`rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] px-3 py-2 text-xs text-[#1F2A44] ${
                confirmFraudResult.kind === "refused" ? "font-semibold" : ""
              }`}
            >
              {confirmFraudResult.kind === "refused"
                ? `Recovery not opened: ${confirmFraudResult.reason}`
                : confirmFraudResult.message}
            </p>
            <div className="flex justify-end">
              <Button type="button" variant="secondary" onClick={closeConfirmFraud}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!confirmFraudTarget || "error" in parsedRecoverAmount) return;
              confirmMut.mutate({
                uuid: confirmFraudTarget.uuid,
                companyId,
                generation: lifecycleGenerationRef.current,
                recover_cents: parsedRecoverAmount.cents,
              });
            }}
          >
            <p className="text-xs text-gray-700">
              Confirming opens a recovery of the purchase through the fuel card overage engine. It never
              posts — approval happens on the overage review screen.
            </p>
            <label className="block space-y-1 text-xs font-semibold text-gray-700">
              Amount to recover from driver ($)
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={recoverAmountInput}
                onChange={(event) => setRecoverAmountInput(event.target.value)}
                className="w-full rounded-sm border border-gray-300 px-2 py-1.5 text-xs font-normal"
                placeholder="Full purchase amount"
                autoFocus
              />
            </label>
            {"error" in parsedRecoverAmount ? <p className="text-xs text-red-700">{parsedRecoverAmount.error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" disabled={confirmMut.isPending} onClick={closeConfirmFraud}>
                Cancel
              </Button>
              <Button type="submit" loading={confirmMut.isPending} disabled={"error" in parsedRecoverAmount}>
                Confirm fraud
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
