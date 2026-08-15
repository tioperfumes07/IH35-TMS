import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createVendorBill } from "../../api/accounting";
import { VendorBillForm } from "../../components/accounting/VendorBillForm";
import { ParityDrawer } from "../../components/parity/ParityDrawer";
import { TaskLinkPicker } from "../../components/tasks/TaskLinkPicker";
import { EntityLink } from "../../components/shared/EntityLink";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { userFacingApiError } from "../../lib/api-error-message";

/**
 * Create vendor bill route (`/accounting/bills/vendor`).
 * Owner chrome lock: VendorBillForm in a QBO-like right-side ParityDrawer (not a thin full page).
 * Route stays reachable; close returns to the bills list.
 */
export function VendorBillCreatePage() {
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [submitting, setSubmitting] = useState(false);
  const [lastBillId, setLastBillId] = useState<string | null>(null);

  return (
    <AccountingSubNavWrapper title="Bills" subtitle="Create vendor bill">
      {!companyId ? <div className="text-sm text-red-600">Select an operating company in the shell header.</div> : null}
      <p className="text-sm text-gray-600">
        Creating a vendor bill in the side panel.{" "}
        <button type="button" className="text-slate-700 underline" onClick={() => navigate("/accounting/bills")}>
          Open bills list
        </button>
      </p>
      <ParityDrawer
        open
        title="Create vendor bill"
        subtitle="Locked 12×6 header grid and cost breakdown"
        size="wide"
        onClose={() => navigate("/accounting/bills")}
      >
        {companyId ? (
          <div className="space-y-4">
            <VendorBillForm
              operatingCompanyId={companyId}
              submitting={submitting}
              onSubmit={async (payload) => {
                if (!companyId) {
                  pushToast("Select operating company first", "error");
                  return;
                }
                setSubmitting(true);
                try {
                  const res = await createVendorBill(companyId, payload);
                  pushToast("Vendor bill created", "success");
                  setLastBillId(res?.bill?.id ?? null);
                } catch (error) {
                  pushToast(userFacingApiError(error, "Failed to create bill"), "error");
                } finally {
                  setSubmitting(false);
                }
              }}
            />
            {lastBillId ? (
              <div className="space-y-2 border-t border-gray-200 pt-3">
                {/* LINK-F5186 (accounting.parity.vendor_bill_create_page): the created bill's own
                detail page carries the real GL journal entry -- surface it here so the operator
                isn't left in a drawer with no path to it. */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">Bill created.</span>
                  <EntityLink
                    kind="bill"
                    id={lastBillId}
                    label="View bill →"
                    className="text-xs font-semibold text-slate-700 underline"
                    data-testid="vendor-bill-create-view-bill"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">Close an open task this bill fulfils:</span>
                  <TaskLinkPicker
                    operatingCompanyId={companyId}
                    targetType="bill"
                    targetId={lastBillId}
                    onLinked={() => setLastBillId(null)}
                  />
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="text-sm text-red-600">Select an operating company in the shell header.</div>
        )}
      </ParityDrawer>
    </AccountingSubNavWrapper>
  );
}
