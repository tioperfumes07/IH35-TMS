export default {
  name: "verify-settlement-reversal-atomicity",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-settlement-reversal-atomicity.mjs"]) !== 0) {
      process.exit(1);
    }
  },
};
