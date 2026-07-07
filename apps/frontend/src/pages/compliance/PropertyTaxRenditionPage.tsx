import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatDateUS } from "../../lib/formatDate";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import {
  addRenditionLine,
  createAppraisalDistrict,
  createRendition,
  fetchAppraisalDistricts,
  fetchCandidateAssets,
  fetchRendition,
  fetchRenditions,
  updateRendition,
  type CandidateAsset,
  type Rendition,
  type RenditionStatus,
} from "../../api/property-tax";

const BREADCRUMB = ["Compliance", "Business Property Tax"];

function centsToUSD(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

const STATUS_LABEL: Record<RenditionStatus, string> = {
  draft: "Draft",
  filed: "Filed",
  appealed: "Appealed",
  settled: "Settled",
};

// ── LIST VIEW ─────────────────────────────────────────────────────────────────────────────────────
function RenditionListView({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient();
  const now = new Date();
  const [taxYear, setTaxYear] = useState<number>(now.getUTCMonth() < 3 ? now.getUTCFullYear() : now.getUTCFullYear());
  const [districtId, setDistrictId] = useState("");
  const [newCounty, setNewCounty] = useState("");
  const [newCadName, setNewCadName] = useState("");
  const [showAddDistrict, setShowAddDistrict] = useState(false);

  const renditionsQ = useQuery({
    queryKey: ["property-tax-renditions", companyId],
    queryFn: () => fetchRenditions(companyId),
    enabled: Boolean(companyId),
  });
  const districtsQ = useQuery({
    queryKey: ["appraisal-districts", companyId],
    queryFn: () => fetchAppraisalDistricts(companyId),
    enabled: Boolean(companyId),
  });

  const createM = useMutation({
    mutationFn: () => createRendition(companyId, { tax_year: taxYear, appraisal_district_id: districtId }),
    onSuccess: () => {
      setDistrictId("");
      void queryClient.invalidateQueries({ queryKey: ["property-tax-renditions", companyId] });
    },
  });

  const addDistrictM = useMutation({
    mutationFn: () => createAppraisalDistrict(companyId, { county: newCounty.trim(), cad_name: newCadName.trim() }),
    onSuccess: (res) => {
      setNewCounty("");
      setNewCadName("");
      setShowAddDistrict(false);
      setDistrictId(res.district.id);
      void queryClient.invalidateQueries({ queryKey: ["appraisal-districts", companyId] });
    },
  });

  const renditions = renditionsQ.data?.renditions ?? [];
  const districts = districtsQ.data?.districts ?? [];

  const renditionColumns = useMemo<ParityColumn<Rendition>[]>(
    () => [
      { key: "tax_year", label: "Tax Year", sortable: true },
      {
        key: "county",
        label: "County / CAD",
        sortable: true,
        render: (r) => `${r.county} — ${r.cad_name}`,
      },
      { key: "status", label: "Status", sortable: true, render: (r) => STATUS_LABEL[r.status] },
      { key: "value_basis", label: "Value Basis", sortable: true, render: (r) => r.value_basis.replace(/_/g, " ") },
      { key: "effective_due_date", label: "Due Date", sortable: true, render: (r) => formatDateUS(r.effective_due_date) },
      { key: "total_rendered_value_cents", label: "Rendered Value", sortable: true, render: (r) => centsToUSD(r.total_rendered_value_cents) },
      { key: "assessed_tax_cents", label: "Assessed Tax", sortable: true, render: (r) => centsToUSD(r.assessed_tax_cents) },
      {
        key: "open",
        label: "Open",
        alwaysVisible: true,
        render: (r) => (
          <Link className="text-slate-700 underline" to={`/compliance/property-tax/${r.id}`}>
            Open
          </Link>
        ),
      },
    ],
    []
  );

  return (
    <div className="space-y-4" data-testid="property-tax-list">
      <PageHeader
        backHref="/compliance"
        breadcrumb={BREADCRUMB}
        title="Business Property Tax"
        subtitle="Texas business personal-property tax renditions (Form 50-144) per entity + appraisal district"
      />

      {/* + Create rendition */}
      <section className="rounded-sm border border-slate-200 bg-white p-3">
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-700">+ Create Rendition</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            Tax Year
            <input
              type="number"
              value={taxYear}
              min={2000}
              max={2100}
              onChange={(e) => setTaxYear(Number(e.target.value))}
              className="ml-1 w-24 rounded-sm border px-2 py-1"
            />
          </label>
          <label className="text-sm">
            Appraisal District
            <select
              value={districtId}
              onChange={(e) => {
                if (e.target.value === "__add__") {
                  setShowAddDistrict(true);
                  return;
                }
                setDistrictId(e.target.value);
              }}
              className="ml-1 rounded-sm border px-2 py-1"
            >
              <option value="">Select…</option>
              {districts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.county} — {d.cad_name}
                </option>
              ))}
              <option value="__add__">+ Add new appraisal district…</option>
            </select>
          </label>
          <button
            type="button"
            disabled={!districtId || createM.isPending}
            onClick={() => createM.mutate()}
            className="rounded-sm bg-[#1f2a44] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            + Create
          </button>
        </div>

        {showAddDistrict ? (
          <div className="mt-3 flex flex-wrap items-end gap-2 rounded-sm border border-slate-200 bg-slate-50 p-2">
            <label className="text-sm">
              County
              <input value={newCounty} onChange={(e) => setNewCounty(e.target.value)} className="ml-1 rounded-sm border px-2 py-1" />
            </label>
            <label className="text-sm">
              CAD Name
              <input value={newCadName} onChange={(e) => setNewCadName(e.target.value)} className="ml-1 rounded-sm border px-2 py-1" />
            </label>
            <button
              type="button"
              disabled={!newCounty.trim() || !newCadName.trim() || addDistrictM.isPending}
              onClick={() => addDistrictM.mutate()}
              className="rounded-sm bg-[#1f2a44] px-2 py-1 text-sm font-semibold text-white disabled:opacity-40"
            >
              Save
            </button>
            <button type="button" onClick={() => setShowAddDistrict(false)} className="px-2 py-1 text-sm text-slate-600">
              Cancel
            </button>
          </div>
        ) : null}
      </section>

      {/* Renditions table */}
      <ParityTable<Rendition>
        columns={renditionColumns}
        rows={renditions}
        rowKey={(r) => r.id}
        loading={renditionsQ.isLoading}
        emptyText="No renditions yet. Create one above for the current tax year."
        storageKey="compliance-property-tax-renditions"
        exportFilename="property-tax-renditions"
      />
    </div>
  );
}

// ── DETAIL VIEW ───────────────────────────────────────────────────────────────────────────────────
function RenditionDetailView({ companyId, renditionId }: { companyId: string; renditionId: string }) {
  const queryClient = useQueryClient();
  const [assessedInput, setAssessedInput] = useState("");
  const [selectedAsset, setSelectedAsset] = useState("");
  const [renderedInput, setRenderedInput] = useState("");
  const [costInput, setCostInput] = useState("");

  const detailQ = useQuery({
    queryKey: ["property-tax-rendition", companyId, renditionId],
    queryFn: () => fetchRendition(companyId, renditionId),
    enabled: Boolean(companyId && renditionId),
  });
  const assetsQ = useQuery({
    queryKey: ["property-tax-candidate-assets", companyId],
    queryFn: () => fetchCandidateAssets(companyId),
    enabled: Boolean(companyId),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["property-tax-rendition", companyId, renditionId] });
    void queryClient.invalidateQueries({ queryKey: ["property-tax-renditions", companyId] });
  };

  const statusM = useMutation({
    mutationFn: (status: RenditionStatus) => updateRendition(companyId, renditionId, { status }),
    onSuccess: invalidate,
  });
  const assessedM = useMutation({
    mutationFn: (cents: number) => updateRendition(companyId, renditionId, { assessed_tax_cents: cents }),
    onSuccess: invalidate,
  });
  const extensionM = useMutation({
    mutationFn: (requested: boolean) =>
      updateRendition(companyId, renditionId, {
        extension_requested: requested,
        extended_due_date: requested && detail ? `${detail.rendition.tax_year}-05-15` : null,
      }),
    onSuccess: invalidate,
  });
  const addLineM = useMutation({
    mutationFn: (asset: CandidateAsset | null) =>
      addRenditionLine(companyId, renditionId, {
        unit_id: asset?.kind === "unit" ? asset.id : null,
        equipment_id: asset?.kind === "equipment" ? asset.id : null,
        asset_description: asset ? asset.label : "Asset",
        asset_category: asset?.kind === "unit" ? "tractor" : asset?.kind === "equipment" ? "trailer" : "other",
        acquisition_date: asset?.acquired_date ?? null,
        acquisition_cost_cents: costInput ? Math.round(Number(costInput) * 100) : null,
        rendered_value_cents: renderedInput ? Math.round(Number(renderedInput) * 100) : 0,
      }),
    onSuccess: () => {
      setSelectedAsset("");
      setRenderedInput("");
      setCostInput("");
      invalidate();
    },
  });

  if (detailQ.isLoading) return <div className="p-4 text-sm text-slate-500">Loading…</div>;
  const detail = detailQ.data;
  if (!detail) return <div className="p-4 text-sm">Rendition not found.</div>;

  const { rendition, lines } = detail;
  const assets = assetsQ.data?.assets ?? [];
  const chosen = assets.find((a) => `${a.kind}:${a.id}` === selectedAsset) ?? null;

  return (
    <div className="space-y-4" data-testid="property-tax-detail">
      <PageHeader
        backHref="/compliance/property-tax"
        breadcrumb={[...BREADCRUMB, `${rendition.tax_year} — ${rendition.county}`]}
        title={`${rendition.tax_year} Rendition — ${rendition.cad_name}`}
        subtitle={`Status: ${STATUS_LABEL[rendition.status]} · Due ${formatDateUS(rendition.effective_due_date)}`}
      />

      {/* Header controls */}
      <section className="grid gap-3 rounded-sm border border-slate-200 bg-white p-3 md:grid-cols-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Status</div>
          <select
            value={rendition.status}
            onChange={(e) => statusM.mutate(e.target.value as RenditionStatus)}
            className="mt-1 rounded-sm border px-2 py-1 text-sm"
          >
            {(["draft", "filed", "appealed", "settled"] as RenditionStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">CAD-Assessed Tax (drives accrual)</div>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="number"
              step="0.01"
              placeholder={rendition.assessed_tax_cents != null ? (rendition.assessed_tax_cents / 100).toFixed(2) : "0.00"}
              value={assessedInput}
              onChange={(e) => setAssessedInput(e.target.value)}
              className="w-32 rounded-sm border px-2 py-1 text-sm"
            />
            <button
              type="button"
              disabled={!assessedInput || assessedM.isPending}
              onClick={() => assessedM.mutate(Math.round(Number(assessedInput) * 100))}
              className="rounded-sm bg-[#1f2a44] px-2 py-1 text-sm font-semibold text-white disabled:opacity-40"
            >
              Save
            </button>
          </div>
          <div className="mt-1 text-xs text-slate-500">Current: {centsToUSD(rendition.assessed_tax_cents)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Extension</div>
          <label className="mt-1 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={rendition.extension_requested}
              onChange={(e) => extensionM.mutate(e.target.checked)}
            />
            Requested (extends deadline to May 15)
          </label>
        </div>
      </section>

      {/* + Add asset line */}
      <section className="rounded-sm border border-slate-200 bg-white p-3">
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-700">Taxable Assets Rendered</h2>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            Asset (owned fleet)
            <select
              value={selectedAsset}
              onChange={(e) => setSelectedAsset(e.target.value)}
              className="ml-1 rounded-sm border px-2 py-1"
            >
              <option value="">Select unit/trailer…</option>
              {assets.map((a) => (
                <option key={`${a.kind}:${a.id}`} value={`${a.kind}:${a.id}`}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Acquisition Cost $
            <input value={costInput} onChange={(e) => setCostInput(e.target.value)} type="number" step="0.01" className="ml-1 w-28 rounded-sm border px-2 py-1" />
          </label>
          <label className="text-sm">
            Rendered Value $
            <input value={renderedInput} onChange={(e) => setRenderedInput(e.target.value)} type="number" step="0.01" className="ml-1 w-28 rounded-sm border px-2 py-1" />
          </label>
          <button
            type="button"
            disabled={!selectedAsset || addLineM.isPending}
            onClick={() => addLineM.mutate(chosen)}
            className="rounded-sm bg-[#1f2a44] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            + Add
          </button>
        </div>
      </section>

      {/* Basis lines */}
      <div className="overflow-x-auto rounded-sm border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 text-left text-slate-600">
            <tr>
              <th className="px-2 py-1.5 font-semibold">Asset</th>
              <th className="px-2 py-1.5 font-semibold">Category</th>
              <th className="px-2 py-1.5 font-semibold">Acquired</th>
              <th className="px-2 py-1.5 font-semibold">Cost</th>
              <th className="px-2 py-1.5 font-semibold">Rendered Value</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td className="p-3 text-slate-500" colSpan={5}>
                  No taxable assets rendered yet.
                </td>
              </tr>
            ) : (
              lines.map((l) => (
                <tr key={l.id} className="border-t border-slate-100">
                  <td className="px-2 py-1.5">{l.asset_description}</td>
                  <td className="px-2 py-1.5">{l.asset_category ?? "—"}</td>
                  <td className="px-2 py-1.5">{l.acquisition_date ? formatDateUS(l.acquisition_date) : "—"}</td>
                  <td className="px-2 py-1.5">{centsToUSD(l.acquisition_cost_cents)}</td>
                  <td className="px-2 py-1.5">{centsToUSD(l.rendered_value_cents)}</td>
                </tr>
              ))
            )}
          </tbody>
          {lines.length > 0 ? (
            <tfoot>
              <tr className="border-t border-slate-200 font-semibold">
                <td className="px-2 py-1.5" colSpan={4}>
                  Total Rendered Value
                </td>
                <td className="px-2 py-1.5">{centsToUSD(rendition.total_rendered_value_cents)}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}

export function PropertyTaxRenditionPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { id } = useParams<{ id?: string }>();

  const content = useMemo(() => {
    if (!companyId) return <div className="rounded-sm border bg-white p-4 text-sm">Select an operating company.</div>;
    return id ? (
      <RenditionDetailView companyId={companyId} renditionId={id} />
    ) : (
      <RenditionListView companyId={companyId} />
    );
  }, [companyId, id]);

  return <div className="space-y-4 p-4">{content}</div>;
}
