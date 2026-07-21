import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BackArrowHeader } from "../../../components/layout/BackArrowHeader";
import { Button } from "../../../components/Button";
import { ListErrorState } from "../../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { QboCombobox } from "../../../components/forms/QboCombobox";
import { useToast } from "../../../components/Toast";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { ApiError } from "../../../api/client";
import { getQboUnlinkedEntities, postQboBulkLink, type UnlinkedEntityRow } from "../../../api/qbo-integration";

type Step = 1 | 2 | 3;
type EntityType = "drivers" | "assets" | "both";

type RowEdit = UnlinkedEntityRow & {
  accept: boolean;
  qbo_vendor_id: string | null;
  qbo_class_id: string | null;
};

function unlinkedErrorStatus(error: unknown) {
  return error instanceof ApiError ? error.status : 0;
}

export function QBOBulkLinkPage() {
  const { pushToast } = useToast();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [step, setStep] = useState<Step>(1);
  const [entityType, setEntityType] = useState<EntityType>("drivers");
  const [rows, setRows] = useState<RowEdit[]>([]);

  const unlinkedQuery = useQuery({
    queryKey: ["qbo", "unlinked", companyId, entityType],
    queryFn: () => getQboUnlinkedEntities(companyId, entityType),
    enabled: Boolean(companyId) && step >= 2,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (step !== 2 || !unlinkedQuery.isSuccess || !unlinkedQuery.data) return;
    setRows((prev) => {
      if (prev.length > 0) return prev;
      return unlinkedQuery.data.entities.map((r) => ({
        ...r,
        accept: r.match_confidence >= 0.5,
        qbo_vendor_id: r.suggested_qbo_vendor_id,
        qbo_class_id: r.suggested_qbo_class_id,
      }));
    });
  }, [step, unlinkedQuery.isSuccess, unlinkedQuery.data]);

  const withMatches = useMemo(() => rows.filter((r) => (r.qbo_vendor_id || r.qbo_class_id) && r.match_confidence > 0), [rows]);
  const noMatches = useMemo(() => rows.filter((r) => !r.qbo_vendor_id && !r.qbo_class_id), [rows]);

  const bulkMutation = useMutation({
    mutationFn: () => {
      const mappings = rows
        .filter((r) => r.accept)
        .map((r) => ({
          entity_kind: r.entity_kind,
          entity_id: r.id,
          qbo_vendor_id: r.qbo_vendor_id || null,
          qbo_class_id: r.qbo_class_id || null,
        }))
        .filter((m) => m.qbo_vendor_id || m.qbo_class_id);
      return postQboBulkLink(companyId, { type: entityType, mappings });
    },
    onSuccess: (res) => {
      pushToast(`Bulk link: applied ${res.applied}, failed ${res.failed}`, res.failed ? "info" : "success");
      if (res.errors.length) {
        console.warn("[qbo bulk-link]", res.errors);
      }
      setStep(1);
      setRows([]);
    },
    onError: (e) => pushToast(String((e as Error).message || "Bulk link failed"), "error"),
  });

  const acceptedCount = rows.filter((r) => r.accept && (r.qbo_vendor_id || r.qbo_class_id)).length;

  // Display-only ParityTable columns — cell renderers preserve the accept checkbox and the
  // QboCombobox link controls 1:1 from the former hand-rolled table markup.
  const columns = useMemo<Array<ParityColumn<RowEdit>>>(
    () => [
      {
        key: "accept",
        label: "",
        alwaysVisible: true,
        render: (r) => (
          <input
            type="checkbox"
            aria-label="Select"
            checked={r.accept}
            onChange={(e) =>
              setRows((prev) =>
                prev.map((x) => (x.id === r.id && x.entity_kind === r.entity_kind ? { ...x, accept: e.target.checked } : x))
              )
            }
          />
        ),
      },
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
        key: "qbo_vendor_id",
        label: "QBO vendor",
        render: (r) =>
          r.entity_kind === "equipment" ? (
            <span className="text-gray-400">—</span>
          ) : (
            <QboCombobox
              entityType="vendor"
              operatingCompanyId={companyId}
              value={r.qbo_vendor_id}
              displayValue=""
              allowFreeText={false}
              onChange={(id) =>
                setRows((prev) =>
                  prev.map((x) => (x.id === r.id && x.entity_kind === r.entity_kind ? { ...x, qbo_vendor_id: id } : x))
                )
              }
            />
          ),
      },
      {
        key: "qbo_class_id",
        label: "QBO class",
        render: (r) => (
          <QboCombobox
            entityType="account"
            operatingCompanyId={companyId}
            value={r.qbo_class_id}
            displayValue=""
            allowFreeText={false}
            onChange={(id) =>
              setRows((prev) =>
                prev.map((x) => (x.id === r.id && x.entity_kind === r.entity_kind ? { ...x, qbo_class_id: id } : x))
              )
            }
          />
        ),
      },
      {
        key: "match_confidence",
        label: "Confidence",
        sortable: true,
        sortValue: (r) => r.match_confidence,
        render: (r) => `${(r.match_confidence * 100).toFixed(0)}%`,
      },
    ],
    [companyId]
  );

  return (
    <div className="space-y-4">
      <BackArrowHeader backTo="/lists" breadcrumb={["Lists", "Accounting", "QBO bulk-link"]} title="QBO vendor / class bulk-link" />
      {!companyId ? <p className="text-sm text-red-600">Select an operating company.</p> : null}

      {step === 1 ? (
        <div className="space-y-3 rounded-sm border border-gray-200 bg-white p-4 text-sm">
          <p className="text-gray-600">Link drivers and fleet assets to existing QuickBooks Online vendors and classes (snapshot archive).</p>
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
          <Button
            onClick={() => {
              setRows([]);
              setStep(2);
            }}
          >
            Continue — load unlinked
          </Button>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-3">
          {unlinkedQuery.isLoading ? <p className="text-sm text-gray-500">Loading suggestions…</p> : null}
          {unlinkedQuery.isError ? (
            <ListErrorState
              title="Could not load unlinked entities."
              status={unlinkedErrorStatus(unlinkedQuery.error)}
              message={(unlinkedQuery.error as Error)?.message}
              onRetry={() => void unlinkedQuery.refetch()}
            />
          ) : null}
          {unlinkedQuery.isSuccess && rows.length > 0 ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setStep(1);
                    setRows([]);
                  }}
                >
                  Back
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    const all = rows.every((r) => r.accept);
                    setRows((prev) => prev.map((r) => ({ ...r, accept: !all })));
                  }}
                >
                  Toggle all accept
                </Button>
                <Button onClick={() => setStep(3)} disabled={acceptedCount === 0}>
                  Continue — confirm
                </Button>
              </div>
              <p className="text-xs text-gray-600">Matches use Levenshtein-style confidence on entity names vs QBO archive labels.</p>
              <ParityTable<RowEdit>
                columns={columns}
                rows={rows}
                rowKey={(r) => `${r.entity_kind}-${r.id}`}
                emptyText="No unlinked entities."
                storageKey="qbo-bulk-link-unlinked"
                tableTestId="qbo-bulk-link-table"
              />
              {withMatches.length > 0 ? (
                <p className="text-xs text-gray-500">
                  {withMatches.length} row{withMatches.length === 1 ? "" : "s"} with auto suggestions ({noMatches.length} without).
                </p>
              ) : null}
              {noMatches.length > 0 ? (
                <div className="rounded-sm border border-slate-200 bg-slate-50 p-3 text-xs">
                  <div className="font-semibold text-slate-800">No automatic match</div>
                  <ul className="mt-1 max-h-40 list-inside list-disc overflow-auto text-slate-700">
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

      {step === 3 ? (
        <div className="space-y-3 rounded-sm border border-gray-200 bg-white p-4 text-sm">
          <div>
            Summary: <strong>{rows.filter((r) => r.accept && r.entity_kind === "driver").length}</strong> drivers,{" "}
            <strong>{rows.filter((r) => r.accept && r.entity_kind !== "driver").length}</strong> fleet rows accepted for link.
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button loading={bulkMutation.isPending} onClick={() => bulkMutation.mutate()}>
              Apply bulk link
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
