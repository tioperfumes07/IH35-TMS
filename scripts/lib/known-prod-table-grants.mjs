// Manual drift-capture ledger for schema/table grant expectations.
export const KNOWN_PROD_TABLE_GRANTS = [
  {
    schema: "safety",
    table: "geofence_breach_events",
    grants: ["SELECT", "INSERT", "UPDATE"],
    roles: ["authenticated", "service_role"],
    source_migration: "0236_safety_geofence_breach_events.sql",
  },
  {
    schema: "accounting",
    table: "ar_collection_tasks",
    grants: ["SELECT", "INSERT", "UPDATE"],
    roles: ["authenticated", "service_role"],
    source_migration: "0237_accounting_ar_collection_tasks.sql",
  },
  {
    schema: "accounting",
    table: "ar_collection_contacts",
    grants: ["SELECT", "INSERT", "UPDATE"],
    roles: ["authenticated", "service_role"],
    source_migration: "0237_accounting_ar_collection_tasks.sql",
  },
];
