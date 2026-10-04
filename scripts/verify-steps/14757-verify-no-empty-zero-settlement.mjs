export default {
  name: "verify:no-empty-zero-settlement",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-empty-zero-settlement.mjs"]);
  },
};
