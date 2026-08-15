import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { InventoryModuleTabs } from "./InventoryModuleTabs";
import { EntityLink } from "../../components/shared/EntityLink";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { listPartsPurchases, voidPartsPurchase, type PartsPurchaseRow } from "../../api/maintenance";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { entityLabel } from "../../lib/entity-label";
import { ListErrorState } from "../../components/ListErrorState";
import { formatQueryErrorDetail } from "../../lib/tableError";
import { useQueryClient } from "@tanstack/react-query";
import { VoidReasonModal } from "../../components/accounting/VoidReasonModal";

function formatMoneyCents(cents: number | null | undefined) {
  return `$${(Number(cents ?? 0) / 100).toFixed(2)}`;
}

function formatWhen(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

/**
 * Inventory Purchase History — INV-PURCHASE-LEDGER-SOR-STOCK-UPSERT (owner-approved 2026-08-15).
 *
 * SoR: maintenance.parts_purchases (append-only) via GET /api/v1/maintenance/parts-inventory/purchases.
 * Distinct from Parts & Stock (mutable on-hand snapshot) and Assignments (WO consumption trail,
 * parts_invoice_links) — both doors stay unchanged. See docs/blocks/HOLD-INVENTORY-PURCHASE-HISTORY-SOR.md.
 */
export function InventoryPurchasesPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const [voidTarget, setVoidTarget] = useState<PartsPurchaseRow | null>(null);

  const purchasesQuery = useQuery({
    queryKey: ["maintenance", "parts-purchases", companyId],
    queryFn: () => listPartsPurchases(companyId),
    enabled: Boolean(companyId),
  });

  const rows = purchasesQuery.data ?? [];
  const activeRows = useMemo(() => rows.filter((row) => !row.voided_at), [rows]);

  async function handleVoidSubmit(reason: string) {
    if (!voidTarget) return;
    await voidPartsPurchase(voidTarget.id, companyId, reason);
    await queryClient.invalidateQueries({ queryKey: ["maintenance", "parts-purchases", companyId] });
    await queryClient.invalidateQueries({ queryKey: ["maintenance", "parts-inventory", companyId] });
  }

  const columns: Array<ParityColumn<PartsPurchaseRow>> = [
    {
      key: "purchased_at",
      label: "When",
      sortable: true,
      render: (row) => formatWhen(row.purchased_at),
    },
    {
      key: "part_description",
      label: "Part",
      sortable: true,
      render: (row) => (
        <span>
          {row.part_description}
          {row.part_number ? <span className="ml-1 text-xs text-gray-500">({row.part_number})</span> : null}
        </span>
      ),
    },
    {
      key: "qty_received",
      label: "Qty",
      sortable: true,
    },
    {
      key: "vendor_name",
      label: "Vendor",
      sortable: true,
      render: (row) =>
        row.vendor_id ? (
          <EntityLink kind="vendor" id={row.vendor_id} label={entityLabel(row.vendor_name, row.vendor_id, "Vendor")} />
        ) : (
          "—"
        ),
    },
    {
      key: "vendor_invoice_number",
      label: "Invoice #",
      sortable: true,
    },
    {
      key: "purchase_amount_cents",
      label: "Amount",
      sortable: true,
      render: (row) => formatMoneyCents(row.purchase_amount_cents),
    },
    {
      key: "work_order_display_id",
      label: "Work Order",
      sortable: true,
      render: (row) =>
        row.work_order_id ? (
          <EntityLink
            kind="work_order"
            id={row.work_order_id}
            label={entityLabel(row.work_order_display_id, row.work_order_id, "Work order")}
          />
        ) : (
          "—"
        ),
    },
    {
      key: "voided_at",
      label: "Status",
      sortable: true,
      render: (row) =>
        row.voided_at ? (
          <span className="text-xs text-gray-500" title={row.void_reason ?? undefined}>
            Voided {formatWhen(row.voided_at)}
          </span>
        ) : (
          <button
            type="button"
            className="text-xs text-red-600 underline hover:text-red-800"
            onClick={() => setVoidTarget(row)}
          >
            Void
          </button>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Purchase History" backHref="/inventory" breadcrumb={["Inventory", "Purchase History"]} />
      <InventoryModuleTabs />

      <div className="rounded-sm border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600">
        Append-only purchase events (
        <code className="text-xs">maintenance.parts_purchases</code>
        ). Stock on-hand lives on{" "}
        <Link className="text-slate-700 underline" to="/inventory">
          Parts &amp; Stock
        </Link>{" "}
        (upserted by part on each purchase); WO part consumption lives on{" "}
        <Link className="text-slate-700 underline" to="/inventory/assignments">
          Assignments
        </Link>
        .
      </div>

      {purchasesQuery.isLoading ? (
        <div className="rounded-sm border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          Loading purchase history...
        </div>
      ) : purchasesQuery.isError ? (
        <ListErrorState
          title="Couldn't load purchase history"
          {...formatQueryErrorDetail(purchasesQuery.error)}
          onRetry={() => void purchasesQuery.refetch()}
        />
      ) : (
        <div className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid="inventory-purchases-list">
          <h3 className="text-sm font-semibold">Purchase history ({activeRows.length})</h3>
          <ParityTable<PartsPurchaseRow>
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            emptyText="No purchases recorded yet. Record a purchase from Parts & Stock to see it here."
            storageKey="inventory-purchases-history"
            exportFilename="inventory-purchase-history"
          />
        </div>
      )}

      <VoidReasonModal
        open={voidTarget != null}
        title="Void Purchase"
        entityRef={
          voidTarget
            ? `${voidTarget.part_description}${voidTarget.part_number ? ` (${voidTarget.part_number})` : ""} — qty ${voidTarget.qty_received}`
            : undefined
        }
        postsReversingEntry={false}
        onClose={() => setVoidTarget(null)}
        onSubmit={handleVoidSubmit}
      />
    </div>
  );
}
