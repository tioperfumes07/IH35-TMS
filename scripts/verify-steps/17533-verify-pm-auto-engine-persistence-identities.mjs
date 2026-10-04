export default {
  name: "verify:pm-auto-engine-persistence-identities",
  run(ctx) {
    ctx.run("node", ["scripts/verify-pm-auto-engine-persistence-identities.mjs"]);
  },
};
