// SAF-C06 — SafetyIncidentsClusterSurface list + detail EntityLink drill-through (verify-step 2058).
export default {
  name: "safety-incidents-cluster-entitylinks",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-safety-incidents-cluster-entitylinks.mjs"]);
  },
};
