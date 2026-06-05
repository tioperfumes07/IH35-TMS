import { useQueries, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  getMaintenanceWorkOrderPdfUrl,
  getWoCostContext,
  getWorkOrder,
  getWorkOrderPostingPreview,
  listMaintenanceVehicles,
  listSevereRepairEstimates,
} from "../../api/maintenance";
import { Button } from "../../components/Button";
import { TwoSectionLineEditor, type TwoSectionLine } from "../../components/forms/TwoSectionLineEditor";
import { PageHeader } from "../../components/forms/shared/PageHeader";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { UploadZone } from "../../components/UploadZone";
import { LaborTracker } from "../../components/maintenance/LaborTracker";
import { useCompanyContext } from "../../contexts/CompanyContext";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
/** Matches apps/backend/src/maintenance/wo-oos-estimator.ts DEFAULT_DAILY_LOSS_CENTS */
const OOS_DAILY_LOSS_CENTS = 50_000;

function pickInvoiceTotalCents(wo: Record<string, unknown>): number | null {
  for (const key of ["vendor_invoice_total_cents", "external_vendor_invoice_cents", "invoice_total_cents"]) {
    const v = wo[key];
    if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  }
  const numeric = wo.vendor_invoice_total;
  if (typeof numeric === "number" && Number.isFinite(numeric)) return Math.round(numeric * 100);
  return null;
}

function sumLineItemsCents(lineItems: unknown): number {
  if (!Array.isArray(lineItems)) return 0;
  let sum = 0;
  for (const raw of lineItems) {
    if (!raw || typeof raw !== "object") continue;
    const line = raw as Record<string, unknown>;
    if (typeof line.total_cents === "number") {
      sum += line.total_cents;
      continue;
    }
    if (typeof line.line_total_cents === "number") {
      sum += line.line_total_cents;
      continue;
    }
    if (typeof line.total_cost === "number") {
      sum += Math.round(line.total_cost * 100);
    }
  }
  return sum;
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function normalizeLineItems(lineItems: unknown): TwoSectionLine[] {
  if (!Array.isArray(lineItems)) return [];
  const normalized: TwoSectionLine[] = [];
  lineItems.forEach((raw, index) => {
    if (!raw || typeof raw !== "object") return;
    const line = raw as Record<string, unknown>;
    const lineType = String(line.line_type ?? "").toLowerCase();
    const sectionRaw = String(line.section ?? "");
    const quantity = toFiniteNumber(line.quantity, 1);
    const unitCost =
      toFiniteNumber(line.unit_cost, Number.NaN) ||
      toFiniteNumber(line.unit_cost_cents, Number.NaN) / 100 ||
      toFiniteNumber(line.amount, Number.NaN);
    const amount =
      toFiniteNumber(line.amount, Number.NaN) ||
      toFiniteNumber(line.total_cost, Number.NaN) ||
      toFiniteNumber(line.total_cents, Number.NaN) / 100 ||
      quantity * toFiniteNumber(unitCost, 0);
    const description = String(line.description ?? line.part_description ?? line.labor_label ?? `Line ${index + 1}`);
    const id = String(line.id ?? `${index}`);
    const forcedSection = sectionRaw === "A" || sectionRaw === "B" ? sectionRaw : null;
    const isPartsOrLabor = lineType === "parts" || lineType === "labor";
    const section = forcedSection ?? (isPartsOrLabor ? "B" : "A");

    if (section === "A") {
      normalized.push({
        id,
        section,
        description,
        quantity,
        unit_cost: toFiniteNumber(unitCost, toFiniteNumber(amount, 0)),
        amount: toFiniteNumber(amount, 0),
        expense_category_uuid: String(line.expense_category_uuid ?? line.ps_category_id ?? ""),
      });
      return;
    }

    const subRowsRaw = Array.isArray(line.sub_rows) ? line.sub_rows : [];
    const subRows =
      subRowsRaw.length > 0
        ? subRowsRaw
            .map((subRaw, subIndex) => {
              if (!subRaw || typeof subRaw !== "object") return null;
              const sub = subRaw as Record<string, unknown>;
              const subQty = toFiniteNumber(sub.quantity, 1);
              const subUnitCost =
                toFiniteNumber(sub.unit_cost, Number.NaN) || toFiniteNumber(sub.unit_cost_cents, Number.NaN) / 100;
              const subAmount =
                toFiniteNumber(sub.amount, Number.NaN) ||
                toFiniteNumber(sub.total_cost, Number.NaN) ||
                toFiniteNumber(sub.total_cents, Number.NaN) / 100 ||
                subQty * toFiniteNumber(subUnitCost, 0);
              return {
                id: String(sub.id ?? `${id}-sub-${subIndex}`),
                line_type: String(sub.line_type ?? (lineType || "parts")) as "parts" | "labor",
                description: String(sub.description ?? `Sub-row ${subIndex + 1}`),
                quantity: subQty,
                unit_cost: toFiniteNumber(subUnitCost, toFiniteNumber(subAmount, 0)),
                amount: toFiniteNumber(subAmount, 0),
                part_uuid: String(sub.part_uuid ?? ""),
                labor_rate_uuid: String(sub.labor_rate_uuid ?? ""),
                part_location_codes: Array.isArray(sub.part_location_codes)
                  ? sub.part_location_codes.map((code) => String(code))
                  : [],
              };
            })
            .filter((row): row is NonNullable<typeof row> => Boolean(row))
        : [
            {
              id: `${id}-sub-0`,
              line_type: (isPartsOrLabor ? lineType : "parts") as "parts" | "labor",
              description,
              quantity,
              unit_cost: toFiniteNumber(unitCost, toFiniteNumber(amount, 0)),
              amount: toFiniteNumber(amount, 0),
              part_uuid: String(line.part_uuid ?? line.inventory_part_id ?? ""),
              labor_rate_uuid: String(line.labor_rate_uuid ?? ""),
              part_location_codes: Array.isArray(line.part_location_codes)
                ? line.part_location_codes.map((code) => String(code))
                : [],
            },
          ];

    normalized.push({
      id,
      section,
      description,
      quantity,
      unit_cost: toFiniteNumber(unitCost, toFiniteNumber(amount, 0)),
      amount: toFiniteNumber(amount, 0),
      service_item_uuid: String(line.service_item_uuid ?? line.ps_item_id ?? ""),
      sub_rows: subRows,
    });
  });
  return normalized;
}

export function WorkOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [lineDraft, setLineDraft] = useState<TwoSectionLine[]>([]);

  const [woQ, costQ] = useQueries({
    queries: [
      {
        queryKey: ["maintenance", "work-order-detail", id, companyId],
        queryFn: () => getWorkOrder(id!, companyId),
        enabled: Boolean(id && companyId),
      },
      {
        queryKey: ["maintenance", "wo-cost-context", companyId],
        queryFn: () => getWoCostContext(companyId),
        enabled: Boolean(companyId),
      },
    ],
  });
  const previewQ = useQuery({
    queryKey: ["maintenance", "work-order-posting-preview", id, companyId],
    queryFn: () => getWorkOrderPostingPreview(id!, companyId),
    enabled: Boolean(id && companyId),
    retry: false,
  });
  const vehiclesQ = useQuery({
    queryKey: ["maintenance", "master-data", "vehicles", companyId, "wo-detail"],
    queryFn: () => listMaintenanceVehicles(companyId),
    enabled: Boolean(companyId),
    staleTime: 60_000,
  });
  const severeEstimatesQ = useQuery({
    queryKey: ["maintenance", "severe-estimates", companyId, "wo-detail"],
    queryFn: () => listSevereRepairEstimates(companyId),
    enabled: Boolean(companyId),
  });

  const wo = woQ.data;

  const invoiceCents = useMemo(() => (wo ? pickInvoiceTotalCents(wo) : null), [wo]);
  const linesCents = useMemo(() => (wo ? sumLineItemsCents(wo.line_items) : 0), [wo]);
  const deltaCents = invoiceCents != null ? invoiceCents - linesCents : null;
  const invoiceMismatch = deltaCents != null ? Math.abs(deltaCents) > 1 : false;

  const oosDowntimeEstimate = useMemo(() => {
    if (!wo || !id) return null;
    const severity = String(wo.severity ?? "").trim().toLowerCase();
    if (severity !== "out_of_service" && severity !== "oos-severe" && severity !== "oos_severe") return null;
    const linked = (severeEstimatesQ.data?.data ?? []).find((row) => row.trigger_wo_id === id);
    const daysOos = Number(linked?.days_oos ?? 0);
    const downtimeCents = Math.round(daysOos * OOS_DAILY_LOSS_CENTS);
    const repairCents = Number(linked?.estimated_total_cents ?? 0);
    return {
      daysOos,
      downtimeCents,
      repairCents,
      combinedCents: downtimeCents + repairCents,
      dailyLossCents: OOS_DAILY_LOSS_CENTS,
    };
  }, [wo, id, severeEstimatesQ.data]);

  const woNumber = String(wo?.display_id ?? id?.slice(0, 8) ?? "—");
  const assetOptions = useMemo(
    () =>
      (vehiclesQ.data?.rows ?? [])
        .map((row) => ({ id: row.id, label: row.unit_display_id || row.vin || row.id }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [vehiclesQ.data?.rows]
  );

  useEffect(() => {
    if (!wo) return;
    const initialAsset = String(wo.asset_id ?? wo.unit_id ?? "");
    setSelectedAssetId(initialAsset);
    setLineDraft(normalizeLineItems(wo.line_items));
  }, [wo]);

  if (!id) {
    return <div className="p-4 text-sm text-red-600">Missing work order id.</div>;
  }

  if (!companyId) {
    return <div className="p-4 text-sm text-amber-800">Select an operating company.</div>;
  }

  if (woQ.isLoading) {
    return <div className="p-4 text-sm text-gray-500">Loading work order…</div>;
  }

  if (woQ.isError || !wo) {
    return <div className="p-4 text-sm text-red-600">Failed to load work order.</div>;
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title={`Work Order ${woNumber}`}
        backHref="/maintenance"
        breadcrumb={[
          { label: "Maintenance", href: "/maintenance" },
          { label: "Work Orders", href: "/maintenance/work-orders" },
          { label: woNumber },
        ]}
      />

      {invoiceCents != null ? (
        <div
          className={`rounded border px-3 py-2 text-sm ${invoiceMismatch ? "border-red-300 bg-red-50 text-red-900" : "border-gray-200 bg-white text-gray-800"}`}
        >
          Invoice {money.format(invoiceCents / 100)} vs Line items {money.format(linesCents / 100)} · Δ{" "}
          {money.format((deltaCents ?? 0) / 100)}
        </div>
      ) : null}

      {oosDowntimeEstimate ? (
        <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-950">
          <div className="font-semibold">OOS severe — downtime cost estimate</div>
          <p className="mt-1 text-xs">
            {oosDowntimeEstimate.daysOos.toFixed(1)} days OOS × {money.format(oosDowntimeEstimate.dailyLossCents / 100)}/day ={" "}
            <span className="font-semibold">{money.format(oosDowntimeEstimate.downtimeCents / 100)}</span> downtime
            {oosDowntimeEstimate.repairCents > 0 ? (
              <>
                {" "}
                + {money.format(oosDowntimeEstimate.repairCents / 100)} repair estimate ={" "}
                <span className="font-semibold">{money.format(oosDowntimeEstimate.combinedCents / 100)}</span> combined
              </>
            ) : null}
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={invoiceMismatch || !id}>
          Save header
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            const url = getMaintenanceWorkOrderPdfUrl(id, companyId);
            window.open(url, "_blank", "noopener,noreferrer");
          }}
        >
          Download WO PDF
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            const url = getMaintenanceWorkOrderPdfUrl(id, companyId);
            const popup = window.open(url, "_blank", "noopener,noreferrer");
            if (popup) {
              setTimeout(() => popup.print(), 600);
            }
          }}
        >
          Print WO PDF
        </Button>
        {invoiceMismatch ? <span className="text-xs text-red-700">Resolve invoice vs line total before saving.</span> : null}
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-3">
          <div className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-700">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Status</div>
                <p>{String(wo.status ?? "—")}</p>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Source Type</div>
                <p>{String(wo.source_type ?? "—")}</p>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Asset Selector</div>
                <SelectCombobox
                  className="mt-1 h-8 w-full rounded border border-gray-300 px-2 text-sm"
                  value={selectedAssetId}
                  onChange={(event) => setSelectedAssetId(event.target.value)}
                >
                  <option value="">Select asset</option>
                  {assetOptions.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.label}
                    </option>
                  ))}
                </SelectCombobox>
              </div>
            </div>
            <div className="mt-3 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">
              Asset + line save wiring will call MAINT-11 mutation contract once backend PR is merged.
            </div>
          </div>

          <div className="rounded border border-gray-200 bg-white p-4">
            <div className="mb-2 text-sm font-semibold text-gray-900">Parts Picker + Labor Lines (P&S)</div>
            <div className="mb-2 text-xs text-gray-600">
              Section A uses P&S Category, Section B uses P&S Item, and sub-rows map parts/labor.
            </div>
            <TwoSectionLineEditor
              key={`wo-lines-${id}`}
              mode="wo"
              initialLines={lineDraft}
              onChange={setLineDraft}
              partsLaborMode="parts-and-labor"
            />
            <div className="mt-2 text-xs text-gray-500">Line updates are local preview until MAINT-11 save endpoint is available.</div>
          </div>

          {id && companyId ? <LaborTracker workOrderId={id} operatingCompanyId={companyId} /> : null}
        </div>

        <div className="space-y-3">
          <div className="rounded border border-gray-200 bg-white p-4">
            <div className="mb-2 text-sm font-semibold text-gray-900">Posting Preview</div>
            {previewQ.isLoading ? <div className="text-xs text-gray-500">Loading posting preview...</div> : null}
            {previewQ.isError ? (
              <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">
                Posting preview unavailable in this backend build. MAINT-11 contract fallback is active.
              </div>
            ) : null}
            {!previewQ.isLoading && !previewQ.isError && previewQ.data == null ? (
              <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">
                Posting preview endpoint not deployed yet for this environment.
              </div>
            ) : null}
            {previewQ.data ? (
              <div className="space-y-2 text-xs text-gray-700">
                <div className="rounded border border-gray-100 bg-gray-50 p-2">
                  <div>Total: {money.format((previewQ.data.total_cents ?? 0) / 100)}</div>
                  <div>Currency: {previewQ.data.currency || "USD"}</div>
                  <div>Lines: {previewQ.data.lines?.length ?? 0}</div>
                </div>
                <div className="max-h-60 overflow-auto rounded border border-gray-100">
                  <table className="min-w-full text-left text-[11px]">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-2 py-1">Line</th>
                        <th className="px-2 py-1">P&S Category</th>
                        <th className="px-2 py-1">P&S Item</th>
                        <th className="px-2 py-1">Asset</th>
                        <th className="px-2 py-1">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewQ.data.lines.map((line, index) => (
                        <tr key={`${line.description}-${index}`} className="border-t border-gray-100">
                          <td className="px-2 py-1">{line.description || line.line_type}</td>
                          <td className="px-2 py-1">{line.ps_category_name || line.ps_category_id || "—"}</td>
                          <td className="px-2 py-1">{line.ps_item_name || line.ps_item_id || "—"}</td>
                          <td className="px-2 py-1">{line.asset_unit_code || line.asset_id || "—"}</td>
                          <td className="px-2 py-1">{money.format((line.amount_cents ?? 0) / 100)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>

          <UploadZone
            operatingCompanyId={companyId}
            entityType="work_order"
            entityId={id}
            defaultCategory="receipt"
            title="Receipts & WO Attachments"
          />
        </div>
      </div>

      <details className="rounded border border-gray-200 bg-white">
        <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-gray-900">WO cost context (live)</summary>
        <div className="border-t border-gray-100 px-3 py-2 text-xs text-gray-700">
          {costQ.isLoading ? <p>Loading…</p> : null}
          {costQ.isError ? <p className="text-red-600">Could not load cost context.</p> : null}
          {costQ.data ? (
            <ul className="list-inside list-disc space-y-1">
              <li>Expense categories (Section A): {costQ.data.expense_categories.length}</li>
              <li>Items (Section B): {costQ.data.items.length}</li>
              <li>Parts: {costQ.data.parts.length}</li>
              <li>Labor rates: {costQ.data.labor_rates.length}</li>
            </ul>
          ) : null}
        </div>
      </details>

      <details className="rounded border border-gray-200 bg-white">
        <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-gray-900">Line items (raw)</summary>
        <pre className="max-h-64 overflow-auto border-t border-gray-100 p-2 text-[11px]">
          {JSON.stringify(wo.line_items ?? [], null, 2)}
        </pre>
      </details>
    </div>
  );
}
