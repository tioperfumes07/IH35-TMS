export default {
  name: "verify:cargo-claim-intake",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cargo-claim-intake.mjs"]);
  },
};
