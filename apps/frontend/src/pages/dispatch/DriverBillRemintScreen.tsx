import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  listLoadsNeedingDriverBillRemint,
  remintAllDriverBills,
  remintDriverBill,
  type NeedsDriverBillRemintRow,
} from "../../api/loads";
import { ListErrorState } from "../../components/ListErrorState";
import { PageHeader } from "../../components/layout/PageHeader";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { VoidReasonModal } from "../../components/accounting/VoidReasonModal";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { userFacingApiError } from "../../lib/api-error-message";

// ACCT-F10164 REMINT SCREEN — LAW-FIX-INSTANTLY register item 8 (bills never auto-created: 39
// delivered loads with zero driver_bills, ~16 real, $14,789.50). Every load listed here already
// re-entered the SAME shared mint (ensureDriverBillArtifactsForLoad, ACCT-F277) that Book Load and
// the status-transition PATCH already use — nothing new is invented on the money side, this is
// purely the missing VISIBILITY + bulk-action surface for loads already at rest with no bill.
export function DriverBillRemintScreen() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [remintingId, setRemintingId] = useState<string | null>(null);
  const [remintingAll, setRemintingAll] = useState(false);
  const [reasonModalOpen, setReasonModalOpen] = useState(false);
  const [reasonModalTitle, setReasonModalTitle] = useState("Remint driver bill");
  const [reasonModalEntity, setReasonModalEntity] = useState<string | undefined>(undefined);
  const [pendingAction, setPendingAction] = useState<"one" | "all" | null>(null);
  const [pendingRow, setPendingRow] = useState<NeedsDriverBillRemintRow | null>(null);

  const query = useQuery({
    queryKey: ["dispatch", "needs-driver-bill-remint", companyId],
    queryFn: () => listLoadsNeedingDriverBillRemint(companyId),
    enabled: Boolean(companyId),
  });

  const rows = query.data?.loads ?? [];

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["dispatch", "needs-driver-bill-remint", companyId] });
  }

  function handleRemintOne(row: NeedsDriverBillRemintRow) {
    setPendingAction("one");
    setPendingRow(row);
    setReasonModalTitle(`Remint driver bill for ${row.load_number}`);
    setReasonModalEntity(`Load ${row.load_number}`);
    setReasonModalOpen(true);
  }

  function handleRemintAll() {
    setPendingAction("all");
    setPendingRow(null);
    setReasonModalTitle(`Remint driver bills for all ${rows.length} loads`);
    setReasonModalEntity(`${rows.length} loads`);
    setReasonModalOpen(true);
  }

  async function submitRemintReason(reason: string) {
    const trimmed = reason.trim();
    if (!trimmed) {
      pushToast("A reason is required to remint", "error");
      return;
    }
    if (pendingAction === "one" && pendingRow) {
      const row = pendingRow;
      setRemintingId(row.id);
      try {
        const result = await remintDriverBill(row.id, companyId, trimmed);
        if ("ok" in result) {
          pushToast(`${row.load_number}: ${result.outcome.outcome.replace(/_/g, " ")}`, "success");
        } else {
          pushToast(userFacingApiError(result, "Remint blocked"), "error");
        }
        await refresh();
      } catch (error) {
        pushToast(userFacingApiError(error, "Remint failed"), "error");
      } finally {
        setRemintingId(null);
      }
    } else if (pendingAction === "all") {
      setRemintingAll(true);
      try {
        const result = await remintAllDriverBills(companyId, trimmed);
        const minted = result.outcomes.filter((o) => o.outcome === "minted").length;
        const skipped = result.outcomes.filter((o) => o.outcome === "skipped_no_pay_rate").length;
        const already = result.outcomes.filter((o) => o.outcome === "already_exists").length;
        pushToast(`Reminted ${minted} · already existed ${already} · still no pay rate ${skipped}`, minted > 0 ? "success" : "info");
        await refresh();
      } catch (error) {
        pushToast(userFacingApiError(error, "Remint-all failed"), "error");
      } finally {
        setRemintingAll(false);
      }
    }
    setReasonModalOpen(false);
    setPendingAction(null);
    setPendingRow(null);
  }

  const columns = useMemo<ParityColumn<NeedsDriverBillRemintRow>[]>(
    () => [
      {
        key: "load_number",
        label: "Load",
        sortable: true,
        className: "font-medium",
        render: (row) => <EntityLinkOrTombstone kind="load" id={row.id} name={row.load_number} noun="Load" />,
      },
      { key: "driver_name", label: "Driver", sortable: true, render: (row) => row.driver_name ?? "— unassigned —" },
      { key: "status", label: "Status", sortable: true, render: (row) => row.status.replace(/_/g, " ") },
      {
        key: "is_sample_data",
        label: "Data",
        sortable: true,
        render: (row) => (row.is_sample_data ? "Sample" : "Real"),
      },
      {
        key: "actions",
        label: "",
        sortable: false,
        render: (row) => (
          <Button variant="secondary" size="sm" disabled={remintingId === row.id} onClick={() => void handleRemintOne(row)}>
            {remintingId === row.id ? "Reminting…" : "Remint"}
          </Button>
        ),
      },
    ],
    [remintingId]
  );

  if (!companyId) {
    return (
      <div className="space-y-3">
        <PageHeader title="Driver Bill Remint" subtitle="Select a company first" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title="Driver Bill Remint"
        subtitle={`${query.data?.real_count ?? 0} real loads (of ${query.data?.total_count ?? 0} total) delivered with no driver bill`}
        actions={
          <Button variant="primary" size="sm" disabled={remintingAll || rows.length === 0} onClick={() => void handleRemintAll()}>
            {remintingAll ? "Reminting all…" : `Remint all (${rows.length})`}
          </Button>
        }
      />
      {query.isError ? (
        <ListErrorState
          title="Couldn't load the driver-bill remint queue"
          status={0}
          message={(query.error as Error)?.message}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <ParityTable appearance="board"
          rows={rows}
          columns={columns}
          rowKey={(row) => row.id}
          loading={query.isPending}
          emptyText="No loads are past delivery evidence with a missing driver bill."
        />
      )}
      <VoidReasonModal
        open={reasonModalOpen}
        title={reasonModalTitle}
        entityRef={reasonModalEntity}
        submitLabel="Remint"
        postsReversingEntry={false}
        onClose={() => setReasonModalOpen(false)}
        onSubmit={submitRemintReason}
      />
    </div>
  );
}
