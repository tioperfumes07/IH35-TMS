export default {
  name: "verify:settlement-escrow-cap",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlement-escrow-cap.mjs"]);
  },
};
