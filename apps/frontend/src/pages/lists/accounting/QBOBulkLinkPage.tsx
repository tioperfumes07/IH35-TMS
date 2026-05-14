import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BackArrowHeader } from "../../../components/layout/BackArrowHeader";
import { Button } from "../../../components/Button";
import { QboCombobox } from "../../../components/forms/QboCombobox";
import { useToast } from "../../../components/Toast";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { getQboUnlinkedEntities, postQboBulkLink, type UnlinkedEntityRow } from "../../../api/qbo-integration";

type Step = 1 | 2 | 3;
type EntityType = "drivers" | "assets" | "both";

type RowEdit = UnlinkedEntityRow & {
  accept: boolean;
  qbo_vendor_id: string | null;
  qbo_class_id: string | null;
};

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

  return (
    <div className="space-y-4">
      <BackArrowHeader backTo="/lists" breadcrumb={["Lists", "Accounting", "QBO bulk-link"]} title="QBO vendor / class bulk-link" />
      {!companyId ? <p className="text-sm text-red-600">Select an operating company.</p> : null}

      {step === 1 ? (
        <div className="space-y-3 rounded border border-gray-200 bg-white p-4 text-sm">
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
          {unlinkedQuery.isError ? <p className="text-sm text-red-600">Could not load unlinked entities.</p> : null}
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
              <div className="overflow-auto rounded border border-gray-200 bg-white">
                <table className="min-w-full text-left text-xs">
                  <thead className="bg-gray-50 text-[11px] font-semibold uppercase text-gray-600">
                    <tr>
                      <th className="px-2 py-2">✓</th>
                      <th className="px-2 py-2">Entity</th>
                      <th className="px-2 py-2">Kind</th>
                      <th className="px-2 py-2">QBO vendor</th>
                      <th className="px-2 py-2">QBO class</th>
                      <th className="px-2 py-2">Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={`${r.entity_kind}-${r.id}`} className="border-t border-gray-100">
                        <td className="px-2 py-2 align-top">
                          <input
                            type="checkbox"
                            checked={r.accept}
                            onChange={(e) =>
                              setRows((prev) =>
                                prev.map((x) => (x.id === r.id && x.entity_kind === r.entity_kind ? { ...x, accept: e.target.checked } : x))
                              )
                            }
                          />
                        </td>
                        <td className="px-2 py-2 align-top font-medium">{r.name}</td>
                        <td className="px-2 py-2 align-top">{r.entity_kind}</td>
                        <td className="px-2 py-2 align-top">
                          {r.entity_kind === "equipment" ? (
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
                          )}
                        </td>
                        <td className="px-2 py-2 align-top">
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
                        </td>
                        <td className="px-2 py-2 align-top">{(r.match_confidence * 100).toFixed(0)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {withMatches.length > 0 ? (
                <p className="text-xs text-gray-500">
                  {withMatches.length} row{withMatches.length === 1 ? "" : "s"} with auto suggestions ({noMatches.length} without).
                </p>
              ) : null}
              {noMatches.length > 0 ? (
                <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs">
                  <div className="font-semibold text-amber-900">No automatic match</div>
                  <ul className="mt-1 max-h-40 list-inside list-disc overflow-auto text-amber-800">
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
        <div className="space-y-3 rounded border border-gray-200 bg-white p-4 text-sm">
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
