export default {
  name: "verify-settlement-reversal-atomicity",
  run(ctx) {
    if (
      ctx.run("node", ["scripts/verify-settlement-reversal-atomicity.mjs"]) !==
      0
    ) {
      throw new Error("verify-settlement-reversal-atomicity failed");
    }
    if (
      ctx.run("node", [
        "scripts/verify-settlement-reversal-atomicity.mjs",
        "--selftest",
      ]) !== 0
    ) {
      throw new Error("verify-settlement-reversal-atomicity selftest failed");
    }
  },
};
