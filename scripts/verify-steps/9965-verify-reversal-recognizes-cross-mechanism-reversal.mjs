export default {
  name: "verify:reversal-recognizes-cross-mechanism-reversal",
  run(ctx) {
    ctx.run("node", ["scripts/verify-reversal-recognizes-cross-mechanism-reversal.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-reversal-recognizes-cross-mechanism-reversal.mjs"]);
  },
};
