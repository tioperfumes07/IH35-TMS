export default {
  name: "verify:presettlement-create-new-sets-period",
  run(ctx) {
    ctx.run("node", ["scripts/verify-presettlement-create-new-sets-period.mjs"]);
  },
};
