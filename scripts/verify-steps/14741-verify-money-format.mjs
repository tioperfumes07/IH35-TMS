export default {
  name: "verify:money-format",
  run(ctx) {
    ctx.run("node", ["scripts/verify-money-format.mjs"]);
  },
};
