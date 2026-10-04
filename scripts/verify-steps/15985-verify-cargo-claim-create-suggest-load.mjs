export default {
  name: "verify:cargo-claim-create-suggest-load",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cargo-claim-create-suggest-load.mjs"]);
  },
};
