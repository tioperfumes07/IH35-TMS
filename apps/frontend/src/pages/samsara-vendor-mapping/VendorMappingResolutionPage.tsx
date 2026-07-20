import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../api/client";
import {
  confirmVendorNameMismatch,
  dedupeVendorMapping,
  fetchVendorMappingIntegrity,
  linkVendorMapping,
  type VendorMappingIntegrityIssue,
} from "../../api/samsara-vendor-mapping";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/layout/PageHeader";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useCompanyContext } from "../../contexts/CompanyContext";

type ActionDraft =
  | {
      type: "link";
      samsara_driver_id: string;
      qbo_vendor_id: string;
      label: string;
    }
  | {
      type: "dedupe";
      samsara_driver_id: string;
      canonical_qbo_vendor_id: string;
      deprecated_qbo_vendor_ids_csv: string;
      label: string;
    }
  | {
      type: "confirm";
      samsara_driver_id: string;
      qbo_vendor_id: string;
      label: string;
      similarity_score: number;
    };

type UnmappedRow = VendorMappingIntegrityIssue["unmapped_drivers"][number] & { _rowId: string };
type DuplicateRow = VendorMappingIntegrityIssue["duplicate_mapping"][number] & { _rowId: string };
type MismatchRow = VendorMappingIntegrityIssue["name_mismatch"][number] & { _rowId: string };

function toErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (typeof error.data === "string") return error.data;
    if (error.data && typeof error.data === "object") {
      const msg = (error.data as { error?: unknown }).error;
      if (typeof msg === "string") return msg;
    }
    return `request failed (${error.status})`;
  }
  if (error instanceof Error) return error.message;
  return "request failed";
}

function splitCsv(raw: string) {
  return raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function totalsText(payload?: VendorMappingIntegrityIssue) {
  if (!payload) return "No issues loaded";
  return `${payload.totals.total_issues} issues (${payload.totals.unmapped_drivers} unmapped, ${payload.totals.duplicate_mapping} duplicate, ${payload.totals.name_mismatch} mismatch)`;
}

function integrityErrorStatus(error: unknown) {
  return error instanceof ApiError ? error.status : 0;
}

export function VendorMappingResolutionPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<ActionDraft | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const integrityQuery = useQuery({
    queryKey: ["samsara-vendor-mapping-integrity", companyId],
    queryFn: () => fetchVendorMappingIntegrity(companyId),
    enabled: Boolean(companyId),
    retry: false,
  });

  const actionMutation = useMutation({
    mutationFn: async (nextDraft: ActionDraft) => {
      if (!companyId) throw new Error("Select an operating company");
      if (nextDraft.type === "link") {
        return linkVendorMapping({
          operating_company_id: companyId,
          samsara_driver_id: nextDraft.samsara_driver_id,
          qbo_vendor_id: nextDraft.qbo_vendor_id.trim(),
        });
      }
      if (nextDraft.type === "dedupe") {
        return dedupeVendorMapping({
          operating_company_id: companyId,
          samsara_driver_id: nextDraft.samsara_driver_id,
          canonical_qbo_vendor_id: nextDraft.canonical_qbo_vendor_id.trim(),
          deprecated_qbo_vendor_ids: splitCsv(nextDraft.deprecated_qbo_vendor_ids_csv),
        });
      }
      return confirmVendorNameMismatch({
        operating_company_id: companyId,
        samsara_driver_id: nextDraft.samsara_driver_id,
        qbo_vendor_id: nextDraft.qbo_vendor_id.trim(),
      });
    },
    onSuccess: async () => {
      setDraft(null);
      setErrorMessage(null);
      await queryClient.invalidateQueries({ queryKey: ["samsara-vendor-mapping-integrity", companyId] });
    },
    onError: (error) => {
      setErrorMessage(toErrorMessage(error));
    },
  });

  const payload = integrityQuery.data;

  const unmappedRows = useMemo(
    (): UnmappedRow[] =>
      (payload?.unmapped_drivers ?? []).map((row) => ({
        ...row,
        _rowId: `${row.samsara_driver_id}:${row.reason}`,
      })),
    [payload?.unmapped_drivers],
  );

  const duplicateRows = useMemo(
    (): DuplicateRow[] =>
      (payload?.duplicate_mapping ?? []).map((row) => ({
        ...row,
        _rowId: row.samsara_driver_id,
      })),
    [payload?.duplicate_mapping],
  );

  const mismatchRows = useMemo(
    (): MismatchRow[] =>
      (payload?.name_mismatch ?? []).map((row) => ({
        ...row,
        _rowId: `${row.samsara_driver_id}:${row.qbo_vendor_id}`,
      })),
    [payload?.name_mismatch],
  );

  const unmappedColumns = useMemo((): Array<ParityColumn<UnmappedRow>> => {
    return [
      { key: "samsara_driver_id", label: "Samsara driver", sortable: true },
      { key: "driver_name", label: "Name", sortable: true },
      { key: "reason", label: "Reason", sortable: true },
      {
        key: "action",
        label: "Action",
        alwaysVisible: true,
        render: (row) => (
          <Button
            onClick={() =>
              setDraft({
                type: "link",
                samsara_driver_id: row.samsara_driver_id,
                qbo_vendor_id: "",
                label: `Link ${row.driver_name}`,
              })
            }
          >
            Resolve
          </Button>
        ),
      },
    ];
  }, []);

  const duplicateColumns = useMemo((): Array<ParityColumn<DuplicateRow>> => {
    return [
      { key: "samsara_driver_id", label: "Samsara driver", sortable: true },
      { key: "vendor_count", label: "Vendor count", sortable: true },
      {
        key: "qbo_vendor_ids",
        label: "Vendor ids",
        sortable: true,
        sortValue: (row) => row.qbo_vendor_ids.join(", "),
        render: (row) => row.qbo_vendor_ids.join(", "),
      },
      {
        key: "action",
        label: "Action",
        alwaysVisible: true,
        render: (row) => (
          <Button
            onClick={() =>
              setDraft({
                type: "dedupe",
                samsara_driver_id: row.samsara_driver_id,
                canonical_qbo_vendor_id: row.qbo_vendor_ids[0] ?? "",
                deprecated_qbo_vendor_ids_csv: row.qbo_vendor_ids.slice(1).join(","),
                label: `Dedupe ${row.samsara_driver_id}`,
              })
            }
          >
            Resolve
          </Button>
        ),
      },
    ];
  }, []);

  const mismatchColumns = useMemo((): Array<ParityColumn<MismatchRow>> => {
    return [
      { key: "samsara_driver_id", label: "Samsara driver", sortable: true },
      { key: "samsara_name", label: "Samsara name", sortable: true },
      { key: "qbo_vendor_name", label: "QBO vendor name", sortable: true },
      {
        key: "similarity_score",
        label: "Score",
        sortable: true,
        sortValue: (row) => row.similarity_score,
        render: (row) => row.similarity_score.toFixed(3),
      },
      {
        key: "action",
        label: "Action",
        alwaysVisible: true,
        render: (row) => (
          <Button
            onClick={() =>
              setDraft({
                type: "confirm",
                samsara_driver_id: row.samsara_driver_id,
                qbo_vendor_id: row.qbo_vendor_id,
                label: `Confirm ${row.samsara_driver_id}`,
                similarity_score: row.similarity_score,
              })
            }
          >
            Resolve
          </Button>
        ),
      },
    ];
  }, []);

  const preview = useMemo(() => {
    if (!draft) return null;
    if (draft.type === "link") {
      return {
        before: "Driver has no valid QBO vendor mapping",
        after: `Driver mapping will point to vendor ${draft.qbo_vendor_id || "(required)"}`,
      };
    }
    if (draft.type === "dedupe") {
      return {
        before: `Deprecated vendors: ${draft.deprecated_qbo_vendor_ids_csv || "(required)"}`,
        after: `All listed mappings will point to canonical vendor ${draft.canonical_qbo_vendor_id || "(required)"}`,
      };
    }
    return {
      before: `Name mismatch remains visible (score ${draft.similarity_score.toFixed(3)})`,
      after: `Owner confirmation will be recorded for vendor ${draft.qbo_vendor_id || "(required)"}`,
    };
  }, [draft]);

  return (
    <div className="space-y-4 p-4">
      <PageHeader title="Samsara Vendor Mapping Resolution" subtitle="Resolve unmapped, duplicate, and drifted driver-to-vendor mappings" />
      {!companyId ? <div className="rounded-sm border border-red-200 bg-red-50 p-3 text-sm text-red-700">Select an operating company.</div> : null}

      {integrityQuery.isError ? (
        <ListErrorState
          title="Couldn't load vendor mapping integrity"
          status={integrityErrorStatus(integrityQuery.error)}
          message={(integrityQuery.error as Error)?.message}
          onRetry={() => void integrityQuery.refetch()}
        />
      ) : (
        <>
          <div className="rounded-sm border border-slate-200 bg-white p-3 text-xs text-slate-600">{totalsText(payload)}</div>

          <section className="rounded-sm border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900">Unmapped drivers</div>
            <div className="overflow-x-auto p-2">
              <ParityTable<UnmappedRow>
                columns={unmappedColumns}
                rows={unmappedRows}
                rowKey={(row) => row._rowId}
                loading={integrityQuery.isLoading}
                emptyText="No unmapped drivers."
                storageKey="vendor-mapping-resolution-unmapped"
                exportFilename="vendor-mapping-unmapped"
                tableTestId="vendor-mapping-unmapped-table"
              />
            </div>
          </section>

          <section className="rounded-sm border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900">Duplicate mappings</div>
            <div className="overflow-x-auto p-2">
              <ParityTable<DuplicateRow>
                columns={duplicateColumns}
                rows={duplicateRows}
                rowKey={(row) => row._rowId}
                loading={integrityQuery.isLoading}
                emptyText="No duplicate mappings."
                storageKey="vendor-mapping-resolution-duplicate"
                exportFilename="vendor-mapping-duplicate"
                tableTestId="vendor-mapping-duplicate-table"
              />
            </div>
          </section>

          <section className="rounded-sm border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900">Name mismatch</div>
            <div className="overflow-x-auto p-2">
              <ParityTable<MismatchRow>
                columns={mismatchColumns}
                rows={mismatchRows}
                rowKey={(row) => row._rowId}
                loading={integrityQuery.isLoading}
                emptyText="No name mismatches."
                storageKey="vendor-mapping-resolution-name-mismatch"
                exportFilename="vendor-mapping-name-mismatch"
                tableTestId="vendor-mapping-name-mismatch-table"
              />
            </div>
          </section>
        </>
      )}

      {draft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-sm border border-slate-200 bg-white p-4 shadow-xl">
            <div className="mb-3 text-sm font-semibold text-slate-900">{draft.label}</div>

            {draft.type === "link" ? (
              <label className="mb-3 block text-xs text-slate-700">
                QBO vendor id
                <input
                  value={draft.qbo_vendor_id}
                  onChange={(e) => setDraft({ ...draft, qbo_vendor_id: e.target.value })}
                  className="mt-1 w-full rounded-sm border border-slate-300 px-2 py-1 text-sm"
                  placeholder="vendor UUID or qbo_id"
                />
              </label>
            ) : null}

            {draft.type === "dedupe" ? (
              <div className="space-y-3">
                <label className="block text-xs text-slate-700">
                  Canonical vendor id
                  <input
                    value={draft.canonical_qbo_vendor_id}
                    onChange={(e) => setDraft({ ...draft, canonical_qbo_vendor_id: e.target.value })}
                    className="mt-1 w-full rounded-sm border border-slate-300 px-2 py-1 text-sm"
                    placeholder="vendor UUID or qbo_id"
                  />
                </label>
                <label className="block text-xs text-slate-700">
                  Deprecated vendor ids (comma-separated)
                  <input
                    value={draft.deprecated_qbo_vendor_ids_csv}
                    onChange={(e) => setDraft({ ...draft, deprecated_qbo_vendor_ids_csv: e.target.value })}
                    className="mt-1 w-full rounded-sm border border-slate-300 px-2 py-1 text-sm"
                    placeholder="id-1,id-2"
                  />
                </label>
              </div>
            ) : null}

            {draft.type === "confirm" ? (
              <label className="mb-3 block text-xs text-slate-700">
                QBO vendor id
                <input
                  value={draft.qbo_vendor_id}
                  onChange={(e) => setDraft({ ...draft, qbo_vendor_id: e.target.value })}
                  className="mt-1 w-full rounded-sm border border-slate-300 px-2 py-1 text-sm"
                />
              </label>
            ) : null}

            <div className="mb-3 rounded-sm border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              <div className="font-semibold text-slate-900">Before / after preview</div>
              <div className="mt-1">Before: {preview?.before}</div>
              <div className="mt-1">After: {preview?.after}</div>
            </div>

            {errorMessage ? <div className="mb-2 text-xs text-red-700">{errorMessage}</div> : null}

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button onClick={() => void actionMutation.mutateAsync(draft)} loading={actionMutation.isPending}>
                Confirm resolution
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
