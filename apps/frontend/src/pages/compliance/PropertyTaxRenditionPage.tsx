import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useSearchParams } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatDateUS } from "../../lib/formatDate";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { Combobox } from "../../components/Combobox";
import { EntityLink } from "../../components/shared/EntityLink";
import { EntityPicker } from "../../components/parity/EntityPicker";
import { Button } from "../../components/Button";
import { useStagedListFilters } from "../../components/table";
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
  type RenditionLine,
  type RenditionStatus,
} from "../../api/property-tax";

const BREADCRUMB = ["Compliance", "Business Property Tax"];

const EMPTY_FILTERS = {
  unitId: "",
};

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
function RenditionListView({
  companyId,
  unitId,
  draftUnitId,
  onUnitFilterChange,
  filtersDirty,
  onApplyFilters,
  onCancelFilters,
  onResetFilters,
}: {
  companyId: string;
  unitId?: string;
  draftUnitId: string;
  onUnitFilterChange: (next: string) => void;
  filtersDirty: boolean;
  onApplyFilters: () => void;
  onCancelFilters: () => void;
  onResetFilters: () => void;
}) {
  const queryClient = useQueryClient();
  const now = new Date();
  const [taxYear, setTaxYear] = useState<number>(now.getUTCMonth() < 3 ? now.getUTCFullYear() : now.getUTCFullYear());
  const [districtId, setDistrictId] = useState("");
  const [newCounty, setNewCounty] = useState("");
  const [newCadName, setNewCadName] = useState("");
  const [showAddDistrict, setShowAddDistrict] = useState(false);

  const renditionsQ = useQuery({
    queryKey: ["property-tax-renditions", companyId, unitId ?? null],
    queryFn: () => fetchRenditions(companyId, unitId),
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
  const districtOptions = districts.map((district) => ({
    value: district.id,
    label: `${district.county} — ${district.cad_name}`,
  }));

  if (renditionsQ.isError || districtsQ.isError) {
    return (
      <div className="space-y-4" data-testid="property-tax-list">
        <PageHeader
          backHref="/compliance"
          breadcrumb={BREADCRUMB}
          title="Business Property Tax"
          subtitle="Texas business personal-property tax renditions (Form 50-144) per entity + appraisal district"
        />
        <ListErrorBanner
          onRetry={() => {
            void renditionsQ.refetch();
            void districtsQ.refetch();
          }}
        />
      </div>
    );
  }

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
          <EntityLink className="text-slate-700 underline" kind="property_tax_rendition" id={r.id} label="Open" />
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
        subtitle={unitId ? "Renditions containing this unit" : "Texas business personal-property tax renditions (Form 50-144) per entity + appraisal district"}
      />

      <div className="relative flex flex-wrap items-end gap-3" data-testid="property-tax-filters">
        <label className="text-[11px] text-slate-600">
          Unit
          <EntityPicker
            kind="unit"
            operatingCompanyId={companyId}
            value={draftUnitId || null}
            onChange={(next) => onUnitFilterChange(next ?? "")}
            allowCreate={false}
            placeholder="All units"
            className="mt-1"
            dataTestId="property-tax-filter-unit"
          />
        </label>
        <Button type="button" size="sm" data-testid="property-tax-filter-apply" onClick={onApplyFilters} disabled={!filtersDirty}>
          Apply
        </Button>
        <Button type="button" size="sm" variant="secondary" data-testid="property-tax-filter-cancel" onClick={onCancelFilters} disabled={!filtersDirty}>
          Cancel
        </Button>
        <Button type="button" size="sm" variant="secondary" data-testid="property-tax-filter-reset" onClick={onResetFilters}>
          Reset
        </Button>
      </div>

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
          <div className="min-w-64 text-sm">
            <label htmlFor="property-tax-district-picker">Appraisal District</label>
            <Combobox
              id="property-tax-district-picker"
              className="mt-1"
              options={districtOptions}
              value={districtId || null}
              onChange={(next) => setDistrictId(next ?? "")}
              placeholder="Select…"
              loading={districtsQ.isLoading}
              allowAddNew={{ label: "+ Add new appraisal district", onAdd: () => setShowAddDistrict(true) }}
            />
          </div>
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

  if (detailQ.isError || assetsQ.isError) {
    return (
      <div className="space-y-4" data-testid="property-tax-detail">
        <PageHeader backHref="/compliance/property-tax" breadcrumb={BREADCRUMB} title="Rendition" />
        <ListErrorBanner
          onRetry={() => {
            void detailQ.refetch();
            void assetsQ.refetch();
          }}
        />
      </div>
    );
  }

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

      {/* CLS-CHROME-LAW-8: line-add button relabeled from "+ Add" (forbidden verb) to "+ Create
          Line", matching InvoiceDetailPage.tsx's identical add-a-row-to-a-list pattern. */}
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
            + Create Line
          </button>
        </div>
      </section>

      {/* Basis lines — COMP-F3548: ParityTable owns Search+Range+gear on taxable assets. */}
      <ParityTable<RenditionLine>
        columns={[
          {
            key: "asset_description",
            label: "Asset",
            render: (l) =>
              l.unit_id ? (
                <EntityLink kind="unit" id={l.unit_id} label={l.asset_description} />
              ) : l.equipment_id ? (
                <EntityLink kind="trailer" id={l.equipment_id} label={l.asset_description} />
              ) : (
                l.asset_description
              ),
          },
          {
            key: "asset_category",
            label: "Category",
            render: (l) => l.asset_category ?? "—",
          },
          {
            key: "acquisition_date",
            label: "Acquired",
            sortable: true,
            render: (l) => (l.acquisition_date ? formatDateUS(l.acquisition_date) : "—"),
          },
          {
            key: "acquisition_cost_cents",
            label: "Cost",
            sortable: true,
            render: (l) => centsToUSD(l.acquisition_cost_cents),
          },
          {
            key: "rendered_value_cents",
            label: "Rendered Value",
            sortable: true,
            render: (l) => centsToUSD(l.rendered_value_cents),
          },
        ]}
        rows={lines}
        rowKey={(l) => l.id}
        loading={false}
        emptyText="No taxable assets rendered yet."
        storageKey="property-tax-rendition-lines"
        exportFilename="property-tax-rendition-lines"
        tableTestId="property-tax-rendition-lines-table"
        filterBar={
          lines.length > 0 ? (
            <div className="text-xs font-semibold text-slate-700" data-testid="property-tax-total-rendered">
              Total Rendered Value: {centsToUSD(rendition.total_rendered_value_cents)}
            </div>
          ) : null
        }
      />
    </div>
  );
}

export function PropertyTaxRenditionPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { id } = useParams<{ id?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  // LST-F5180 — visible EntityPicker (URL-only unit_id is not reverse chrome).
  // LV-COMPLIANCE-PROPERTY-TAX-FILTER-SILENT-APPLY — stage until Apply; URL on Apply/Reset.
  const unitIdFromUrl = searchParams.get("unit_id")?.trim() ?? "";

  function patchListSearchParam(next: { unitId: string }) {
    const p = new URLSearchParams(searchParams);
    if (next.unitId) p.set("unit_id", next.unitId);
    else p.delete("unit_id");
    setSearchParams(p, { replace: true });
  }

  const [applied, setApplied] = useState(() => ({
    ...EMPTY_FILTERS,
    unitId: unitIdFromUrl,
  }));
  const staged = useStagedListFilters({
    applied,
    empty: EMPTY_FILTERS,
    onApply: (next) => {
      setApplied(next);
      patchListSearchParam(next);
    },
  });

  useEffect(() => {
    setApplied((prev) => ({ ...prev, unitId: unitIdFromUrl }));
  }, [unitIdFromUrl]);

  function setUnitFilter(next: string) {
    staged.setDraft((d) => ({ ...d, unitId: next }));
  }

  const effectiveUnitId = applied.unitId.trim() || undefined;

  const content = useMemo(() => {
    if (!companyId) return <div className="rounded-sm border bg-white p-4 text-sm">Select an operating company.</div>;
    return id ? (
      <RenditionDetailView companyId={companyId} renditionId={id} />
    ) : (
      <RenditionListView
        companyId={companyId}
        unitId={effectiveUnitId}
        draftUnitId={staged.draft.unitId}
        onUnitFilterChange={setUnitFilter}
        filtersDirty={staged.dirty}
        onApplyFilters={staged.apply}
        onCancelFilters={staged.cancel}
        onResetFilters={() => {
          staged.cancel();
          setApplied(EMPTY_FILTERS);
          patchListSearchParam(EMPTY_FILTERS);
        }}
      />
    );
  }, [companyId, id, effectiveUnitId, staged.draft.unitId, staged.dirty, staged.apply, staged.cancel]);

  return <div className="space-y-4 p-4">{content}</div>;
}
