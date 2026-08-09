import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { formatDateUS } from "../../lib/formatDate";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { convertFineToLiability, getSafetyFines } from "../../api/safety";
import { CompanyViolationsPage } from "./CompanyViolationsPage";
import { FineCreateModal } from "./components/FineCreateModal";
import { FineDetailDrawer } from "./components/FineDetailDrawer";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ListErrorState } from "../../components/ListErrorState";
import { EntityLink } from "../../components/shared/EntityLink";

type FineRow = Record<string, unknown>;

type Props = {
  operatingCompanyId: string;
};

/** A23-9: merged company violations into External Fines via record-type filter (RBC option a). */
type RecordTypeFilter = "driver-fine" | "company-violation";

export function FinesPage({ operatingCompanyId }: Props) {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  // C-06: Home "Open Company Violations" drills with ?record_type=company-violation so the
  // merged External Fines tab opens on the company-violation filter (not the driver-fine default).
  const recordTypeFromUrl = searchParams.get("record_type");
  const initialRecordType: RecordTypeFilter =
    recordTypeFromUrl === "company-violation" ? "company-violation" : "driver-fine";
  const [recordTypeFilter, setRecordTypeFilter] = useState<RecordTypeFilter>(initialRecordType);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [subjectTypeFilter, setSubjectTypeFilter] = useState<string>("");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedFine, setSelectedFine] = useState<Record<string, unknown> | null>(null);

  const finesQuery = useQuery({
    queryKey: ["safety", "fines", operatingCompanyId, statusFilter, subjectTypeFilter],
    queryFn: () =>
      getSafetyFines(operatingCompanyId, {
        status: statusFilter || undefined,
        subject_type: subjectTypeFilter ? (subjectTypeFilter as "driver" | "company") : undefined,
      }),
    enabled: Boolean(operatingCompanyId),
  });

  const convertMutation = useMutation({
    mutationFn: (fineId: string) => convertFineToLiability(fineId, operatingCompanyId),
    onSuccess: (payload) => {
      const fineId = String(payload.fine?.id ?? "");
      queryClient.setQueryData(
        ["safety", "fines", operatingCompanyId, statusFilter, subjectTypeFilter],
        (old: { fines?: Array<Record<string, unknown>> } | undefined) => {
          if (!old?.fines) return old;
          return {
            ...old,
            fines: old.fines.map((fine) => (String(fine.id) === fineId ? payload.fine : fine)),
          };
        }
      );
      void queryClient.invalidateQueries({ queryKey: ["driver-settlements"] });
    },
  });

  const rows = finesQuery.data?.fines ?? [];

  // SAF-F33 reverse drill-through: /safety/external-fines?fine_id=<id> opens that fine's drawer.
  const fineIdParam = searchParams.get("fine_id");
  useEffect(() => {
    if (!fineIdParam || rows.length === 0) return;
    const match = rows.find((r) => String(r.id) === fineIdParam);
    if (match) {
      setSelectedFine(match);
      const next = new URLSearchParams(searchParams);
      next.delete("fine_id");
      setSearchParams(next, { replace: true });
    }
  }, [fineIdParam, rows, searchParams, setSearchParams]);

  useEffect(() => {
    if (recordTypeFromUrl === "company-violation" || recordTypeFromUrl === "driver-fine") {
      setRecordTypeFilter(recordTypeFromUrl);
    }
  }, [recordTypeFromUrl]);

  // SAF-B12: the drawer's lifecycle actions (contest / dismiss / reduce / link-payment) invalidate this
  // query. `selectedFine` is a snapshot of the row taken when the drawer opened, so on its own the drawer
  // would keep rendering the PRE-action status and amount after a successful write — the operator would
  // see "open" on a fine they just contested and reasonably conclude nothing happened. Re-point at the
  // refetched row DURING RENDER (not in an effect — that would be a cascading setState). If the new status
  // filters the row out of the list we keep the last snapshot so the drawer does not blank out.
  const activeFine = selectedFine
    ? rows.find((row) => String(row.id) === String(selectedFine.id)) ?? selectedFine
    : null;

  // Migrated to the shared QBO-parity grid — columns, order, and the per-row "Open" action are
  // preserved verbatim (§7 additive-only).
  const columns: Array<ParityColumn<FineRow>> = [
    { key: "issued_date", label: "Issued", sortable: true, render: (row) => formatDateUS(row.issued_date) },
    { key: "subject_type", label: "Subject", sortable: true, render: (row) => String(row.subject_type ?? "—") },
    {
      // SAF-F18: show the driver NAME (from the server-side join) as a drill-through link — was a raw
      // subject_driver_id uuid, or nothing. Company-subject fines have no driver → dash.
      key: "subject_driver_name",
      label: "Driver",
      render: (row) =>
        row.subject_driver_id ? (
          <EntityLink
            kind="driver"
            id={String(row.subject_driver_id)}
            label={(row.subject_driver_name as string | undefined) ?? undefined}
          />
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    { key: "issued_by_authority", label: "Authority", render: (row) => String(row.issued_by_authority ?? "—") },
    { key: "violation_description", label: "Violation", render: (row) => String(row.violation_description ?? "—") },
    { key: "amount_cents", label: "Amount", render: (row) => `$${(Number(row.amount_cents ?? 0) / 100).toFixed(2)}` },
    { key: "status", label: "Status", sortable: true, render: (row) => String(row.status ?? "open") },
    {
      key: "action",
      label: "Action",
      render: (row) => (
        <button type="button" className="text-slate-700 underline" onClick={() => setSelectedFine(row)}>
          Open
        </button>
      ),
    },
  ];

  if (recordTypeFilter === "company-violation") {
    return (
      <div className="space-y-3" data-testid="external-fines-page">
        <div className="flex flex-wrap items-center gap-2">
          <div data-testid="fines-record-type-filter">
            <SelectCombobox
              value={recordTypeFilter}
              onChange={(event) => setRecordTypeFilter(event.target.value as RecordTypeFilter)}
              className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
            >
              <option value="driver-fine">Driver Fine</option>
              <option value="company-violation">Company Violation</option>
            </SelectCombobox>
          </div>
        </div>
        <CompanyViolationsPage operatingCompanyId={operatingCompanyId} />
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="external-fines-page">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="rounded-sm bg-[#1F2A44] px-3 py-1 text-xs font-semibold text-white"
        >
          + Create Fine
        </button>
      </div>

      {finesQuery.isError ? (
        <ListErrorState
          title="Couldn't load fines"
          status={0}
          message={(finesQuery.error as Error)?.message}
          onRetry={() => void finesQuery.refetch()}
        />
      ) : (
      <ParityTable<FineRow>
        columns={columns}
        rows={rows}
        rowKey={(row) => String(row.id)}
        loading={finesQuery.isLoading}
        emptyText="No fines found."
        storageKey="safety-external-fines"
        exportFilename="external-fines"
        filterBar={
          <div className="relative flex flex-wrap items-center gap-2">
            <div data-testid="fines-record-type-filter">
              <SelectCombobox
                value={recordTypeFilter}
                onChange={(event) => setRecordTypeFilter(event.target.value as RecordTypeFilter)}
                className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
              >
                <option value="driver-fine">Driver Fine</option>
                <option value="company-violation">Company Violation</option>
              </SelectCombobox>
            </div>
            <SelectCombobox
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
            >
              <option value="">All statuses</option>
              <option value="open">Open</option>
              <option value="paid">Paid</option>
              <option value="contested">Contested</option>
              <option value="dismissed">Dismissed</option>
              <option value="reduced">Reduced</option>
            </SelectCombobox>
            <SelectCombobox
              value={subjectTypeFilter}
              onChange={(event) => setSubjectTypeFilter(event.target.value)}
              className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
            >
              <option value="">All subjects</option>
              <option value="driver">Driver</option>
              <option value="company">Company</option>
            </SelectCombobox>
          </div>
        }
      />
      )}

      <FineCreateModal
        open={createOpen}
        operatingCompanyId={operatingCompanyId}
        onClose={() => setCreateOpen(false)}
        onCreated={() => void queryClient.invalidateQueries({ queryKey: ["safety", "fines", operatingCompanyId] })}
      />

      <FineDetailDrawer
        open={Boolean(activeFine)}
        fine={activeFine}
        operatingCompanyId={operatingCompanyId}
        converting={convertMutation.isPending}
        onClose={() => setSelectedFine(null)}
        onConvertToLiability={(fineId) => convertMutation.mutate(fineId)}
        onUpdated={() => void queryClient.invalidateQueries({ queryKey: ["safety", "fines", operatingCompanyId] })}
      />
    </div>
  );
}
