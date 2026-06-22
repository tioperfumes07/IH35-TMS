import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiRequest } from "../../api/client";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useToast } from "../../components/Toast";
import { ReportsSubNav } from "./ReportsSubNav";

type FieldDef = { id: string; label: string };

type CustomDefinition = {
  id: string;
  name: string;
  fields: FieldDef[];
  filters: Record<string, unknown>;
  is_shared: boolean;
};

function withCompany(path: string, companyId: string) {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}operating_company_id=${encodeURIComponent(companyId)}`;
}

export function CustomReportBuilder() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [selectedFields, setSelectedFields] = useState<FieldDef[]>([]);
  const [filterReportId, setFilterReportId] = useState("");

  const fieldsQuery = useQuery({
    queryKey: ["custom-report-fields"],
    queryFn: () => apiRequest<{ fields: FieldDef[] }>("/api/v1/reports/custom-definitions/fields"),
  });

  const savedQuery = useQuery({
    queryKey: ["custom-report-definitions", companyId],
    queryFn: () =>
      apiRequest<{ rows: CustomDefinition[] }>(withCompany("/api/v1/reports/custom-definitions", companyId)),
    enabled: Boolean(companyId),
  });

  const available = fieldsQuery.data?.fields ?? [];
  const unselected = useMemo(
    () => available.filter((f) => !selectedFields.some((s) => s.id === f.id)),
    [available, selectedFields]
  );

  const saveMut = useMutation({
    mutationFn: () =>
      apiRequest(withCompany("/api/v1/reports/custom-definitions", companyId), {
        method: "POST",
        body: {
          operating_company_id: companyId,
          name: name.trim(),
          fields: selectedFields,
          filters: filterReportId ? { report_id: filterReportId } : {},
          group_by: [],
          sort_by: [{ field: "run_at", direction: "desc" }],
          is_shared: false,
        },
      }),
    onSuccess: () => {
      pushToast("Saved to your list", "success");
      setName("");
      setSelectedFields([]);
      void qc.invalidateQueries({ queryKey: ["custom-report-definitions"] });
    },
    onError: () => pushToast("Save failed", "error"),
  });

  const runMut = useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ row_count: number; name: string }>(
        withCompany(`/api/v1/reports/custom-definitions/${id}/run`, companyId),
        { method: "POST", body: {} }
      ),
    onSuccess: (data) => pushToast(`Ran "${data.name}" — ${data.row_count} rows`, "success"),
    onError: () => pushToast("Run failed", "error"),
  });

  function addField(field: FieldDef) {
    setSelectedFields((prev) => [...prev, field]);
  }

  function removeField(id: string) {
    setSelectedFields((prev) => prev.filter((f) => f.id !== id));
  }

  return (
    <div className="space-y-3">
      <ReportsSubNav />
      <PageHeader
        title="Custom report builder"
        subtitle="Drag fields, choose filters, save to your Saved list"
        actions={
          <Link to="/reports" className="text-xs font-semibold text-slate-700 hover:underline">
            ← Reports
          </Link>
        }
      />

      {!companyId ? <p className="text-sm text-red-600">Select an operating company.</p> : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="rounded border border-slate-200 bg-white p-3">
          <h3 className="text-sm font-semibold text-slate-900">Available fields</h3>
          <ul className="mt-2 space-y-1">
            {unselected.map((field) => (
              <li key={field.id}>
                <button
                  type="button"
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", field.id)}
                  onClick={() => addField(field)}
                  className="w-full rounded border border-dashed border-slate-300 bg-slate-50 px-2 py-1 text-left text-xs font-semibold text-slate-800 hover:border-[#1f2a44]"
                >
                  {field.label}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section
          className="rounded border border-slate-200 bg-white p-3"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const id = e.dataTransfer.getData("text/plain");
            const field = available.find((f) => f.id === id);
            if (field) addField(field);
          }}
        >
          <h3 className="text-sm font-semibold text-slate-900">Report layout</h3>
          <input
            className="mt-2 w-full rounded border border-slate-300 px-2 py-1 text-sm"
            placeholder="Report name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="mt-2 w-full rounded border border-slate-300 px-2 py-1 text-sm"
            placeholder="Filter: report_id (optional)"
            value={filterReportId}
            onChange={(e) => setFilterReportId(e.target.value)}
          />
          <div className="mt-2 min-h-[120px] rounded border border-dashed border-slate-300 bg-slate-100/40 p-2">
            {selectedFields.length === 0 ? (
              <p className="text-xs text-slate-500">Drop fields here or click to add</p>
            ) : (
              selectedFields.map((field, idx) => (
                <div key={field.id} className="mb-1 flex items-center justify-between rounded bg-white px-2 py-1 text-xs">
                  <span>
                    {idx + 1}. {field.label}
                  </span>
                  <button type="button" className="text-red-700" onClick={() => removeField(field.id)}>
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
          <Button
            className="mt-2"
            disabled={!companyId || !name.trim() || selectedFields.length === 0 || saveMut.isPending}
            onClick={() => saveMut.mutate()}
          >
            Save to Saved
          </Button>
        </section>
      </div>

      <section className="rounded border border-slate-200 bg-white p-3">
        <h3 className="text-sm font-semibold text-slate-900">Saved custom reports</h3>
        <div className="mt-2 space-y-2">
          {(savedQuery.data?.rows ?? []).length === 0 ? (
            <p className="text-xs text-slate-500">No saved reports yet.</p>
          ) : null}
          {(savedQuery.data?.rows ?? []).map((row) => (
            <div key={row.id} className="flex items-center justify-between rounded border border-slate-100 bg-slate-50 px-3 py-2">
              <div>
                <div className="text-xs font-semibold text-slate-900">{row.name}</div>
                <div className="text-[11px] text-slate-500">{row.fields.length} fields</div>
              </div>
              <Button variant="secondary" onClick={() => runMut.mutate(row.id)}>
                Run
              </Button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default CustomReportBuilder;
