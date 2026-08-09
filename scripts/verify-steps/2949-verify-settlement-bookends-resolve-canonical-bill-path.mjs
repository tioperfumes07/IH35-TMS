export default {
  name: "verify:settlement-bookends-resolve-canonical-bill-path",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlement-bookends-resolve-canonical-bill-path.mjs"]);
  },
};
