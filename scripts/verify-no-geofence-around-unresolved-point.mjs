#!/usr/bin/env node
import { runSourceGuard } from "./samsara-address-import-guard-lib.mjs";

runSourceGuard({
  label: "verify-no-geofence-around-unresolved-point",
  required: [
    "if (!row.vertices) return 2",
    "normalizeSamsaraGeofenceToVertices(geofenceJson)",
    "unresolved_geofences",
  ],
  forbidden: ["squareVerticesFromCenter"],
  selftestToken: "if (!row.vertices) return 2",
});
