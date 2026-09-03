import { Link, useParams } from "react-router-dom";
import { type MoneyProofDocumentType } from "../../api/accounting";
import { MoneyProofTrailPanel } from "../../components/accounting/MoneyProofTrailPanel";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";

export function MoneyProofTrailPage() {
  const { documentType = "", id = "" } = useParams();
  const { selectedCompanyId } = useCompanyContext();
  return (
    <AccountingSubNavWrapper title="Proof trail" subtitle="Document → ledger → accounts → linked records">
      {selectedCompanyId && id ? (
        <MoneyProofTrailPanel operatingCompanyId={selectedCompanyId} documentType={documentType as MoneyProofDocumentType} documentId={id} />
      ) : (
        <section className="rounded-sm border border-[#E5E7EB] bg-white p-4" aria-label="Choose a document list">
          <h2 className="text-sm font-semibold text-[#0F1219]">Choose a document</h2>
          <p className="mt-1 text-xs text-[#4B5563]">
            Open a real document from one of these lists, then use its Proof trail panel to inspect the journal entry, accounts moved, and linked records.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Bills", "/accounting/bills"],
              ["Expenses", "/accounting/expenses/list"],
              ["Invoices", "/accounting/invoices"],
              ["Payments", "/accounting/payments"],
              ["Settlements", "/driver-finance/settlements"],
              ["Load costs", "/accounting/load-costs"],
            ].map(([label, href]) => (
              <Link key={href} to={href} className="rounded-sm border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-semibold text-[#0F1219] hover:bg-[#F7F8FA]">
                {label}
              </Link>
            ))}
          </div>
        </section>
      )}
    </AccountingSubNavWrapper>
  );
}
