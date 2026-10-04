export default {
  name: "verify:settlement-dispute-creates-adjustment",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlement-dispute-creates-adjustment.mjs"]);
  },
};
