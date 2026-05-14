import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useSearchParams } from "react-router-dom";
import { getUnit, patchUnit } from "../../api/mdata";
import { listClassesForJe } from "../../api/accounting";
import { PageHeader } from "../../components/layout/PageHeader";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { Button } from "../../components/Button";
import { QboCombobox } from "../../components/forms/QboCombobox";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useToast } from "../../components/Toast";

export function AssetProfilePage() {
  const { id = "" } = useParams();
  const [searchParams] = useSearchParams();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const [qboVendorId, setQboVendorId] = useState<string | null>(null);
  const [qboVendorLabel, setQboVendorLabel] = useState("");
  const [qboClassTmsId, setQboClassTmsId] = useState("");

  const unitQuery = useQuery({
    queryKey: ["mdata-unit", id],
    queryFn: () => getUnit(id),
    enabled: Boolean(id),
  });

  const classesQuery = useQuery({
    queryKey: ["list-classes-je"],
    queryFn: listClassesForJe,
    enabled: Boolean(companyId),
  });

  const unit = unitQuery.data as Record<string, unknown> | undefined;

  useEffect(() => {
    if (!unit) return;
    setQboVendorId((unit.qbo_vendor_id as string | null) ?? null);
    setQboVendorLabel("");
    setQboClassTmsId(String(unit.qbo_class_id ?? ""));
  }, [unit?.id, unit?.qbo_vendor_id, unit?.qbo_class_id]);

  useEffect(() => {
    if (!unit) return;
    const tab = searchParams.get("tab");
    const anchor = tab === "maintenance" ? "asset-maintenance" : tab === "financial" ? "asset-financial" : null;
    if (!anchor) return;
    queueMicrotask(() => document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [searchParams, unit?.id]);

  const saveMutation = useMutation({
    mutationFn: () =>
      patchUnit(id, {
        qbo_vendor_id: qboVendorId || null,
        qbo_class_id: qboClassTmsId || null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["mdata-unit", id] });
      pushToast("Unit QBO fields saved", "success");
    },
    onError: () => pushToast("Failed to save", "error"),
  });

  return (
    <div className="space-y-3 p-4">
      <PageHeader title={`Unit ${String(unit?.unit_number ?? id.slice(0, 8))}`} subtitle="Fleet asset · QBO vendor & class for reporting" />
      {unitQuery.isError ? <ListErrorBanner onRetry={() => void unitQuery.refetch()} /> : null}
      {!companyId ? <p className="text-sm text-red-600">Select operating company.</p> : null}

      <div id="asset-financial" className="max-w-2xl scroll-mt-4 space-y-3 rounded border border-gray-200 bg-white p-4">
        <div className="text-xs font-semibold text-gray-600">QBO mapping</div>
        <label className="block text-xs text-gray-600">
          QBO vendor (ownership / lease entity)
          <div className="mt-1">
            <QboCombobox
              entityType="vendor"
              operatingCompanyId={companyId}
              value={qboVendorId}
              displayValue={qboVendorLabel}
              onChange={(qId, name) => {
                setQboVendorId(qId);
                setQboVendorLabel(name);
              }}
            />
          </div>
        </label>
        <label className="block text-xs text-gray-600">
          Class (TMS catalog)
          <select className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm" value={qboClassTmsId} onChange={(e) => setQboClassTmsId(e.target.value)}>
            <option value="">None</option>
            {(classesQuery.data?.classes ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.class_code ? `${c.class_code} — ` : ""}
                {c.class_name}
              </option>
            ))}
          </select>
        </label>
        <Button size="sm" disabled={!id || !companyId} loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
          Save
        </Button>
      </div>
      <div id="asset-maintenance" className="scroll-mt-4 rounded border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
        Maintenance history and WO drill-down continue to live in the maintenance console; this anchor supports deep links from Block W reports.
      </div>
    </div>
  );
}
