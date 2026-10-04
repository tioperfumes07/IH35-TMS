export default {
  name: "verify:money-input-format",
  run(ctx) {
    ctx.run("node", ["scripts/verify-money-input-format.mjs"]);
  },
};
