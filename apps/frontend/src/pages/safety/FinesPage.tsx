import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { convertFineToLiability, getSafetyFines } from "../../api/safety";
import { CompanyViolationsPage } from "./CompanyViolationsPage";
import { FineCreateModal } from "./components/FineCreateModal";
import { FineDetailDrawer } from "./components/FineDetailDrawer";
import { SelectCombobox } from "../../components/shared/SelectCombobox";

type Props = {
  operatingCompanyId: string;
};

/** A23-9: merged company violations into External Fines via record-type filter (RBC option a). */
type RecordTypeFilter = "driver-fine" | "company-violation";

export function FinesPage({ operatingCompanyId }: Props) {
  const queryClient = useQueryClient();
  const [recordTypeFilter, setRecordTypeFilter] = useState<RecordTypeFilter>("driver-fine");
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

  const rows = useMemo(() => finesQuery.data?.fines ?? [], [finesQuery.data?.fines]);

  if (recordTypeFilter === "company-violation") {
    return (
      <div className="space-y-3" data-testid="external-fines-page">
        <div className="flex flex-wrap items-center gap-2">
          <div data-testid="fines-record-type-filter">
            <SelectCombobox
              value={recordTypeFilter}
              onChange={(event) => setRecordTypeFilter(event.target.value as RecordTypeFilter)}
              className="rounded border border-gray-300 px-2 py-1 text-xs"
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div data-testid="fines-record-type-filter">
            <SelectCombobox
              value={recordTypeFilter}
              onChange={(event) => setRecordTypeFilter(event.target.value as RecordTypeFilter)}
              className="rounded border border-gray-300 px-2 py-1 text-xs"
            >
              <option value="driver-fine">Driver Fine</option>
              <option value="company-violation">Company Violation</option>
            </SelectCombobox>
          </div>
          <SelectCombobox
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-xs"
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
            className="rounded border border-gray-300 px-2 py-1 text-xs"
          >
            <option value="">All subjects</option>
            <option value="driver">Driver</option>
            <option value="company">Company</option>
          </SelectCombobox>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="rounded bg-blue-700 px-3 py-1 text-xs font-semibold text-white"
        >
          + Create Fine
        </button>
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-[980px] w-full text-left text-xs">
          <thead className="bg-gray-50 text-[10px] uppercase text-gray-600">
            <tr>
              <th className="px-2 py-1">Issued</th>
              <th className="px-2 py-1">Subject</th>
              <th className="px-2 py-1">Authority</th>
              <th className="px-2 py-1">Violation</th>
              <th className="px-2 py-1">Amount</th>
              <th className="px-2 py-1">Status</th>
              <th className="px-2 py-1">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row.id)} className="border-t border-gray-100">
                <td className="px-2 py-1">{String(row.issued_date ?? "").slice(0, 10)}</td>
                <td className="px-2 py-1">{String(row.subject_type ?? "—")}</td>
                <td className="px-2 py-1">{String(row.issued_by_authority ?? "—")}</td>
                <td className="px-2 py-1">{String(row.violation_description ?? "—")}</td>
                <td className="px-2 py-1">${(Number(row.amount_cents ?? 0) / 100).toFixed(2)}</td>
                <td className="px-2 py-1">{String(row.status ?? "open")}</td>
                <td className="px-2 py-1">
                  <button
                    type="button"
                    className="text-blue-700 underline"
                    onClick={() => setSelectedFine(row)}
                  >
                    Open
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-2 py-3 text-center text-gray-500">
                  No fines found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <FineCreateModal
        open={createOpen}
        operatingCompanyId={operatingCompanyId}
        onClose={() => setCreateOpen(false)}
        onCreated={() => void queryClient.invalidateQueries({ queryKey: ["safety", "fines", operatingCompanyId] })}
      />

      <FineDetailDrawer
        open={Boolean(selectedFine)}
        fine={selectedFine}
        operatingCompanyId={operatingCompanyId}
        converting={convertMutation.isPending}
        onClose={() => setSelectedFine(null)}
        onConvertToLiability={(fineId) => convertMutation.mutate(fineId)}
        onUpdated={() => void queryClient.invalidateQueries({ queryKey: ["safety", "fines", operatingCompanyId] })}
      />
    </div>
  );
}
