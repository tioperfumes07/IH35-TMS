export default [
  {
    "schema": "safety",
    "table": "geofence_breach_events",
    "grants": [
      "SELECT",
      "INSERT",
      "UPDATE"
    ],
    "roles": [
      "authenticated",
      "service_role"
    ],
    "source_migration": "0236_safety_geofence_breach_events.sql"
  }
];
