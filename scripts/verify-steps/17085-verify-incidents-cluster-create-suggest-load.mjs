export default {
  name: "verify:incidents-cluster-create-suggest-load",
  run(ctx) {
    ctx.run("node", ["scripts/verify-incidents-cluster-create-suggest-load.mjs"]);
  },
};
