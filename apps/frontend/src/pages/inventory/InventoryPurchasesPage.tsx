import { Link } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader";
import { InventoryModuleTabs } from "./InventoryModuleTabs";

/**
 * Inventory Purchase History — honest empty until append-only purchase SoR ships.
 *
 * HOLD: docs/blocks/HOLD-INVENTORY-PURCHASE-HISTORY-SOR.md
 * Do not render stock-on-hand (Parts & Stock API / stock table) as purchase history.
 * Door kept (never delete). Assignments SoR remains parts_invoice_links.
 */
export function InventoryPurchasesPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Purchase History" backHref="/inventory" breadcrumb={["Inventory", "Purchase History"]} />
      <InventoryModuleTabs />
      <section
        className="rounded-sm border border-gray-200 bg-white p-6 text-center"
        data-testid="inventory-purchases-honest-empty"
      >
        <h2 className="text-lg font-semibold text-gray-900">Purchase order history is not yet tracked</h2>
        <p className="mt-2 text-sm text-gray-600">
          This surface stays reachable, but there is no append-only purchase ledger yet. Stock on hand lives under{" "}
          <Link to="/inventory" className="text-slate-700 underline hover:text-slate-900">
            Parts &amp; Stock
          </Link>
          ; WO part consumption lives under{" "}
          <Link to="/inventory/assignments" className="text-slate-700 underline hover:text-slate-900">
            Assignments
          </Link>
          .
        </p>
        <p className="mt-3 text-xs text-gray-500">
          Owner-gated SoR: additive purchase events + GET list (see HOLD-INVENTORY-PURCHASE-HISTORY-SOR). No stock twin
          disguised as history.
        </p>
      </section>
    </div>
  );
}
