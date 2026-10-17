import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BackArrowHeader } from "../../../components/layout/BackArrowHeader";
import { Button } from "../../../components/Button";
import { ListErrorState } from "../../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { ApiError } from "../../../api/client";
import { getQboUnlinkedEntities, type UnlinkedEntityRow } from "../../../api/qbo-integration";
import { InfoPopover } from "../../../components/shared/InfoPopover";

/*
 * 443.137 9e — QBO is a read-only archive ("USMCA is entirely our TMS ERP").
 *
 * This page used to be a 3-step wizard whose step 2 put a QBO-mirror picker in every row and whose
 * step 3 ("Apply bulk link") wrote the picked QuickBooks ids onto NATIVE rows
 * (mdata.drivers / mdata.units qbo_vendor_id + qbo_class_id). The class column even searched QBO
 * ACCOUNTS, so it wrote an account id into a column the driver profile reads as a TMS class id.
 * The page's whole purpose is QBO linking, there is no native equivalent to swap in, so the write
 * path is removed rather than re-pointed: the page is now a read-only review of the archive's
 * suggested matches. Native linkage lives on the record itself — a driver's payee is the A/P vendor
 * on the driver profile (mdata.vendors.driver_id), a unit's ownership / lease entity is its Owner
 * Company / Leased To Company, and class is the TMS class catalog on each profile.
 */
type Step = 1 | 2;
type EntityType = "drivers" | "assets" | "both";

function unlinkedErrorStatus(error: unknown) {
  return error instanceof ApiError ? error.status : 0;
}

function archiveId(value: string | null) {
  return value ? <span className="font-mono">{value}</span> : <span className="text-gray-400">—</span>;
}

export function QBOBulkLinkPage() {
  const { selectedCompanyId, selectedCompany } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  // USMCA/TRK are TMS-native — the QBO archive review is TRANSP-only (hub twin #8751).
  const qboAvailable = selectedCompany?.code === "TRANSP";
  const [step, setStep] = useState<Step>(1);
  const [entityType, setEntityType] = useState<EntityType>("drivers");

  const unlinkedQuery = useQuery({
    queryKey: ["qbo", "unlinked", companyId, entityType],
    queryFn: () => getQboUnlinkedEntities(companyId, entityType),
    enabled: Boolean(companyId && qboAvailable) && step >= 2,
    staleTime: 60_000,
  });

  const rows = useMemo(() => unlinkedQuery.data?.entities ?? [], [unlinkedQuery.data]);
  const withMatches = useMemo(
    () => rows.filter((r) => (r.suggested_qbo_vendor_id || r.suggested_qbo_class_id) && r.match_confidence > 0),
    [rows]
  );
  const noMatches = useMemo(() => rows.filter((r) => !r.suggested_qbo_vendor_id && !r.suggested_qbo_class_id), [rows]);

  // Display-only ParityTable columns — the archive's suggestions are shown, never written.
  const columns = useMemo<Array<ParityColumn<UnlinkedEntityRow>>>(
    () => [
      {
        key: "name",
        label: "Entity",
        sortable: true,
        cellClass: "font-medium",
      },
      {
        key: "entity_kind",
        label: "Kind",
        sortable: true,
      },
      {
        key: "suggested_qbo_vendor_id",
        label: "QBO vendor",
        sortable: true,
        render: (r) => (r.entity_kind === "equipment" ? <span className="text-gray-400">—</span> : archiveId(r.suggested_qbo_vendor_id)),
      },
      {
        key: "suggested_qbo_class_id",
        label: "QBO class",
        sortable: true,
        render: (r) => archiveId(r.suggested_qbo_class_id),
      },
      {
        key: "match_confidence",
        label: "Confidence",
        sortable: true,
        sortValue: (r) => r.match_confidence,
        render: (r) => `${(r.match_confidence * 100).toFixed(0)}%`,
      },
    ],
    []
  );

  return (
    <div className="space-y-4">
      <BackArrowHeader backTo="/lists" breadcrumb={["Lists", "Accounting", "QBO bulk-link"]} title="QBO vendor / class bulk-link" />
      {!companyId ? <p className="text-xs text-red-600">Select an operating company.</p> : null}
      {companyId && !qboAvailable ? (
        <p className="rounded-sm border border-[#E5E7EB] bg-white p-4 text-xs text-[#4B5563]" data-testid="qbo-bulk-link-transp-only">
          QBO bulk-link is available for TRANSP only. USMCA and Trucking are TMS-native and do not use a QuickBooks vendor/class mirror.
        </p>
      ) : null}

      {qboAvailable ? (
        <p className="rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] p-3 text-xs text-[#4B5563]" data-testid="qbo-bulk-link-read-only">
          QuickBooks is a read-only archive.{" "}
          <InfoPopover label="About QuickBooks matches">
            This review shows the archive&apos;s suggested matches and writes nothing. Link a driver&apos;s payee with the A/P
            vendor on the driver profile; a unit&apos;s ownership is its Owner Company in Edit.
          </InfoPopover>
        </p>
      ) : null}

      {qboAvailable && step === 1 ? (
        <div className="space-y-3 rounded-sm border border-gray-200 bg-white p-4 text-xs">
          <p className="text-gray-600">Review drivers and fleet assets against QuickBooks Online vendors and classes (snapshot archive).</p>
          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input type="radio" name="etype" checked={entityType === "drivers"} onChange={() => setEntityType("drivers")} />
              Drivers only
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="etype" checked={entityType === "assets"} onChange={() => setEntityType("assets")} />
              Assets (units + coupled equipment) only
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="etype" checked={entityType === "both"} onChange={() => setEntityType("both")} />
              Both
            </label>
          </div>
          <Button onClick={() => setStep(2)}>Continue — load unlinked</Button>
        </div>
      ) : null}

      {qboAvailable && step === 2 ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="secondary" onClick={() => setStep(1)}>
              Back
            </Button>
          </div>
          {unlinkedQuery.isLoading ? <p className="text-xs text-gray-500">Loading suggestions…</p> : null}
          {unlinkedQuery.isError ? (
            <ListErrorState
              title="Could not load unlinked entities."
              status={unlinkedErrorStatus(unlinkedQuery.error)}
              message={(unlinkedQuery.error as Error)?.message}
              onRetry={() => void unlinkedQuery.refetch()}
            />
          ) : null}
          {unlinkedQuery.isSuccess ? (
            <>
              <p className="text-xs text-gray-600">Matches use Levenshtein-style confidence on entity names vs QBO archive labels.</p>
              <ParityTable<UnlinkedEntityRow>
                columns={columns}
                title="Unlinked records — QuickBooks match suggestions"
                rows={rows}
                rowKey={(r) => `${r.entity_kind}-${r.id}`}
                emptyText="No unlinked entities."
                storageKey="qbo-bulk-link-unlinked"
                tableTestId="qbo-bulk-link-table"
              />
              {withMatches.length > 0 ? (
                <p className="text-xs text-gray-500">
                  {withMatches.length} row{withMatches.length === 1 ? "" : "s"} with archive suggestions ({noMatches.length} without).
                </p>
              ) : null}
              {noMatches.length > 0 ? (
                <div className="rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] p-3 text-xs">
                  <div className="font-semibold text-[#1F2A44]">No automatic match</div>
                  <ul className="mt-1 max-h-40 list-inside list-disc overflow-auto text-[#1F2A44]">
                    {noMatches.map((r) => (
                      <li key={`${r.entity_kind}-${r.id}`}>
                        {r.name} ({r.entity_kind})
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
