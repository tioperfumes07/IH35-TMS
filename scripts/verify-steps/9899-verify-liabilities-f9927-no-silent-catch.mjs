export default {
  name: "verify:liabilities-f9927-no-silent-catch",
  run(ctx) {
    ctx.run("node", ["scripts/verify-liabilities-f9927-no-silent-catch.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-liabilities-f9927-no-silent-catch.mjs"]);
  },
};
