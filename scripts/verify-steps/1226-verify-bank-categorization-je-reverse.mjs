export default {
  name: "verify:bank-categorization-je-reverse",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bank-categorization-je-reverse.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-bank-categorization-je-reverse.mjs"]);
  },
};
