export default [
  {
    "schema": "accounting",
    "table": "ar_collection_contacts",
    "grants": [
      "SELECT",
      "INSERT",
      "UPDATE"
    ],
    "roles": [
      "authenticated",
      "service_role"
    ],
    "source_migration": "0237_accounting_ar_collection_tasks.sql"
  },
  {
    "schema": "accounting",
    "table": "ar_collection_tasks",
    "grants": [
      "SELECT",
      "INSERT",
      "UPDATE"
    ],
    "roles": [
      "authenticated",
      "service_role"
    ],
    "source_migration": "0237_accounting_ar_collection_tasks.sql"
  }
];
