import { useParams } from "react-router-dom";
import { type MoneyProofDocumentType } from "../../api/accounting";
import { MoneyProofTrailPanel } from "../../components/accounting/MoneyProofTrailPanel";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";

export function MoneyProofTrailPage() {
  const { documentType = "", id = "" } = useParams();
  const { selectedCompanyId } = useCompanyContext();
  return (
    <AccountingSubNavWrapper>
      <PageHeader title="Proof trail" subtitle="Document → ledger → accounts → linked records" backHref="/accounting/posting-lineage" />
      {selectedCompanyId && id ? (
        <MoneyProofTrailPanel operatingCompanyId={selectedCompanyId} documentType={documentType as MoneyProofDocumentType} documentId={id} />
      ) : null}
    </AccountingSubNavWrapper>
  );
}
