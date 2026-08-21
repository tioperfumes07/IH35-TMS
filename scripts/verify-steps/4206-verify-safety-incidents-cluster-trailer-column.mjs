// verify-steps wrapper for scripts/verify-safety-incidents-cluster-trailer-column.mjs
// SAF-TRAILER-COLUMN — damage_reports.list and trailer_interchanges.list (shared
// SafetyIncidentsClusterSurface.tsx) never rendered a Trailer column even though the backend list
// query (SAF-C06) already JOINs trailer_number/trailer_id on every row for exactly this purpose.
// Fixed by adding a real EntityLink kind="trailer" column, mirroring the existing Driver/Unit columns.
// Rule 37 claim-then-author (claim shipped in #13669). Static, no DB.
export default {
  name: "verify-safety-incidents-cluster-trailer-column",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-incidents-cluster-trailer-column.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-safety-incidents-cluster-trailer-column.mjs"]);
  },
};
