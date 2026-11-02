export default {
  name: "verify:incidents-cluster-creators",
  run(ctx) {
    ctx.run("node", ["scripts/verify-incidents-cluster-creators.mjs"]);
  },
};
