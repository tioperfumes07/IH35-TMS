import { useState } from "react";
import { createVendorBill } from "../../api/accounting";
import { VendorBillForm } from "../../components/accounting/VendorBillForm";
import { PageHeader } from "../../components/layout/PageHeader";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";

export function VendorBillCreatePage() {
  const { pushToast } = useToast();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="space-y-4 p-4">
      <PageHeader
        title="Create vendor bill"
        subtitle="Locked 12x6 header grid and cost breakdown box (P7-ACCT-BILLFORM-FIX)."
      />
      {!companyId ? <div className="text-sm text-red-600">Select an operating company in the shell header.</div> : null}
      <div className="mx-auto max-w-6xl rounded border border-gray-200 bg-white p-4">
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
              await createVendorBill(companyId, payload);
              pushToast("Vendor bill created", "success");
            } catch (error) {
              pushToast(String((error as Error).message || "Failed to create bill"), "error");
            } finally {
              setSubmitting(false);
            }
          }}
        />
      </div>
    </div>
  );
}
