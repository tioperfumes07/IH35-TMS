export default {
  name: "verify:bill-resolver-single-source",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bill-resolver-single-source.mjs"]);
  },
};
