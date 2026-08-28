export default {
  name: "verify:cash-advances-f9930-no-silent-catch",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cash-advances-f9930-no-silent-catch.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-cash-advances-f9930-no-silent-catch.mjs"]);
  },
};
