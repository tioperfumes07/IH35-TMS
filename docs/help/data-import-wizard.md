# Bulk data import

Bulk import brings CSV/spreadsheet data into master or operational tables through a guided wizard (when enabled for your role).

## Overview
- Open the data import / Data Infra surfaces listed for your role (often under System or module-specific import widgets such as Faro CSV under Factoring).
- Imports are company-scoped. Always confirm the operating company before uploading.
- Preview/mapping steps exist so columns land on the correct fields; do not skip validation when offered.

## Key tasks
- Download or match the expected template columns.
- Upload the file, map columns, and review error rows.
- Apply only after the dry-run / preview looks correct.
- Keep the source file for audit (Chapter 11 / lender questions).

## Tips & gotchas
- Re-importing the same file can create duplicates unless the importer is idempotent — check the wizard copy.
- Factor statement CSVs are not the same as master-data imports; use the Factoring Faro import widget for those.
- Production never serves fake fixture data — if an import “succeeds” with zero rows, check filters and company scope.
