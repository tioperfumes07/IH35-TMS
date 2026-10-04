export default {
  name: "verify:engine-catalog-probes-exist",
  run(ctx) {
    ctx.run("node", ["scripts/verify-engine-catalog-probes-exist.mjs"]);
  },
};
