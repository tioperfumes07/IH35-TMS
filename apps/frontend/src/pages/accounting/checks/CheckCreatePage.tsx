import { useNavigate, useSearchParams } from "react-router-dom";
import { WriteCheckForm } from "../../../components/checks/WriteCheckForm";
import { AccountingSubNavWrapper } from "../AccountingSubNavWrapper";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { useToast } from "../../../components/Toast";
import type { CheckPayeeKind } from "../../../api/checks";

/**
 * Create check route (`/accounting/checks/new`), R-154 §5. WriteCheckForm already renders its own
 * ParityDrawer -- this page is just the route + company-context + close/save navigation, matching
 * VendorBillCreatePage's own thin-wrapper shape.
 *
 * R-172 step 1 -- entry points from the vendor/driver profile and the Expenses list carry a payee
 * query param so Write Check opens with that payee already selected (real UUIDs, not memo text).
 */
export function CheckCreatePage() {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const [searchParams] = useSearchParams();

  let initialPayee: { kind: CheckPayeeKind; id: string } | undefined;
  const vendorId = searchParams.get("vendor_id");
  const driverId = searchParams.get("driver_id");
  const customerId = searchParams.get("customer_id");
  if (vendorId) initialPayee = { kind: "vendor", id: vendorId };
  else if (driverId) initialPayee = { kind: "driver", id: driverId };
  else if (customerId) initialPayee = { kind: "customer", id: customerId };
  // R-172 step 8 -- More menu's "Copy": the source check's id to clone from (payee/bank/memo/tags/
  // lines; never the check number, which must be freshly claimed).
  const copyFromId = searchParams.get("copy_from") ?? undefined;

  if (!companyId) {
    return (
      <AccountingSubNavWrapper title="Checks" subtitle="Write check">
        <div className="text-xs text-red-600">Select an operating company in the shell header.</div>
      </AccountingSubNavWrapper>
    );
  }

  return (
    <AccountingSubNavWrapper title="Checks" subtitle="Write check">
      <WriteCheckForm
        open
        operatingCompanyId={companyId}
        initialPayee={initialPayee}
        copyFromCheckId={copyFromId}
        onClose={() => navigate("/accounting/checks")}
        onSaved={(checkId) => {
          pushToast("Check created", "success");
          navigate(`/accounting/checks?created=${checkId}`);
        }}
        // R-172 step 6 -- Save / Save and new keep the Write Check drawer open (spec §6) rather than
        // navigating away like Save and close/onSaved does.
        onSavedKeepOpen={() => pushToast("Check saved", "success")}
      />
    </AccountingSubNavWrapper>
  );
}
