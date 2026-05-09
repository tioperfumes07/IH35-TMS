import { journalEntryTypesCatalogClient } from "../../../api/catalogs-accounting";
import { AccountingCatalogListPage } from "./AccountingCatalogListPage";

export function JournalEntryTypesListPage() {
  return (
    <AccountingCatalogListPage
      client={journalEntryTypesCatalogClient}
      displayName="Journal Entry Types"
      breadcrumbPath="Lists & Catalogs / Accounting / Journal Entry Types"
      readOnly
      metadataSummary={(row) => row.description || "Journal source type"}
    />
  );
}
