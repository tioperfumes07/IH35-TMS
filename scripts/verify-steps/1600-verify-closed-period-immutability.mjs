export default {
  name: "verify:closed-period-immutability",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-closed-period-immutability.mjs"]);
  },
};
