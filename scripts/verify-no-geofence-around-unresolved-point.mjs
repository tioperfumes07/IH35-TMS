#!/usr/bin/env node
import { runSourceGuard } from "./samsara-address-import-guard-lib.mjs";

runSourceGuard({
  label: "verify-no-geofence-around-unresolved-point",
  required: [
    // Live shape after locationId was added to the early-return (ROUND tip): never invent a fence.
    "if (!row.vertices) return { writes: 2, locationId }",
    "normalizeSamsaraGeofenceToVertices(geofenceJson)",
    "unresolved_geofences",
  ],
  forbidden: ["squareVerticesFromCenter"],
  selftestToken: "if (!row.vertices) return { writes: 2, locationId }",
});
