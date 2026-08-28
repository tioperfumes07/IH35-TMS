import { entityLabel, visibleDocumentLabel } from "../../lib/entity-label";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getMaintenanceWorkOrderPdfUrl,
  getWoCostContext,
  getWorkOrder,
  getWorkOrderPostingPreview,
  listSevereRepairEstimates,
  type WorkOrderPostingPreviewLine,
} from "../../api/maintenance";
import { cancelWorkOrderConsole, createWoCancellationReason, listWoCancellationReasons, voidWorkOrderConsole } from "../../api/workOrdersConsole";
import { CreateWorkOrderModal, type EditWorkOrderLine, type EditWorkOrderTarget } from "./components/CreateWorkOrderModal";
import { Button } from "../../components/Button";
import { TwoSectionLineEditor, type TwoSectionLine } from "../../components/forms/TwoSectionLineEditor";
import { PageHeader } from "../../components/forms/shared/PageHeader";
import { FlatFieldGrid } from "../../components/layout/FlatFieldGrid";
import { Combobox } from "../../components/shared/Combobox";
import { UploadZone } from "../../components/UploadZone";
import { LaborTracker } from "../../components/maintenance/LaborTracker";
import { TasksTab } from "../../components/tasks/TasksTab";
import { EntityAuditHistoryTab } from "../../components/audit/EntityAuditHistoryTab";
import { CreateBillModal } from "./components/CreateBillModal";
import { CreateExpenseModal } from "./components/CreateExpenseModal";
import { listWorkOrderLinkedFinancials, type WorkOrderLinkedFinancials } from "../../api/accounting";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useAuth } from "../../auth/useAuth";
import { useToast } from "../../components/Toast";
import { EntityLink } from "../../components/shared/EntityLink";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { formatDateUS } from "../../lib/formatDate";
import { userFacingApiError } from "../../lib/api-error-message";
import { ListErrorState } from "../../components/ListErrorState";
import { RoadServiceReverseSection } from "../../components/maintenance/RoadServiceReverseSection";
import { ExpensesReverseSection } from "../../components/accounting/ExpensesReverseSection";
import { WarrantyClaimsReverseSection } from "../../components/maintenance/WarrantyClaimsReverseSection";
import { DvirSeverityBadge } from "../../components/maintenance/DvirSeverityBadge";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
/** Matches apps/backend/src/maintenance/wo-oos-estimator.ts DEFAULT_DAILY_LOSS_CENTS */
const OOS_DAILY_LOSS_CENTS = 50_000;

// Read-only display grids (qbo-parity-a1). The posting preview is a PREVIEW ONLY — no journal
// entries are created or edited from this surface; bills/expenses are reverse drill-through links.
type PostingPreviewTableRow = WorkOrderPostingPreviewLine & { row_key: string };

type WorkOrderActionScope = {
  workOrderId: string;
  companyId: string;
  generation: number;
};

const POSTING_PREVIEW_COLUMNS: Array<ParityColumn<PostingPreviewTableRow>> = [
  {
    key: "description",
    label: "Line",
    sortable: true,
    sortValue: (row) => row.description || row.line_type,
    render: (row) => row.description || row.line_type,
  },
  {
    key: "ps_category_name",
    label: "P&S Category",
    sortable: true,
    sortValue: (row) => entityLabel(row.ps_category_name, row.ps_category_id, "Category"),
    render: (row) => entityLabel(row.ps_category_name, row.ps_category_id, "Category"),
  },
  {
    key: "ps_item_name",
    label: "P&S Item",
    sortable: true,
    sortValue: (row) => entityLabel(row.ps_item_name, row.ps_item_id, "Item"),
    render: (row) => entityLabel(row.ps_item_name, row.ps_item_id, "Item"),
  },
  {
    key: "asset_unit_code",
    label: "Asset",
    sortable: true,
    sortValue: (row) => entityLabel(row.asset_unit_code, row.asset_id, "Unit"),
    render: (row) => <EntityLink kind="unit" id={row.asset_id} label={entityLabel(row.asset_unit_code, row.asset_id, "Unit") || "—"} />,
  },
  {
    key: "amount_cents",
    label: "Amount",
    sortable: true,
    render: (row) => money.format((row.amount_cents ?? 0) / 100),
  },
];

type LinkedBillRow = WorkOrderLinkedFinancials["bills"][number];
type LinkedExpenseRow = WorkOrderLinkedFinancials["expenses"][number];

const LINKED_BILL_COLUMNS: Array<ParityColumn<LinkedBillRow>> = [
  {
    key: "bill_number",
    label: "Bill",
    sortable: true,
    sortValue: (row) => row.bill_number || row.id,
    // ACCT-F6301-class: bill_number is nullable and null on 550/16,301 real bills (live-confirmed)
    // — this row is already fully in view, so entityLabel's "Record — not visible" fallback would
    // contradict the row it's sitting in.
    render: (row) => (
      <EntityLink kind="bill" id={row.id} label={visibleDocumentLabel(row.bill_number ?? row.memo, row.id, "Record")} />
    ),
  },
  { key: "bill_date", label: "Date", sortable: true, render: (row) => formatDateUS(row.bill_date) || "—" },
  { key: "status", label: "Status", sortable: true, render: (row) => row.status || "—" },
  {
    key: "amount_cents",
    label: "Amount",
    sortable: true,
    className: "text-right",
    render: (row) => money.format((row.amount_cents ?? 0) / 100),
  },
];

// The expense drill-through EntityLink is rendered directly inside
// linkedFinancialsQ.data.expenses.map(...) in the component (verify-entitylink-deep-links
// contract) and carried on the row; the column just displays it.
type LinkedExpenseTableRow = LinkedExpenseRow & { expense_link: ReactNode };

const LINKED_EXPENSE_COLUMNS: Array<ParityColumn<LinkedExpenseTableRow>> = [
  {
    key: "id",
    label: "Expense",
    sortable: true,
    render: (row) => row.expense_link,
  },
  { key: "transaction_date", label: "Date", sortable: true, render: (row) => formatDateUS(row.transaction_date) || "—" },
  { key: "status", label: "Status", sortable: true, render: (row) => row.status || "—" },
  {
    key: "total_amount_cents",
    label: "Amount",
    sortable: true,
    className: "text-right",
    render: (row) => money.format((row.total_amount_cents ?? 0) / 100),
  },
];

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

    const serviceItemUuid = String(line.service_item_uuid ?? line.ps_item_id ?? "").trim();
    normalized.push({
      id,
      section,
      description,
      quantity,
      unit_cost: toFiniteNumber(unitCost, toFiniteNumber(amount, 0)),
      amount: toFiniteNumber(amount, 0),
      // Same class as CreateWorkOrderModal #7863: never serialize optional FK as "".
      ...(serviceItemUuid ? { service_item_uuid: serviceItemUuid } : {}),
      sub_rows: subRows,
    });
  });
  return normalized;
}

export function WorkOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [lineDraft, setLineDraft] = useState<TwoSectionLine[]>([]);
  const [editing, setEditing] = useState(false);

  // Cancel/Void = Owner/Administrator ONLY, reason REQUIRED (>=3), soft (never deletes). These hit the
  // SAME backend as the WO Console (cancelWorkOrderConsole/voidWorkOrderConsole) — which reverses the
  // WO's linked bill/GL via the shared void engine when WO_VOID_ENABLED is on, and refuses (no orphan)
  // when posted financials exist and the flag is off.
  const auth = useAuth();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const canCancelVoid = ["Owner", "Administrator"].includes(String(auth.user?.role ?? ""));
  const [reasonModal, setReasonModal] = useState<{ kind: "cancel" | "void" } | null>(null);
  const [cancelReasonCode, setCancelReasonCode] = useState<string | null>(null);
  const [cancelNotes, setCancelNotes] = useState("");
  const [reasonText, setReasonText] = useState("");
  const [createBillOpen, setCreateBillOpen] = useState(false);
  const [createExpenseOpen, setCreateExpenseOpen] = useState(false);
  const actionGenerationRef = useRef(0);
  const invalidateWoScope = (scope: Pick<WorkOrderActionScope, "workOrderId" | "companyId">) => {
    void queryClient.invalidateQueries({ queryKey: ["maintenance", "work-order-detail", scope.workOrderId, scope.companyId] });
    void queryClient.invalidateQueries({ queryKey: ["maintenance", "work-order-posting-preview", scope.workOrderId, scope.companyId] });
    void queryClient.invalidateQueries({ queryKey: ["accounting", "wo-linked-financials", scope.workOrderId, scope.companyId] });
  };
  const invalidateWo = () => invalidateWoScope({ workOrderId: String(id), companyId });
  const woCancelReasonsQ = useQuery({
    queryKey: ["catalogs", "wo-cancellation-reasons"],
    queryFn: () => listWoCancellationReasons(),
    enabled: reasonModal?.kind === "cancel",
    staleTime: 60_000,
  });
  const woCancelReasonOptions = useMemo(
    () =>
      (woCancelReasonsQ.data?.reasons ?? []).map((r) => ({
        value: r.reason_code,
        label: r.reason_label,
      })),
    [woCancelReasonsQ.data?.reasons]
  );
  // WO-CANCEL-REASON-NO-CREATE-ROUTE: this Combobox previously had no create affordance because the
  // backend route was GET-only. Now that createWoCancellationReason exists, wire it through the
  // Combobox's own allowAddNew/onAddNew (this catalog is GLOBAL — no operating_company_id — so the
  // registry/ReferenceSelect inline-create flow, which assumes entity scoping, does not apply here).
  const createWoReasonMut = useMutation({
    mutationFn: (input: WorkOrderActionScope & { label: string }) => createWoCancellationReason(input.label),
    onSuccess: (created, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      void queryClient.invalidateQueries({ queryKey: ["catalogs", "wo-cancellation-reasons"] });
      setCancelReasonCode(created.reason_code);
      pushToast(`Added cancellation reason "${created.reason_label}"`, "success");
    },
    onError: (_error, input) => {
      if (input.generation === actionGenerationRef.current) pushToast("Could not add that cancellation reason", "error");
    },
  });
  const cancelMut = useMutation({
    mutationFn: (input: WorkOrderActionScope & { body: { cancel_reason_code: string; cancel_notes?: string } }) =>
      cancelWorkOrderConsole(input.workOrderId, input.companyId, input.body),
    onSuccess: (_result, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      pushToast("Work order cancelled", "success");
      setReasonModal(null);
      setCancelReasonCode(null);
      setCancelNotes("");
      invalidateWoScope(input);
    },
    onError: (error: unknown, input) => {
      if (input.generation === actionGenerationRef.current) pushToast(userFacingApiError(error, "Cancel failed"), "error");
    },
  });
  const voidMut = useMutation({
    mutationFn: (input: WorkOrderActionScope & { reason: string }) =>
      voidWorkOrderConsole(input.workOrderId, input.companyId, input.reason),
    onSuccess: (_result, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      pushToast("Work order voided", "success");
      setReasonModal(null);
      setReasonText("");
      invalidateWoScope(input);
    },
    onError: (error: unknown, input) => {
      if (input.generation === actionGenerationRef.current) pushToast(userFacingApiError(error, "Void failed"), "error");
    },
  });
  useEffect(() => {
    actionGenerationRef.current += 1;
    createWoReasonMut.reset();
    cancelMut.reset();
    voidMut.reset();
    setReasonModal(null);
    setCancelReasonCode(null);
    setCancelNotes("");
    setReasonText("");
  }, [companyId, id]);
  const cancelValid = Boolean(cancelReasonCode);
  const voidValid = reasonText.trim().length >= 3;
  const submitReason = () => {
    if (!reasonModal) return;
    if (reasonModal.kind === "cancel") {
      if (!cancelValid || !cancelReasonCode) return;
      void cancelMut.mutateAsync({
        workOrderId: String(id),
        companyId,
        generation: actionGenerationRef.current,
        body: {
          cancel_reason_code: cancelReasonCode,
          cancel_notes: cancelNotes.trim() || undefined,
        },
      });
      return;
    }
    if (!voidValid) return;
    void voidMut.mutateAsync({
      workOrderId: String(id),
      companyId,
      generation: actionGenerationRef.current,
      reason: reasonText.trim(),
    });
  };

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
  const severeEstimatesQ = useQuery({
    queryKey: ["maintenance", "severe-estimates", companyId, "wo-detail"],
    queryFn: () => listSevereRepairEstimates(companyId),
    enabled: Boolean(companyId),
  });
  // Reverse drill-through: bills + expenses that FK-reference THIS work order (hard link, migration
  // 202607050810). The forward half is the FK persisted on create; this is the reverse half.
  const linkedFinancialsQ = useQuery({
    queryKey: ["accounting", "wo-linked-financials", id, companyId],
    queryFn: () => listWorkOrderLinkedFinancials(id!, companyId),
    enabled: Boolean(id && companyId),
    retry: false,
  });

  const wo = woQ.data;

  const postingPreviewRows = useMemo<PostingPreviewTableRow[]>(
    () => (previewQ.data?.lines ?? []).map((line, index) => ({ ...line, row_key: `${line.description}-${index}` })),
    [previewQ.data?.lines]
  );

  // Direct expense EntityLink inside linkedFinancialsQ.data.expenses.map — locked contract
  // enforced by scripts/verify-entitylink-deep-links.mjs (no alias/wrapper indirection).
  const linkedExpenseRows = useMemo<LinkedExpenseTableRow[]>(() => {
    if (!linkedFinancialsQ.data) return [];
    return linkedFinancialsQ.data.expenses.map((expense) => ({
      ...expense,
      expense_link: (
        <EntityLink
          kind="expense"
          id={expense.id}
          label={entityLabel(
            expense.memo?.trim() ||
              (expense.transaction_date
                ? `Expense · ${formatDateUS(expense.transaction_date)}`
                : null),
            expense.id,
            "Expense",
          )}
        />
      ),
    }));
  }, [linkedFinancialsQ.data]);

  const invoiceCents = useMemo(() => (wo ? pickInvoiceTotalCents(wo) : null), [wo]);
  const linesCents = useMemo(() => (wo ? sumLineItemsCents(wo.line_items) : 0), [wo]);
  const deltaCents = invoiceCents != null ? invoiceCents - linesCents : null;
  const invoiceMismatch = deltaCents != null ? Math.abs(deltaCents) > 1 : false;

  const oosDowntimeEstimate = useMemo(() => {
    if (!wo || !id || severeEstimatesQ.isError) return null;
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
  }, [wo, id, severeEstimatesQ.data, severeEstimatesQ.isError]);

  const isOosSevere = useMemo(() => {
    const severity = String(wo?.severity ?? "").trim().toLowerCase();
    return severity === "out_of_service" || severity === "oos-severe" || severity === "oos_severe";
  }, [wo?.severity]);

  const woNumber = String(entityLabel(wo?.display_id, id, "Work order"));
  // Edit target — map the loaded WO detail into the modal's edit shape (header + persisted cost lines).
  const editTarget = useMemo<EditWorkOrderTarget | null>(() => {
    if (!wo || !id) return null;
    const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
    const lineItems: EditWorkOrderLine[] = Array.isArray(wo.line_items)
      ? (wo.line_items as Array<Record<string, unknown>>).map((raw) => ({
          id: raw.id != null ? String(raw.id) : undefined,
          line_type: (["parts", "labor", "other"].includes(String(raw.line_type)) ? String(raw.line_type) : "other") as
            | "parts"
            | "labor"
            | "other",
          description: String(raw.description ?? ""),
          quantity: toFiniteNumber(raw.quantity, 1),
          unit_cost: toFiniteNumber(raw.unit_cost, toFiniteNumber(raw.total_cost, 0)),
          amount: toFiniteNumber(raw.total_cost, toFiniteNumber(raw.amount, 0)),
        }))
      : [];
    return {
      id,
      display_id: str(wo.display_id),
      status: str(wo.status),
      description: str(wo.description),
      bucket: (["in_house", "external", "roadside"].includes(String(wo.bucket)) ? String(wo.bucket) : null) as
        | "in_house"
        | "external"
        | "roadside"
        | null,
      external_vendor_wo_number: str(wo.external_vendor_wo_number),
      external_vendor_invoice_number: str(wo.external_vendor_invoice_number),
      wo_priority: (["routine", "urgent", "immediate"].includes(String(wo.wo_priority)) ? String(wo.wo_priority) : "") as
        | "routine"
        | "urgent"
        | "immediate"
        | "",
      vmrs_system_code: str(wo.vmrs_system_code),
      vmrs_component_code: str(wo.vmrs_component_code),
      out_of_service: Boolean(wo.out_of_service),
      repair_complaint: str(wo.repair_complaint),
      repair_cause: str(wo.repair_cause),
      repair_correction: str(wo.repair_correction),
      authorization_number: str(wo.authorization_number),
      service_location_type: (["shop", "mobile", "roadside"].includes(String(wo.service_location_type))
        ? String(wo.service_location_type)
        : "") as "shop" | "mobile" | "roadside" | "",
      repaired_by: (["in_house", "outside_vendor"].includes(String(wo.repaired_by)) ? String(wo.repaired_by) : "") as
        | "in_house"
        | "outside_vendor"
        | "",
      line_items: lineItems,
    };
  }, [wo, id]);

  useEffect(() => {
    if (!wo) return;
    setLineDraft(normalizeLineItems(wo.line_items));
  }, [wo]);

  if (!id) {
    return <div className="p-4 text-sm text-red-600">Missing work order id.</div>;
  }

  if (!companyId) {
    return <div className="p-4 text-sm text-slate-700">Select an operating company.</div>;
  }

  if (woQ.isLoading) {
    return <div className="p-4 text-sm text-gray-500">Loading work order…</div>;
  }

  if (woQ.isError) {
    return (
      <div className="p-4">
        <ListErrorState
          status={0}
          message={userFacingApiError(woQ.error, "Failed to load work order.")}
          onRetry={() => void woQ.refetch()}
        />
      </div>
    );
  }

  if (!wo) {
    return <div className="p-4 text-sm text-slate-700">Work order not found or unavailable for this operating company.</div>;
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
          className={`rounded-sm border px-3 py-2 text-sm ${invoiceMismatch ? "border-red-300 bg-red-50 text-red-900" : "border-gray-200 bg-white text-gray-800"}`}
        >
          Invoice {money.format(invoiceCents / 100)} vs Line items {money.format(linesCents / 100)} · Δ{" "}
          {money.format((deltaCents ?? 0) / 100)}
        </div>
      ) : null}

      {isOosSevere && severeEstimatesQ.isError ? (
        <div data-testid="wo-oos-estimate-error">
          <ListErrorState
            title="Couldn't load OOS downtime estimate"
            status={0}
            message={severeEstimatesQ.error instanceof Error ? severeEstimatesQ.error.message : undefined}
            onRetry={() => void severeEstimatesQ.refetch()}
          />
        </div>
      ) : null}

      {oosDowntimeEstimate ? (
        <div className="rounded-sm border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-950">
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
        <Button type="button" data-testid="wo-edit-btn" disabled={!editTarget} onClick={() => setEditing(true)}>
          Edit
        </Button>
        <Button
          type="button"
          variant="secondary"
          data-testid="wo-save-header-btn"
          disabled={invoiceMismatch || !id || !editTarget}
          onClick={() => setEditing(true)}
        >
          Save header
        </Button>
        <Button type="button" variant="secondary" disabled={!id || !companyId} onClick={() => setCreateBillOpen(true)}>
          + Create Bill
        </Button>
        <Button type="button" variant="secondary" disabled={!id || !companyId} onClick={() => setCreateExpenseOpen(true)}>
          + Create Expense
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
        {canCancelVoid ? (
          <>
            <Button
              type="button"
              variant="danger"
              disabled={cancelMut.isPending}
              onClick={() => {
                setCancelReasonCode(null);
                setCancelNotes("");
                setReasonModal({ kind: "cancel" });
              }}
            >
              Cancel WO
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={voidMut.isPending}
              onClick={() => {
                setReasonText("");
                setReasonModal({ kind: "void" });
              }}
            >
              Void
            </Button>
          </>
        ) : null}
        {invoiceMismatch ? <span className="text-xs text-red-700">Resolve invoice vs line total before saving.</span> : null}
      </div>

      {reasonModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-4 shadow-xl">
            <h2 className="text-sm font-semibold text-slate-900">
              {reasonModal.kind === "cancel" ? "Cancel work order" : "Void work order"}
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              {reasonModal.kind === "cancel"
                ? "Pick a reason from catalogs.wo_cancellation_reasons. The work order is never deleted — it stays on record with your reason in the audit trail."
                : "This voids the work order (incl. completed). It is never deleted — it stays on record with your reason in the audit trail."}
            </p>
            {reasonModal.kind === "cancel" ? (
              <>
                <label className="mt-3 block text-xs font-semibold text-slate-700" htmlFor="wo-cancel-reason-code">
                  Cancellation reason (required)
                </label>
                <Combobox
                  value={cancelReasonCode}
                  onChange={setCancelReasonCode}
                  options={woCancelReasonOptions}
                  placeholder="Select a cancellation reason…"
                  disabled={woCancelReasonsQ.isLoading}
                  allowAddNew
                  onAddNew={(typedText) => {
                    const label = typedText.trim();
                    if (label) createWoReasonMut.mutate({
                      workOrderId: String(id),
                      companyId,
                      generation: actionGenerationRef.current,
                      label,
                    });
                  }}
                />
                <label className="mt-3 block text-xs font-semibold text-slate-700" htmlFor="wo-cancel-notes">
                  Notes (optional)
                </label>
                <textarea
                  id="wo-cancel-notes"
                  className="mt-1 w-full rounded-sm border border-slate-300 p-2 text-sm"
                  rows={2}
                  value={cancelNotes}
                  onChange={(event) => setCancelNotes(event.target.value)}
                  placeholder="Additional context for the audit trail"
                />
              </>
            ) : (
              <>
                <label className="mt-3 block text-xs font-semibold text-slate-700" htmlFor="wo-reason">
                  Reason (required)
                </label>
                <textarea
                  id="wo-reason"
                  className="mt-1 w-full rounded-sm border border-slate-300 p-2 text-sm"
                  rows={3}
                  value={reasonText}
                  onChange={(event) => setReasonText(event.target.value)}
                  placeholder="Why is this being voided?"
                  autoFocus
                />
              </>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setReasonModal(null);
                  setCancelReasonCode(null);
                  setCancelNotes("");
                  setReasonText("");
                }}
              >
                Close
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={submitReason}
                disabled={(reasonModal.kind === "cancel" ? !cancelValid : !voidValid) || cancelMut.isPending || voidMut.isPending}
              >
                {reasonModal.kind === "cancel" ? "Confirm cancel" : "Confirm void"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-3">
          {id && companyId ? (
            <ExpensesReverseSection
              operatingCompanyId={companyId}
              filter={{ work_order_id: id }}
              contextLabel="this work order"
              data-testid="work-order-detail-expenses-reverse"
            />
          ) : null}
          <RoadServiceReverseSection
            filter={{ wo_id: id }}
            contextLabel="this work order"
            data-testid="work-order-detail-road-service-reverse"
          />
          {id && companyId ? (
            <WarrantyClaimsReverseSection
              operatingCompanyId={companyId}
              filter={{ work_order_id: id }}
              contextLabel="this work order"
              data-testid="work-order-warranty-claims-reverse"
            />
          ) : null}
          <div
            className="rounded-sm border border-gray-200 bg-white p-4 text-sm text-gray-700"
            data-testid="wo-detail-linkage-section"
          >
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Linkage (forward)</div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <div>
                <div className="text-[11px] text-gray-500">Unit</div>
                <p>
                  <EntityLinkOrTombstone kind="unit" id={wo.unit_id as string | null} name={wo.unit_number} noun="Unit" />
                </p>
              </div>
              <div>
                <div className="text-[11px] text-gray-500">Load</div>
                <p>
                  <EntityLinkOrTombstone kind="load" id={wo.load_id as string | null} name={wo.linked_load_number} noun="Load" />
                </p>
              </div>
              <div>
                <div className="text-[11px] text-gray-500">Roadside breakdown load</div>
                <p>
                  <EntityLinkOrTombstone kind="load" id={wo.roadside_breakdown_load_id as string | null} name={wo.roadside_breakdown_load_number} noun="Load" />
                </p>
              </div>
              <div>
                <div className="text-[11px] text-gray-500">Driver</div>
                <p>
                  <EntityLinkOrTombstone kind="driver" id={wo.driver_id as string | null} name={wo.driver_name} noun="Driver" />
                </p>
              </div>
              <div>
                <div className="text-[11px] text-gray-500">Vendor</div>
                <p>
                  <EntityLinkOrTombstone kind="vendor" id={wo.resolved_vendor_id as string | null} name={wo.resolved_vendor_name} noun="Vendor" />
                </p>
              </div>
              <div>
                <div className="text-[11px] text-gray-500">Insurance claim</div>
                <p>
                  <EntityLinkOrTombstone kind="claim" id={wo.insurance_claim_id as string | null} name={wo.insurance_claim_number} noun="Claim" />
                </p>
              </div>
            </div>
            {wo.source_intransit_issue_id ? (
              <div className="mt-3 rounded-sm border border-gray-200 bg-gray-50 p-3" data-testid="wo-source-intransit-issue">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Source In-Transit Issue</div>
                <Link
                  className="font-semibold text-slate-700 hover:underline"
                  to={`/dispatch/in-transit-issues?issue_id=${encodeURIComponent(String(wo.source_intransit_issue_id))}`}
                >
                  View source issue in Dispatch
                </Link>
                <div className="mt-1 text-xs text-gray-700">
                  {String(wo.source_intransit_issue_category ?? "—")} · {String(wo.source_intransit_issue_severity ?? "—")} · {String(wo.source_intransit_issue_reported_at ?? "—")}
                </div>
                <div className="text-xs text-gray-700">{String(wo.source_intransit_issue_description ?? "—")}</div>
              </div>
            ) : null}
          </div>

          <div className="rounded-sm border border-gray-200 bg-white p-4 text-sm text-gray-700">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Status</div>
                <p>{String(wo.status ?? "—")}</p>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Severity</div>
                <div className="mt-1"><DvirSeverityBadge severity={String(wo.severity ?? "")} /></div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Source Type</div>
                <p>{String(wo.source_type ?? "—")}</p>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Asset</div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <EntityLinkOrTombstone kind="unit" id={wo.unit_id as string | null} name={wo.unit_number ?? wo.unit_display_id} noun="Unit" />
                  {wo.equipment_id ? (
                    <EntityLinkOrTombstone kind="trailer" id={wo.equipment_id as string | null} name={wo.equipment_number} noun="Trailer" />
                  ) : null}
                  <Button type="button" size="sm" variant="secondary" disabled={!editTarget} onClick={() => setEditing(true)}>
                    Change in Edit
                  </Button>
                </div>
              </div>
            </div>
            <div className="mt-3 rounded-sm border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700">
              Use Edit to PATCH header fields (unit, load, vendor, complaint). Line persist uses POST
              /work-orders/:id/line-items — save from Edit when changing parts/labor.
            </div>
          </div>

          <div className="rounded-sm border border-gray-200 bg-white p-4">
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
            <div className="mt-2 text-xs text-slate-600">
              Preview drafts locally until you save via Edit (line-items endpoint). Linked bills/expenses
              on the right are live reverse drills.
            </div>
          </div>

          {id && companyId ? <LaborTracker workOrderId={id} operatingCompanyId={companyId} /> : null}
        </div>

        <div className="space-y-3">
          <section
            className="overflow-hidden rounded-sm border border-slate-200 bg-white"
            data-testid="wo-detail-posting-preview-section"
          >
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-900">
              Posting Preview
            </div>
            {previewQ.isLoading ? (
              <div className="px-4 py-2 text-xs text-slate-500">Loading posting preview...</div>
            ) : null}
            {previewQ.isError ? (
              <div className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-800">
                Posting preview unavailable in this backend build. MAINT-11 contract fallback is active.
              </div>
            ) : null}
            {!previewQ.isLoading && !previewQ.isError && previewQ.data == null ? (
              <div className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-800">
                Posting preview endpoint not deployed yet for this environment.
              </div>
            ) : null}
            {previewQ.data ? (
              <div className="space-y-2 border-t border-slate-200 px-4 py-3 text-xs text-slate-700">
                <FlatFieldGrid
                  columns={3}
                  fields={[
                    { label: "Total", value: money.format((previewQ.data.total_cents ?? 0) / 100) },
                    { label: "Currency", value: previewQ.data.currency || "USD" },
                    { label: "Lines", value: String(previewQ.data.lines?.length ?? 0) },
                  ]}
                />
                <ParityTable
                  storageKey="wo-detail-posting-preview"
                  tableTestId="wo-detail-posting-preview-parity"
                  columns={POSTING_PREVIEW_COLUMNS}
                  rows={postingPreviewRows}
                  rowKey={(row) => row.row_key}
                  loading={previewQ.isLoading}
                  emptyText="No posting preview lines."
                  initialPageSize={25}
                  pageSizeOptions={[10, 25, 50]}
                />
              </div>
            ) : null}
          </section>

          <UploadZone
            operatingCompanyId={companyId}
            entityType="work_order"
            entityId={id}
            defaultCategory="receipt"
            title="Receipts & WO Attachments"
          />
        </div>
      </div>

      <details className="rounded-sm border border-gray-200 bg-white">
        <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-gray-900">WO cost context (live)</summary>
        <div className="border-t border-gray-100 px-3 py-2 text-xs text-gray-700">
          {costQ.isLoading ? <p>Loading…</p> : null}
          {costQ.isError ? (
            <ListErrorState
              title="Couldn't load work order cost context"
              status={0}
              message={costQ.error instanceof Error ? costQ.error.message : undefined}
              onRetry={() => void costQ.refetch()}
            />
          ) : null}
          {!costQ.isError && costQ.data ? (
            <ul className="list-inside list-disc space-y-1">
              <li>Expense categories (Section A): {costQ.data.expense_categories.length}</li>
              <li>Items (Section B): {costQ.data.items.length}</li>
              <li>
                Parts:{" "}
                {costQ.data.sources?.inventory_parts?.status === "unavailable"
                  ? "not provisioned (parts catalog missing)"
                  : `${costQ.data.parts.length}${
                      costQ.data.sources?.inventory_parts?.status === "fallback"
                        ? " (fallback catalog)"
                        : ""
                    }`}
              </li>
              <li>
                Labor rates:{" "}
                {costQ.data.sources?.labor_rates?.status === "unavailable"
                  ? "not provisioned (labor rates catalog missing)"
                  : `${costQ.data.labor_rates.length}${
                      costQ.data.sources?.labor_rates?.status === "fallback"
                        ? " (fallback catalog)"
                        : ""
                    }`}
              </li>
            </ul>
          ) : null}
        </div>
      </details>

      <details className="rounded-sm border border-gray-200 bg-white">
        <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-gray-900">Line items (raw)</summary>
        <pre className="max-h-64 overflow-auto border-t border-gray-100 p-2 text-[11px]">
          {JSON.stringify(wo.line_items ?? [], null, 2)}
        </pre>
      </details>

      <section
        className="overflow-hidden rounded-sm border border-slate-200 bg-white"
        data-testid="wo-linked-financials"
      >
        <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-sm font-semibold text-slate-900">Linked Bills / Expenses</div>
        </div>
        {linkedFinancialsQ.isLoading ? (
          <div className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">Loading linked bills &amp; expenses…</div>
        ) : null}
        {linkedFinancialsQ.isError ? (
          <div className="border-t border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            Linked-financials lookup unavailable in this backend build.
          </div>
        ) : null}
        {!linkedFinancialsQ.isError ? (
          <>
            <ParityTable
              storageKey="wo-detail-linked-bills"
              tableTestId="wo-detail-linked-bills-parity"
              columns={LINKED_BILL_COLUMNS}
              rows={linkedFinancialsQ.data?.bills ?? []}
              rowKey={(row) => row.id}
              loading={linkedFinancialsQ.isLoading}
              emptyText="No bills are linked to this work order yet."
              initialPageSize={25}
              pageSizeOptions={[10, 25, 50]}
            />
            <ParityTable
              storageKey="wo-detail-linked-expenses"
              tableTestId="wo-detail-linked-expenses-parity"
              columns={LINKED_EXPENSE_COLUMNS}
              rows={linkedExpenseRows}
              rowKey={(row) => row.id}
              loading={linkedFinancialsQ.isLoading}
              emptyText="No expenses are linked to this work order yet."
              initialPageSize={25}
              pageSizeOptions={[10, 25, 50]}
            />
          </>
        ) : null}
      </section>

      <section className="rounded-sm border border-gray-200 bg-white p-3">
        <TasksTab operatingCompanyId={companyId} targetType="work_order" targetId={id} targetLabel={`Work Order ${woNumber}`} />
      </section>

      <section className="rounded-sm border border-gray-200 bg-white p-3">
        <h3 className="mb-2 text-sm font-semibold text-slate-900">Audit History</h3>
        <EntityAuditHistoryTab operatingCompanyId={companyId} entityType="work_order" entityId={id ?? ""} />
      </section>

      <CreateBillModal
        open={createBillOpen}
        operatingCompanyId={companyId}
        linkedWoDisplayId={woNumber}
        linkedWoId={id}
        linkedUnitId={typeof wo.unit_id === "string" ? wo.unit_id : undefined}
        onClose={() => setCreateBillOpen(false)}
        onCreated={() => invalidateWo()}
      />
      <CreateExpenseModal
        open={createExpenseOpen}
        operatingCompanyId={companyId}
        linkedWoDisplayId={woNumber}
        linkedWoId={id}
        onClose={() => setCreateExpenseOpen(false)}
        onCreated={() => invalidateWo()}
      />
      {editTarget ? (
        <CreateWorkOrderModal
          open={editing}
          operatingCompanyId={companyId}
          editWorkOrder={editTarget}
          onClose={() => setEditing(false)}
          onCreated={() => {
            invalidateWo();
          }}
        />
      ) : null}
    </div>
  );
}
