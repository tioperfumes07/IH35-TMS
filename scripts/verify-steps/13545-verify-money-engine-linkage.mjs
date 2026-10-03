export default {
  name: "verify:money-engine-linkage",
  run(ctx) {
    ctx.run("node", ["scripts/verify-money-engine-linkage.mjs"]);
  },
};
